import "server-only";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { mesActual, sumar } from "@/lib/formato";
import { TIPOS, type Categoria, type EventoResumido, type Transaccion } from "./tipos";

export const LIMITE_LISTADO = 2000;

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const esquemaFiltros = z.object({
  desde: fecha.optional().catch(undefined),
  hasta: fecha.optional().catch(undefined),
  tipo: z.enum(TIPOS).optional().catch(undefined),
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

const CAMPOS =
  "id, tipo, monto, fecha, descripcion, contraparte, medio_pago, notas, categoria:categorias(id, nombre), evento:eventos(id, nombre)";

export async function obtenerTransacciones(filtros: Filtros) {
  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("transacciones")
    .select(CAMPOS)
    .is("eliminado_en", null)
    .gte("fecha", filtros.desde)
    .lte("fecha", filtros.hasta)
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(LIMITE_LISTADO + 1);

  if (filtros.tipo) consulta = consulta.eq("tipo", filtros.tipo);
  if (filtros.categoria) consulta = consulta.eq("categoria_id", filtros.categoria);
  if (filtros.evento === "sin") consulta = consulta.is("evento_id", null);
  else if (filtros.evento) consulta = consulta.eq("evento_id", filtros.evento);
  if (filtros.q) {
    // Se quitan caracteres con significado en la sintaxis de filtros de PostgREST.
    const texto = filtros.q.replace(/[,()*%\\]/g, " ").trim();
    if (texto) consulta = consulta.or(`descripcion.ilike.*${texto}*,contraparte.ilike.*${texto}*`);
  }

  const { data, error } = await consulta;
  if (error) throw new Error(`No se pudieron leer los movimientos: ${error.message}`);

  const filas = (data ?? []) as unknown as Transaccion[];
  const truncado = filas.length > LIMITE_LISTADO;
  const transacciones = filas.slice(0, LIMITE_LISTADO).map((t) => ({ ...t, monto: Number(t.monto) }));

  return { transacciones, truncado, totales: calcularTotales(transacciones) };
}

export function calcularTotales(transacciones: Pick<Transaccion, "tipo" | "monto">[]) {
  const ingresos = sumar(transacciones.filter((t) => t.tipo === "ingreso").map((t) => t.monto));
  const egresos = sumar(transacciones.filter((t) => t.tipo === "egreso").map((t) => t.monto));
  return { ingresos, egresos, resultado: sumar([ingresos, -egresos]) };
}

export async function obtenerTransaccion(id: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("transacciones")
    .select(CAMPOS)
    .eq("id", id)
    .is("eliminado_en", null)
    .maybeSingle();
  if (!data) return null;
  const t = data as unknown as Transaccion;
  return { ...t, monto: Number(t.monto) };
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
