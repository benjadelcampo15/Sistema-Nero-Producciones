import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatoPesos, hoy } from "@/lib/formato";
import { conIngresosQuilmes } from "@/lib/quilmes/solicitudes";
import { PLANILLA_VACIA, esquemaPlanilla, type Planilla } from "./planilla";
import { movimientosDePlanilla, type Categoria } from "./a-financiero";
import type { EstadoEvento } from "./tipos";

export type Supabase = Awaited<ReturnType<typeof crearClienteServidor>>;

/** Solicitudes Quilmes del evento (para su ingreso previsto). */
export async function solicitudesParaIngreso(supabase: Supabase, eventoId: string) {
  const { data } = await supabase.from("quilmes_solicitudes").select("neto, iva, tipo_iva").eq("evento_id", eventoId);
  return (data ?? []).map((s) => ({ neto: Number(s.neto), iva: Number(s.iva), tipo_iva: s.tipo_iva as "A21" }));
}

/**
 * Pasa la planilla del evento (cerrado) a Financiero: cada renglón con su
 * referencia, así nunca se duplica. Deja registrado si salió bien o con error.
 * En Quilmes, el ingreso sale de las Solicitudes (siempre las guardadas).
 */
export async function sincronizarEvento(supabase: Supabase, eventoId: string, planilla?: Planilla): Promise<{ error?: string }> {
  const [{ data: evento }, { data: categorias }, guardada] = await Promise.all([
    supabase.from("eventos").select("fecha, tipo").eq("id", eventoId).maybeSingle(),
    supabase.from("categorias").select("id, nombre, tipo").eq("activa", true),
    planilla ? Promise.resolve(null) : supabase.from("planillas_evento").select("datos").eq("evento_id", eventoId).maybeSingle(),
  ]);
  if (!evento) return { error: " El evento no existe." };
  let p = planilla;
  if (!p) {
    const leida = esquemaPlanilla.safeParse(guardada?.data?.datos ?? {});
    p = leida.success ? leida.data : PLANILLA_VACIA;
  }
  if (evento.tipo === "quilmes") p = conIngresosQuilmes(p, await solicitudesParaIngreso(supabase, eventoId));
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
export async function aplicarEstado(supabase: Supabase, id: string, estado: EstadoEvento): Promise<{ error?: string; pausados?: number; quedan?: number }> {
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
