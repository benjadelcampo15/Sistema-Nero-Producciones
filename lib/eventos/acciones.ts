"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { exigirAdmin, obtenerUsuario } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { parsearMonto } from "@/lib/formato";
import { EMPRESAS } from "@/lib/empresas";
import { ESTADOS_EVENTO, type EstadoEvento, type TipoEvento } from "./tipos";
import { PLANILLA_VACIA, esquemaPlanilla, type Planilla } from "./planilla";
import { planillaDesdeMovimientos } from "./desde-movimientos";
import { aplicarEstado, sincronizarEvento } from "./sincronizar";
import { guardarPlanillaDelEvento, type ResultadoPlanilla } from "./guardar-planilla";
import type { Version } from "@/lib/version";
import { exigirPermisoEvento, puedeEnEvento, tipoDeEvento } from "./permiso";

/** Pantalla de un evento según su tipo. */
const rutaEvento = (tipo: TipoEvento, id?: string) => `/${tipo === "quilmes" ? "quilmes" : "eventos"}${id ? `/${id}` : ""}`;

export type EstadoFormularioEvento = { error?: string; valores?: Record<string, string> };

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const esquemaEvento = z.object({
  empresa: z.enum(EMPRESAS, "Elegí la empresa"),
  nombre: z.string().trim().min(1, "Falta el nombre").max(120),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  lugar: textoOpcional(200),
  estado: z.enum(ESTADOS_EVENTO, "Estado inválido"),
  presupuesto: z.string(),
  notas: textoOpcional(1000),
});

/** Crea (id = null) o edita un evento y vuelve a su pantalla. */
export async function guardarEvento(
  id: string | null,
  _previo: EstadoFormularioEvento,
  formData: FormData,
): Promise<EstadoFormularioEvento> {
  const usuario = await obtenerUsuario();
  // El tipo es el del evento (al editar) o el de la pantalla desde donde se crea; no se cambia.
  const tipo: TipoEvento = id ? ((await tipoDeEvento(id)) ?? "evento") : formData.get("tipo") === "quilmes" ? "quilmes" : "evento";
  if (!puedeEnEvento(usuario, tipo, "evento", "editar")) throw new Error("No tenés permiso para esta acción");
  const valores = Object.fromEntries(
    [...formData.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$")),
  ) as Record<string, string>;

  const datos = esquemaEvento.safeParse(valores);
  if (!datos.success) {
    return { error: datos.error.issues[0].message, valores };
  }

  let presupuesto: number | null = null;
  if (datos.data.presupuesto.trim()) {
    presupuesto = parsearMonto(datos.data.presupuesto);
    if (presupuesto === null) {
      return { error: "Presupuesto inválido. Ejemplo: 5.000.000", valores };
    }
  }

  const fila = { ...datos.data, presupuesto, ...(id ? {} : { tipo }) };
  const supabase = await crearClienteServidor();
  let anterior: EstadoEvento | null = null;
  if (id) {
    const { data: actual } = await supabase.from("eventos").select("estado").eq("id", id).maybeSingle();
    anterior = (actual?.estado as EstadoEvento | undefined) ?? null;
  }
  // Cerrar o reabrir mueve Financiero: en Quilmes hace falta el permiso de costos.
  if (id && anterior !== fila.estado && !puedeEnEvento(usuario, tipo, "costos", "editar")) {
    return { error: "Para cambiar el estado hace falta el permiso de costos internos de Quilmes (al cerrar, la planilla pasa a Financiero)", valores };
  }
  // Al editar, el estado no se guarda junto con lo demás: pasa por cambiarEstado (sincroniza o pausa).
  const { estado: nuevoEstado, ...resto } = fila;
  const { data, error } = id
    ? await supabase.from("eventos").update(resto).eq("id", id).select("id")
    : await supabase.from("eventos").insert(fila).select("id");

  if (error || !data?.length) {
    return { error: "No se pudo guardar el evento", valores };
  }
  if (id && anterior !== nuevoEstado) {
    const r = await aplicarEstado(supabase, id, nuevoEstado);
    if (r.error) return { error: r.error, valores };
  }
  // Los movimientos del evento van al financiero de la empresa del evento.
  if (id) {
    await supabase.from("transacciones").update({ empresa: fila.empresa }).eq("evento_id", id).neq("empresa", fila.empresa);
    // Lo pendiente de la planilla sigue la fecha del evento.
    await supabase.from("transacciones").update({ fecha: fila.fecha }).eq("evento_id", id).eq("estado", "pendiente").not("planilla_ref", "is", null).is("eliminado_en", null);
  }

  redirect(rutaEvento(tipo, data[0].id));
}

/**
 * Guarda la planilla entera de un evento común. En los eventos cerrados,
 * además, actualiza sus movimientos en Financiero. Devuelve la planilla
 * guardada (con el id de cada renglón). Los Quilmes guardan con su propia acción.
 */
export async function guardarPlanillaEvento(eventoId: string, datos: unknown, version?: Version, forzar = false): Promise<ResultadoPlanilla> {
  const { tipo } = await exigirPermisoEvento(eventoId, "costos", "editar");
  if (tipo === "quilmes") return { error: "Este es un evento Quilmes: guardalo desde su planilla" };
  return guardarPlanillaDelEvento(eventoId, datos, undefined, { version, forzar });
}

/** Cambio de estado desde la pantalla del evento (con la confirmación del lado de la pantalla). */
export async function cambiarEstadoEvento(id: string, estado: EstadoEvento): Promise<{ error?: string; ok?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !ESTADOS_EVENTO.includes(estado)) return { error: "Datos inválidos" };
  await exigirPermisoEvento(id, "costos", "editar");
  const supabase = await crearClienteServidor();
  const r = await aplicarEstado(supabase, id, estado);
  refresh();
  if (r.error) return { error: r.error };
  if (estado === "cerrado") return { ok: "Evento cerrado: sus ingresos y gastos quedaron sincronizados con Financiero." };
  if (r.pausados || r.quedan) {
    return {
      ok: `Estado cambiado. ${r.pausados ? `${r.pausados} movimiento${r.pausados === 1 ? "" : "s"} pendiente${r.pausados === 1 ? "" : "s"} del evento dej${r.pausados === 1 ? "ó" : "aron"} de contar en Financiero hasta que lo vuelvas a cerrar.` : ""}${r.quedan ? ` ${r.quedan} con pagos o cobros reales siguen en Financiero.` : ""}`,
    };
  }
  return { ok: "Estado cambiado." };
}

