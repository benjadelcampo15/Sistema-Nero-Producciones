import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import {
  MES_RUTA_VACIO,
  PRIMER_PERIODO_AUTOMATICO,
  calcularMesRuta,
  esquemaHistorico,
  esquemaMesRuta,
  periodo,
  type EventoRuta,
  type Historico,
  type MesRuta,
} from "./ruta";

export type Persona = { id: string; nombre: string; activo: boolean };

export type FilaMesRuta =
  | { periodo: string; modo: "historico"; historico: Historico; cerrado: boolean }
  | { periodo: string; modo: "automatico"; datos: MesRuta; cerrado: boolean; eventosAlCierre: EventoRuta[] | null };

type FilaBase = { periodo: string; modo: string; datos: unknown; cerrado: boolean; eventos_al_cierre: unknown };

function aFila(f: FilaBase): FilaMesRuta {
  if (f.modo === "historico") {
    const h = esquemaHistorico.safeParse(f.datos);
    if (!h.success) throw new Error(`El histórico de ${f.periodo} no tiene el formato esperado`);
    return { periodo: f.periodo, modo: "historico", historico: h.data, cerrado: true };
  }
  const d = esquemaMesRuta.safeParse(f.datos);
  return {
    periodo: f.periodo,
    modo: "automatico",
    datos: d.success ? d.data : MES_RUTA_VACIO,
    cerrado: f.cerrado,
    eventosAlCierre: Array.isArray(f.eventos_al_cierre) ? (f.eventos_al_cierre as EventoRuta[]) : null,
  };
}

export async function listarClientesRuta(): Promise<Persona[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("ruta_clientes").select("id, nombre, activo").order("nombre");
  return (data ?? []) as Persona[];
}

export async function listarColaboradoresRuta(): Promise<Persona[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("ruta_colaboradores").select("id, nombre, activo").order("nombre");
  return (data ?? []) as Persona[];
}

/** Los meses cargados de un año. */
export async function mesesRuta(anio: number) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("ruta_meses")
    .select("periodo, modo, datos, cerrado, eventos_al_cierre")
    .gte("periodo", periodo(anio, 1))
    .lte("periodo", periodo(anio, 12));
  if (error) throw new Error(`No se pudieron leer los objetivos de Ruta: ${error.message}`);
  return new Map(((data ?? []) as FilaBase[]).map((f) => [f.periodo, aFila(f)]));
}

export async function aniosRuta() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("ruta_meses").select("periodo").limit(500);
  return [...new Set((data ?? []).map((f) => Number(f.periodo.slice(0, 4))))];
}

/**
 * Balance de los eventos de Ruta entre dos fechas: el resultado de sus
 * movimientos (ingresos − egresos), como en la pantalla del evento. Se lee
 * con la clave secreta para que Objetivos no dependa del permiso de Eventos:
 * llamar solo después de verificar el permiso de Objetivos.
 */
export async function eventosRutaEntre(desde: string, hasta: string): Promise<EventoRuta[]> {
  const admin = crearClienteAdmin();
  const { data: eventos, error } = await admin
    .from("eventos")
    .select("id, nombre, fecha")
    .eq("empresa", "ruta")
    .neq("estado", "cancelado")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha");
  if (error) throw new Error(`No se pudieron leer los eventos de Ruta: ${error.message}`);
  if (!eventos?.length) return [];
  const { data: balances } = await admin.from("balance_eventos").select("evento_id, ingresos, egresos").in("evento_id", eventos.map((e) => e.id));
  const porEvento = new Map((balances ?? []).map((b) => [b.evento_id, b]));
  return eventos.map((e) => {
    const b = porEvento.get(e.id);
    const ingresos = Number(b?.ingresos ?? 0);
    const egresos = Number(b?.egresos ?? 0);
    return { id: e.id, nombre: e.nombre, fecha: e.fecha, ingresos, egresos, resultado: Math.round((ingresos - egresos) * 100) / 100 };
  });
}

