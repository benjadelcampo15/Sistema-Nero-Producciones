import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { sumar } from "@/lib/formato";
import { CAMPOS_TRANSACCION, calcularTotales, normalizarTransacciones } from "@/lib/financiero/consultas";
import type { Transaccion } from "@/lib/financiero/tipos";
import type { Empresa } from "@/lib/empresas";
import { ESTADOS_EVENTO, type Balance, type EstadoEvento, type Evento, type EventoConBalance } from "./tipos";
import { PLANILLA_VACIA, esquemaPlanilla, type Planilla } from "./planilla";
import type { Caja } from "./cajas";

const CAMPOS_EVENTO = "id, empresa, nombre, fecha, lugar, estado, presupuesto, notas, planilla_en_financiero";

type FilaBalance = { evento_id: string; ingresos: number; egresos: number; movimientos: number };

function aBalance(fila?: FilaBalance): Balance {
  const ingresos = Number(fila?.ingresos ?? 0);
  const egresos = Number(fila?.egresos ?? 0);
  return { ingresos, egresos, resultado: sumar([ingresos, -egresos]), movimientos: Number(fila?.movimientos ?? 0) };
}

function aEvento(fila: Evento): Evento {
  return { ...fila, presupuesto: fila.presupuesto === null ? null : Number(fila.presupuesto) };
}

export function leerEstado(valor: unknown): EstadoEvento | undefined {
  return ESTADOS_EVENTO.find((e) => e === valor);
}

export async function listarEventos(empresa: Empresa, estado?: EstadoEvento): Promise<EventoConBalance[]> {
  const supabase = await crearClienteServidor();
  let consulta = supabase.from("eventos").select(CAMPOS_EVENTO).eq("empresa", empresa).order("fecha", { ascending: false });
  if (estado) consulta = consulta.eq("estado", estado);

  const [{ data: eventos, error }, { data: balances }] = await Promise.all([
    consulta,
    supabase.from("balance_eventos").select("evento_id, ingresos, egresos, movimientos"),
  ]);
  if (error) throw new Error(`No se pudieron leer los eventos: ${error.message}`);

  const porEvento = new Map(((balances ?? []) as FilaBalance[]).map((b) => [b.evento_id, b]));
  return ((eventos ?? []) as Evento[]).map((e) => ({ ...aEvento(e), balance: aBalance(porEvento.get(e.id)) }));
}

export async function obtenerEvento(id: string): Promise<Evento | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("eventos").select(CAMPOS_EVENTO).eq("id", id).maybeSingle();
  return data ? aEvento(data as Evento) : null;
}

export type DesgloseCategoria = { categoria: string; total: number };

function desglosar(transacciones: Transaccion[], tipo: Transaccion["tipo"]): DesgloseCategoria[] {
  const totales = new Map<string, number[]>();
  for (const t of transacciones.filter((t) => t.tipo === tipo)) {
    totales.set(t.categoria.nombre, [...(totales.get(t.categoria.nombre) ?? []), t.monto]);
  }
  return [...totales.entries()]
    .map(([categoria, montos]) => ({ categoria, total: sumar(montos) }))
    .sort((a, b) => b.total - a.total);
}

/** Evento con sus movimientos, totales y desglose por categoría. */
export async function obtenerDetalleEvento(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  // En paralelo: evento y movimientos en una sola ida y vuelta a la base.
  const [evento, { data, error }] = await Promise.all([
    obtenerEvento(id),
    supabase
      .from("transacciones")
      .select(CAMPOS_TRANSACCION)
      .eq("evento_id", id)
      .is("eliminado_en", null)
      .order("fecha", { ascending: false })
      .order("creado_en", { ascending: false }),
  ]);
  if (!evento) return null;
  if (error) throw new Error(`No se pudieron leer los movimientos: ${error.message}`);

  const transacciones = normalizarTransacciones(data);
  const totales = calcularTotales(transacciones);

  return {
    evento,
    transacciones,
    totales,
    desglose: { ingresos: desglosar(transacciones, "ingreso"), egresos: desglosar(transacciones, "egreso") },
  };
}

/** La planilla del evento (resumen, ingresos, gastos por sector y entradas). */
export async function obtenerPlanillaEvento(eventoId: string): Promise<Planilla> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("planillas_evento").select("datos").eq("evento_id", eventoId).maybeSingle();
  const datos = esquemaPlanilla.safeParse(data?.datos ?? {});
  return datos.success ? datos.data : PLANILLA_VACIA;
}

/** Las cajas del evento, en el orden en que se crearon. */
export async function cajasDeEvento(eventoId: string): Promise<Caja[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("cajas_evento")
    .select("id, nombre, responsable, monto_inicial, monto_fudo, efectivo_final, billetes, fudo_posnet, posnet_cierre, notas, cerrada_en, orden")
    .eq("evento_id", eventoId)
    .order("orden");
  const numero = (v: unknown) => (v === null ? null : Number(v));
  return (data ?? []).map((c) => ({
    ...c,
    monto_inicial: Number(c.monto_inicial),
    monto_fudo: numero(c.monto_fudo),
    efectivo_final: numero(c.efectivo_final),
    fudo_posnet: numero(c.fudo_posnet),
    posnet_cierre: numero(c.posnet_cierre),
  })) as Caja[];
}

/**
 * Los eventos "de hoy": el día del evento y el siguiente (un evento del 31
 * sigue en "Hoy" el 1 y sale el 2). Los cancelados no.
 */
export async function eventosDeHoy(hoy: string): Promise<Evento[]> {
  const ayer = new Date(`${hoy}T12:00:00Z`);
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("eventos")
    .select(CAMPOS_EVENTO)
    .gte("fecha", ayer.toISOString().slice(0, 10))
    .lte("fecha", hoy)
    .neq("estado", "cancelado")
    .order("fecha");
  return ((data ?? []) as Evento[]).map(aEvento);
}
