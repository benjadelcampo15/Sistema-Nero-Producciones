"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { exigirAdmin, exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatoPesos, hoy, parsearMonto } from "@/lib/formato";
import { EMPRESAS } from "@/lib/empresas";
import { ESTADOS_EVENTO, type EstadoEvento } from "./tipos";
import { PLANILLA_VACIA, esquemaPlanilla, totalGasto, type Planilla } from "./planilla";
import { conPagosDeCuenta, cuentaDeGastos } from "./cuenta-gastos";
import { planillaDesdeMovimientos } from "./desde-movimientos";
import { movimientosDePlanilla, type Categoria } from "./a-financiero";

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
  await exigirPermiso("eventos", "editar");
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

  const fila = { ...datos.data, presupuesto };
  const supabase = await crearClienteServidor();
  let anterior: EstadoEvento | null = null;
  if (id) {
    const { data: actual } = await supabase.from("eventos").select("estado").eq("id", id).maybeSingle();
    anterior = (actual?.estado as EstadoEvento | undefined) ?? null;
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

  redirect(`/eventos/${data[0].id}`);
}

/**
 * Guarda la planilla entera del evento. En los eventos nuevos, además, sus
 * ingresos y gastos quedan como movimientos del evento en Financiero.
 * Devuelve la planilla guardada (con el id de cada renglón).
 */
export async function guardarPlanillaEvento(eventoId: string, datos: unknown): Promise<{ error?: string; planilla?: Planilla }> {
  await exigirPermiso("eventos", "editar");
  if (!/^[0-9a-f-]{36}$/i.test(eventoId)) return { error: "Evento inválido" };
  const validos = esquemaPlanilla.safeParse(datos);
  if (!validos.success) return { error: "Datos inválidos: revisá los montos" };
  const enPantalla: Planilla = {
    ...validos.data,
    ingresos: validos.data.ingresos.map((i) => ({ ...i, id: i.id || randomUUID() })),
    gastos: validos.data.gastos.map((g) => ({ ...g, id: g.id || randomUUID() })),
  };

  // Gastos vinculados a la cuenta corriente de un proveedor: lo pagado desde la
  // cuenta se ve sumado en la seña, pero se guarda aparte (ya es un pago propio).
  const cuentas = await cuentaDeGastos(eventoId);
  const ids = new Set(enPantalla.gastos.map((g) => g.id));
  for (const [id, e] of cuentas) {
    if (e.pagado > 0 && !ids.has(id)) {
      return { error: `Un gasto que sacaste tiene ${formatoPesos(e.pagado)} pagados desde la cuenta corriente del proveedor: eliminá primero ese pago` };
    }
  }
  const gastos: Planilla["gastos"] = [];
  for (const g of enPantalla.gastos) {
    const e = cuentas.get(g.id!);
    const pagado = e?.pagado ?? 0;
    const nombre = g.detalle.trim() || g.sector || "sin detalle";
    if ((g.pagado_cuenta ?? 0) !== pagado) {
      return { error: `El gasto "${nombre}" recibió pagos desde la cuenta corriente mientras editabas: recargá la página para verlos y volvé a hacer los cambios` };
    }
    if (pagado > 0) {
      if ((g.proveedor_id ?? null) !== e!.proveedor_id) {
        return { error: `El gasto "${nombre}" tiene ${formatoPesos(pagado)} pagados desde la cuenta corriente: para cambiar o quitar el proveedor, eliminá primero esos pagos` };
      }
      if (g.sena < pagado || totalGasto(g) < pagado) {
        return { error: `El gasto "${nombre}" tiene ${formatoPesos(pagado)} pagados desde la cuenta corriente: el total y la seña / pagado no pueden ser menores` };
      }
    }
    const resto = { ...g, sena: Math.round((g.sena - pagado) * 100) / 100 };
    delete resto.pagado_cuenta;
    gastos.push(resto);
  }
  const planilla: Planilla = { ...enPantalla, gastos };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("planillas_evento").upsert({ evento_id: eventoId, datos: planilla }, { onConflict: "evento_id" });
  if (error) return { error: "No se pudo guardar la planilla" };

  // Solo un evento CERRADO pasa a Financiero (y se actualizan sus movimientos, sin crear otros).
  const { data: evento } = await supabase.from("eventos").select("estado, planilla_en_financiero").eq("id", eventoId).maybeSingle();
  if (evento?.planilla_en_financiero && evento.estado === "cerrado") {
    const r = await sincronizarEvento(supabase, eventoId, planilla);
    if (r.error) return { error: `La planilla se guardó, pero no se pudo actualizar Financiero.${r.error} Corregilo y volvé a guardar.`, planilla: conPagosDeCuenta(planilla, cuentas) };
  }
  return { planilla: conPagosDeCuenta(planilla, await cuentaDeGastos(eventoId)) };
}