const finDeMes = (anio: number, mes: number) => `${periodo(anio, mes)}-${String(new Date(Date.UTC(anio, mes, 0)).getUTCDate()).padStart(2, "0")}`;

/** Eventos de Ruta de cada mes del año (para la vista anual). */
export async function eventosRutaDelAnio(anio: number) {
  const eventos = await eventosRutaEntre(`${anio}-01-01`, `${anio}-12-31`);
  const porMes = new Map<string, EventoRuta[]>();
  for (const e of eventos) porMes.set(e.fecha.slice(0, 7), [...(porMes.get(e.fecha.slice(0, 7)) ?? []), e]);
  return porMes;
}

export const eventosRutaDelMes = (anio: number, mes: number) => eventosRutaEntre(`${periodo(anio, mes)}-01`, finDeMes(anio, mes));

/**
 * Un mes automático que todavía no se guardó: se arma copiando el último mes
 * automático anterior (clientes y colaboradores activos con sus importes y
 * porcentajes, gastos fijos y repartos). Gastos variables y one shots arrancan vacíos.
 */
export async function mesNuevoRuta(anio: number, mes: number, clientes: Persona[], colaboradores: Persona[]) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("ruta_meses")
    .select("periodo, modo, datos, cerrado, eventos_al_cierre")
    .eq("modo", "automatico")
    .lt("periodo", periodo(anio, mes))
    .order("periodo", { ascending: false })
    .limit(1)
    .maybeSingle();
  const anterior = data ? aFila(data as FilaBase) : null;
  if (!anterior || anterior.modo !== "automatico") return { datos: MES_RUTA_VACIO, copiadoDe: null };
  const activos = (lista: Persona[]) => new Set(lista.filter((p) => p.activo).map((p) => p.id));
  const clientesActivos = activos(clientes);
  const colaboradoresActivos = activos(colaboradores);
  const d = anterior.datos;
  const datos: MesRuta = {
    ...MES_RUTA_VACIO,
    fees: d.fees.filter((f) => clientesActivos.has(f.cliente_id)),
    porcentajes: d.porcentajes.filter((p) => colaboradoresActivos.has(p.colaborador_id)),
    gastos_fijos: d.gastos_fijos,
    distribucion_mensual: d.distribucion_mensual,
    distribucion_variable: d.distribucion_variable,
  };
  return { datos, copiadoDe: anterior.periodo };
}

/** Resultado de cada mes del año para la vista anual. */
export async function resumenAnioRuta(anio: number) {
  const [meses, clientes, colaboradores, eventosPorMes] = await Promise.all([
    mesesRuta(anio),
    listarClientesRuta(),
    listarColaboradoresRuta(),
    eventosRutaDelAnio(anio),
  ]);
  const nombres = {
    clientes: new Map(clientes.map((c) => [c.id, c.nombre])),
    colaboradores: new Map(colaboradores.map((c) => [c.id, c.nombre])),
  };
  return Array.from({ length: 12 }, (_, i) => {
    const p = periodo(anio, i + 1);
    const fila = meses.get(p);
    if (!fila) return { periodo: p, modo: p >= PRIMER_PERIODO_AUTOMATICO ? ("sin_cargar" as const) : ("sin_datos" as const) };
    if (fila.modo === "historico") {
      return {
        periodo: p,
        modo: "historico" as const,
        mensual: fila.historico.resultado.rentabilidad,
        observaciones: fila.historico.observaciones.length,
      };
    }
    const c = calcularMesRuta(fila.datos, nombres, fila.eventosAlCierre ?? eventosPorMes.get(p) ?? []);
    return {
      periodo: p,
      modo: "automatico" as const,
      cerrado: fila.cerrado,
      fees: c.totalFees.neto.valor,
      mensual: c.rentabilidad.valor,
      variable: c.variable.valor,
      cajaEstructura: c.cajaEstructura.valor,
      observaciones: fila.datos.observaciones.length + c.avisos.length,
    };
  });
}
