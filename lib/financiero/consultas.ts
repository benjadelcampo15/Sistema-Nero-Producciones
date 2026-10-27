import "server-only";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { mesActual, sumar } from "@/lib/formato";
import {
  EMPRESAS,
  ESTADOS_MOVIMIENTO,
  TIPOS,
  type Categoria,
  type EventoResumido,
  type Totales,
  type Transaccion,
  type ChequeDeMovimiento,
} from "./tipos";

export const LIMITE_LISTADO = 2000;

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const esquemaFiltros = z.object({
  empresa: z.enum(EMPRESAS).catch("nero").default("nero"),
  desde: fecha.optional().catch(undefined),
  hasta: fecha.optional().catch(undefined),
  tipo: z.enum(TIPOS).optional().catch(undefined),
  estado: z.enum(ESTADOS_MOVIMIENTO).optional().catch(undefined),
  categoria: z.uuid().optional().catch(undefined),
  evento: z.union([z.uuid(), z.literal("sin")]).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});

export type Filtros = z.infer<typeof esquemaFiltros> & { desde: string; hasta: string };

/** Lee los filtros de la URL; por defecto, el mes actual. */
export function leerFiltros(params: Record<string, string | string[] | undefined>): Filtros {
  const plano = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v || undefined]),
  );
  const filtros = esquemaFiltros.parse(plano);
  const mes = mesActual();
  return { ...filtros, desde: filtros.desde ?? mes.desde, hasta: filtros.hasta ?? mes.hasta };
}

export const CAMPOS_TRANSACCION =
  "id, empresa, tipo, monto, fecha, descripcion, contraparte, medio_pago, estado, facturado, iva, iibb, notas, categoria:categorias(id, nombre), evento:eventos(id, nombre)";

/** PostgREST devuelve los numeric como texto o número según el caso: se normalizan. */
export function normalizarTransacciones(filas: unknown[] | null): Transaccion[] {
  return ((filas ?? []) as Transaccion[]).map((t) => ({
    ...t,
    monto: Number(t.monto),
    iva: t.iva === null ? null : Number(t.iva),
    iibb: t.iibb === null ? null : Number(t.iibb),
  }));
}

export async function obtenerTransacciones(filtros: Filtros) {
  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("transacciones")
    .select(CAMPOS_TRANSACCION)
    .is("eliminado_en", null)
    .gte("fecha", filtros.desde)
    .lte("fecha", filtros.hasta)
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(LIMITE_LISTADO + 1);

  consulta = aplicarFiltros(consulta, filtros);

  const { data, error } = await consulta;
  if (error) throw new Error(`No se pudieron leer los movimientos: ${error.message}`);

  const filas = normalizarTransacciones(data);
  const truncado = filas.length > LIMITE_LISTADO;
  const transacciones = filas.slice(0, LIMITE_LISTADO);

  return { transacciones, truncado, totales: calcularTotales(transacciones) };
}

/** Movimientos sin fecha (con los mismos filtros, salvo las fechas): no entran al cashflow. */
export async function obtenerSinFecha(filtros: Filtros) {
  const supabase = await crearClienteServidor();
  const consulta = aplicarFiltros(
    supabase.from("transacciones").select(CAMPOS_TRANSACCION).is("eliminado_en", null).is("fecha", null).order("creado_en", { ascending: false }).limit(LIMITE_LISTADO),
    filtros,
  );
  const { data, error } = await consulta;
  if (error) throw new Error(`No se pudieron leer los movimientos sin fecha: ${error.message}`);
  const transacciones = normalizarTransacciones(data);
  return { transacciones, totales: calcularTotales(transacciones) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- el tipo del query builder de supabase es muy profundo
function aplicarFiltros<T extends { eq: any; is: any; or: any }>(consulta: T, filtros: Filtros): T {
  consulta = consulta.eq("empresa", filtros.empresa);
  if (filtros.tipo) consulta = consulta.eq("tipo", filtros.tipo);
  if (filtros.estado) consulta = consulta.eq("estado", filtros.estado);
  if (filtros.categoria) consulta = consulta.eq("categoria_id", filtros.categoria);
  if (filtros.evento === "sin") consulta = consulta.is("evento_id", null);
  else if (filtros.evento) consulta = consulta.eq("evento_id", filtros.evento);
  if (filtros.q) {
    // Se quitan caracteres con significado en la sintaxis de filtros de PostgREST.
    const texto = filtros.q.replace(/[,()*%\\]/g, " ").trim();
    if (texto) consulta = consulta.or(`descripcion.ilike.*${texto}*,contraparte.ilike.*${texto}*`);
  }
  return consulta;
}

function totalesDe(transacciones: Pick<Transaccion, "tipo" | "monto">[]): Totales {
  const ingresos = sumar(transacciones.filter((t) => t.tipo === "ingreso").map((t) => t.monto));
  const egresos = sumar(transacciones.filter((t) => t.tipo === "egreso").map((t) => t.monto));
  return { ingresos, egresos, resultado: sumar([ingresos, -egresos]) };
}

/**
 * real: solo lo que ya se cobró/pagó (caja real).
 * total: incluye pendientes y proyectados (escenario completo).
 */
export function calcularTotales(transacciones: Pick<Transaccion, "tipo" | "monto" | "estado">[]) {
  return {
    real: totalesDe(transacciones.filter((t) => t.estado === "real")),
    total: totalesDe(transacciones),
  };
}

export async function obtenerTransaccion(id: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("transacciones")
    .select(CAMPOS_TRANSACCION)
    .eq("id", id)
    .is("eliminado_en", null)
    .maybeSingle();
  return data ? normalizarTransacciones([data])[0] : null;
}

export async function obtenerCategorias({ incluirInactivas = false } = {}) {
  const supabase = await crearClienteServidor();
  let consulta = supabase.from("categorias").select("id, nombre, tipo, activa").order("nombre");
  if (!incluirInactivas) consulta = consulta.eq("activa", true);
  const { data } = await consulta;
  return (data ?? []) as Categoria[];
}

export async function obtenerEventosResumidos() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("eventos")
    .select("id, nombre, fecha")
    .neq("estado", "cancelado")
    .order("fecha", { ascending: false })
    .limit(200);
  return (data ?? []) as EventoResumido[];
}

/** El cheque cargado desde un movimiento (si tiene). Sin permiso en Cheques, no se ve. */
export async function obtenerChequeDeMovimiento(transaccionId: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("cheques").select("numero, banco, fecha_pago, electronico, estado").eq("transaccion_id", transaccionId).maybeSingle();
  return data as ChequeDeMovimiento | null;
}