/** Vuelve a intentar la sincronización de un evento cerrado que quedó con error. */
export async function reintentarSincronizacion(id: string): Promise<{ error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Evento inválido" };
  await exigirPermisoEvento(id, "costos", "editar");
  const supabase = await crearClienteServidor();
  const { data: evento } = await supabase.from("eventos").select("estado").eq("id", id).maybeSingle();
  if (evento?.estado !== "cerrado") return { error: "El evento no está cerrado" };
  const r = await sincronizarEvento(supabase, id);
  refresh();
  return r.error ? { error: `No se pudo completar.${r.error}` } : {};
}

/**
 * Arma la planilla con los movimientos del evento en Financiero (ingresos y
 * gastos por sector). Conserva la alícuota, las entradas y las notas de `base`.
 * No guarda: la pantalla la muestra y se guarda con "Guardar planilla".
 */
export async function armarPlanillaDesdeMovimientos(eventoId: string, base: unknown): Promise<{ planilla?: Planilla; error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(eventoId)) return { error: "Evento inválido" };
  const { tipo } = await exigirPermisoEvento(eventoId, "costos", "editar");
  if (tipo === "quilmes") return { error: "No disponible en eventos Quilmes" };
  const actual = esquemaPlanilla.safeParse(base);
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("transacciones")
    .select("tipo, monto, iva, descripcion, contraparte, estado, facturado, categoria:categorias(nombre)")
    .eq("evento_id", eventoId)
    .is("eliminado_en", null)
    .order("fecha", { nullsFirst: false });
  if (error) return { error: "No se pudieron leer los movimientos" };
  const movimientos = (data ?? []).map((t) => ({
    ...t,
    monto: Number(t.monto),
    iva: t.iva === null ? null : Number(t.iva),
    categoria: t.categoria as unknown as { nombre: string },
  }));
  return { planilla: planillaDesdeMovimientos(movimientos, actual.success ? actual.data : PLANILLA_VACIA) };
}

/** Borra el evento (solo administradores): sus movimientos quedan, sin evento. */
export async function borrarEvento(id: string): Promise<{ error?: string }> {
  await exigirAdmin();
  const tipo = (await tipoDeEvento(id)) ?? "evento";
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("borrar_evento", { p_id: id });
  if (error) return { error: "No se pudo borrar el evento" };
  redirect(rutaEvento(tipo));
}