type Supabase = Awaited<ReturnType<typeof crearClienteServidor>>;

/**
 * Pasa la planilla del evento (cerrado) a Financiero: cada renglón con su
 * referencia, así nunca se duplica. Deja registrado si salió bien o con error.
 */
async function sincronizarEvento(supabase: Supabase, eventoId: string, planilla?: Planilla): Promise<{ error?: string }> {
  const [{ data: evento }, { data: categorias }, guardada] = await Promise.all([
    supabase.from("eventos").select("fecha").eq("id", eventoId).maybeSingle(),
    supabase.from("categorias").select("id, nombre, tipo").eq("activa", true),
    planilla ? Promise.resolve(null) : supabase.from("planillas_evento").select("datos").eq("evento_id", eventoId).maybeSingle(),
  ]);
  if (!evento) return { error: " El evento no existe." };
  let p = planilla;
  if (!p) {
    const leida = esquemaPlanilla.safeParse(guardada?.data?.datos ?? {});
    p = leida.success ? leida.data : PLANILLA_VACIA;
  }
  const { error } = await supabase.rpc("sincronizar_planilla", {
    p_evento_id: eventoId,
    p_movimientos: movimientosDePlanilla(p, evento, (categorias ?? []) as Categoria[], hoy()),
  });
  if (error) {
    const motivo = /proveedor|cuenta corriente|pagos|cerrado/.test(error.message)
      ? ` ${error.message.replace(/\$([\d,]+\.\d{2})/g, (_, n: string) => formatoPesos(Number(n.replace(/,/g, ""))))}.`
      : "";
    await supabase.rpc("marcar_sync_evento", { p_evento_id: eventoId, p_ok: false, p_error: error.message });
    return { error: motivo || " Error al registrar los movimientos." };
  }
  // Proveedores vinculados con saldo a favor: se aplica a los gastos del evento.
  if (p.gastos.some((g) => g.proveedor_id)) await supabase.rpc("aplicar_saldo_evento", { p_evento_id: eventoId });
  await supabase.rpc("marcar_sync_evento", { p_evento_id: eventoId, p_ok: true });
  return {};
}

/** Cambia el estado: al cerrar sincroniza con Financiero; al reabrir o cancelar pausa lo pendiente de la planilla. */
async function aplicarEstado(supabase: Supabase, id: string, estado: EstadoEvento): Promise<{ error?: string; pausados?: number; quedan?: number }> {
  const { data, error } = await supabase.rpc("cambiar_estado_evento", { p_evento_id: id, p_estado: estado });
  if (error) return { error: "No se pudo cambiar el estado del evento" };
  if (estado === "cerrado") {
    const { data: evento } = await supabase.from("eventos").select("planilla_en_financiero").eq("id", id).maybeSingle();
    if (evento?.planilla_en_financiero) {
      const r = await sincronizarEvento(supabase, id);
      if (r.error) return { error: `El evento quedó cerrado, pero la sincronización con Financiero no se completó.${r.error} Revisalo y tocá "Reintentar".` };
    }
    return {};
  }
  const r = (data ?? {}) as { pausados?: number; quedan?: number };
  return { pausados: r.pausados ?? 0, quedan: r.quedan ?? 0 };
}

/** Cambio de estado desde la pantalla del evento (con la confirmación del lado de la pantalla). */
export async function cambiarEstadoEvento(id: string, estado: EstadoEvento): Promise<{ error?: string; ok?: string }> {
  await exigirPermiso("eventos", "editar");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !ESTADOS_EVENTO.includes(estado)) return { error: "Datos inválidos" };
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
  await exigirPermiso("eventos", "editar");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Evento inválido" };
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
  await exigirPermiso("eventos", "editar");
  if (!/^[0-9a-f-]{36}$/i.test(eventoId)) return { error: "Evento inválido" };
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
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("borrar_evento", { p_id: id });
  if (error) return { error: "No se pudo borrar el evento" };
  redirect("/eventos");
}
