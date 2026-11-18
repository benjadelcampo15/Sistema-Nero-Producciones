"use server";

import { refresh } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { exigirPermisoEvento, puedeEnEvento } from "@/lib/eventos/permiso";
import { guardarPlanillaDelEvento } from "@/lib/eventos/guardar-planilla";
import type { Planilla } from "@/lib/eventos/planilla";
import type { ResultadoPlanilla } from "@/lib/eventos/guardar-planilla";
import { versionDe, type Version } from "@/lib/version";
import { conIngresosQuilmes, esquemaSolicitudes, ivaSugerido, type Solicitud } from "./solicitudes";
import { datosPresupuesto, huellaPresupuesto } from "./presupuesto";

type Resultado = { error?: string };

/** Valida la tabla y recalcula el IVA de cada solicitud con su tratamiento (no se confía en lo que manda la pantalla). */
function normalizar(lista: unknown): { error?: string; solicitudes?: Solicitud[] } {
  const v = esquemaSolicitudes.safeParse(lista);
  if (!v.success) return { error: "Revisá las solicitudes: hay un dato inválido" };
  if (new Set(v.data.map((s) => s.id)).size !== v.data.length) return { error: "Hay solicitudes repetidas" };
  return { solicitudes: v.data.map((s) => ({ ...s, iva: ivaSugerido(s.neto, s.tipo_iva) })) };
}

async function guardarTabla(eventoId: string, solicitudes: Solicitud[]): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("quilmes_guardar_solicitudes", {
    p_evento_id: eventoId,
    p_lista: solicitudes.map((s, orden) => ({ ...s, orden })),
  });
  return error ? { error: "No se pudieron guardar las solicitudes" } : {};
}

async function eventoQuilmes(eventoId: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("eventos").select("tipo, estado, planilla_en_financiero").eq("id", eventoId).maybeSingle();
  return data?.tipo === "quilmes" ? data : null;
}

/**
 * Guarda Solicitudes y Gastos reales juntos (quien tiene el permiso de costos).
 * Un gasto no puede quedar apuntando a una solicitud que se quitó: la pantalla
 * pide decidir antes (conservar como adicional o reasignar), nunca se borra.
 */
export async function guardarPlanillaQuilmes(eventoId: string, lista: unknown, planilla: unknown, version?: Version, forzar = false): Promise<ResultadoPlanilla & { solicitudes?: Solicitud[] }> {
  if (!/^[0-9a-f-]{36}$/i.test(eventoId)) return { error: "Evento inválido" };
  await exigirPermisoEvento(eventoId, "evento", "editar");
  await exigirPermisoEvento(eventoId, "costos", "editar");
  if (!(await eventoQuilmes(eventoId))) return { error: "No es un evento Quilmes" };
  const n = normalizar(lista);
  if (!n.solicitudes) return { error: n.error };
  const ids = new Set(n.solicitudes.map((s) => s.id));
  const gastos = (planilla as Planilla | null)?.gastos ?? [];
  if (gastos.some((g) => g.solicitud_id && !ids.has(g.solicitud_id))) {
    return { error: "Hay gastos reales vinculados a una solicitud que quitaste: elegí si quedan como adicionales o a qué solicitud pasan" };
  }
  // Si otra persona guardó la planilla mientras se editaba, no se guarda nada (ni las solicitudes).
  if (version !== undefined && !forzar && (await versionDe(await crearClienteServidor(), "planillas_evento", { evento_id: eventoId })) !== version) {
    return { conflicto: true, error: "Otra persona guardó cambios en esta planilla mientras editabas" };
  }
  const r = await guardarTabla(eventoId, n.solicitudes);
  if (r.error) return r;
  // El ingreso previsto sale de las Solicitudes recién guardadas (y, si está cerrado, se actualiza Financiero).
  const g = await guardarPlanillaDelEvento(eventoId, planilla, (p) => conIngresosQuilmes(p, n.solicitudes!), { version, forzar });
  return { ...g, solicitudes: n.solicitudes };
}

/**
 * Guarda solo las Solicitudes (quien ve el presupuesto comercial pero no los
 * costos). No puede quitar una solicitud que tiene gastos reales vinculados ni
 * cambiar un evento cerrado (eso actualiza Financiero): lo hace alguien con permiso de costos.
 */
export async function guardarSolicitudesQuilmes(eventoId: string, lista: unknown): Promise<{ error?: string; solicitudes?: Solicitud[] }> {
  if (!/^[0-9a-f-]{36}$/i.test(eventoId)) return { error: "Evento inválido" };
  const { usuario, tipo } = await exigirPermisoEvento(eventoId, "evento", "editar");
  const evento = await eventoQuilmes(eventoId);
  if (!evento) return { error: "No es un evento Quilmes" };
  if (evento.estado === "cerrado" && evento.planilla_en_financiero) {
    return { error: "El evento está cerrado y su presupuesto ya está en Financiero: lo modifica alguien con permiso de costos internos" };
  }
  const n = normalizar(lista);
  if (!n.solicitudes) return { error: n.error };
  const supabase = await crearClienteServidor();
  const [{ data: vinculados }, { data: actuales }] = await Promise.all([
    supabase.rpc("quilmes_gastos_por_solicitud", { p_evento_id: eventoId }),
    supabase.from("quilmes_solicitudes").select("id, detalle").eq("evento_id", eventoId),
  ]);
  const ids = new Set(n.solicitudes.map((s) => s.id));
  const conGastos = ((vinculados ?? []) as { solicitud_id: string; gastos: number }[]).filter((v) => !ids.has(v.solicitud_id));
  if (conGastos.length) {
    const nombres = conGastos.map((v) => `"${actuales?.find((a) => a.id === v.solicitud_id)?.detalle || "sin detalle"}"`).join(", ");
    return {
      error: `No se puede quitar ${nombres}: tiene${conGastos.length === 1 ? "" : "n"} gastos reales cargados. ${puedeEnEvento(usuario, tipo, "costos", "editar") ? "Quitala desde la planilla interna para decidir qué pasa con esos gastos." : "Pedile a alguien con permiso de costos internos que decida qué hacer con esos gastos."}`,
    };
  }
  const r = await guardarTabla(eventoId, n.solicitudes);
  if (r.error) return r;
  refresh();
  return { solicitudes: n.solicitudes };
}

/**
 * Emite el presupuesto para Quilmes: guarda una versión con SOLO el contenido
 * comercial (armado acá, desde las Solicitudes guardadas). Si no cambió nada
 * desde la última versión, devuelve esa. No crea cobros, facturas ni movimientos.
 */
export async function emitirPresupuestoQuilmes(eventoId: string): Promise<{ error?: string; version?: number; nueva?: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(eventoId)) return { error: "Evento inválido" };
  await exigirPermisoEvento(eventoId, "evento", "editar");
  const datos = await datosPresupuesto(eventoId);
  if (!datos) return { error: "No es un evento Quilmes" };
  if (!datos.items.length) return { error: "Agregá al menos una solicitud con su precio antes de generar el presupuesto" };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("quilmes_emitir_presupuesto", {
    p_evento_id: eventoId,
    p_datos: datos,
    p_huella: huellaPresupuesto(datos),
    p_total: datos.totales.total,
  });
  const fila = (data as { version: number; nueva: boolean }[] | null)?.[0];
  if (error || !fila) return { error: "No se pudo emitir el presupuesto" };
  refresh();
  return { version: fila.version, nueva: fila.nueva };
}

