import "server-only";
import { randomUUID } from "node:crypto";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatoPesos } from "@/lib/formato";
import { esquemaPlanilla, totalGasto, type Planilla } from "./planilla";
import { conPagosDeCuenta, cuentaDeGastos } from "./cuenta-gastos";
import { sincronizarEvento } from "./sincronizar";

/**
 * Guarda la planilla entera del evento (ya validado el permiso). Si el evento
 * está cerrado, actualiza sus movimientos en Financiero (sin crear otros).
 * `ajustar` completa lo que no viene de la pantalla (en Quilmes, el ingreso
 * que sale de las Solicitudes). Devuelve la planilla guardada con los ids.
 */
export async function guardarPlanillaDelEvento(
  eventoId: string,
  datos: unknown,
  ajustar?: (p: Planilla) => Planilla,
): Promise<{ error?: string; planilla?: Planilla }> {
  if (!/^[0-9a-f-]{36}$/i.test(eventoId)) return { error: "Evento inválido" };
  const validos = esquemaPlanilla.safeParse(datos);
  if (!validos.success) return { error: "Datos inválidos: revisá los montos" };
  const leida = ajustar ? ajustar(validos.data) : validos.data;
  const enPantalla: Planilla = {
    ...leida,
    ingresos: leida.ingresos.map((i) => ({ ...i, id: i.id || randomUUID() })),
    gastos: leida.gastos.map((g) => ({ ...g, id: g.id || randomUUID() })),
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
