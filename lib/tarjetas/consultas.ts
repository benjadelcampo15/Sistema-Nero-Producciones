import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { calcularTotales, controlar, type MovimientoTarjeta, type Regla, type Totales } from "./tipos";

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const COLUMNAS_RESUMEN =
  "id, tarjeta, fecha_cierre, vencimiento, cotizacion_usd, saldo_anterior_ars, saldo_anterior_usd, saldo_actual_ars, saldo_actual_usd, total_consumos_ars, total_consumos_usd, archivo_nombre, archivo_path, transacciones, financiero_en";

function aResumen(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    tarjeta: r.tarjeta as string,
    fecha_cierre: r.fecha_cierre as string,
    vencimiento: (r.vencimiento as string | null) ?? null,
    cotizacion_usd: n(r.cotizacion_usd),
    saldo_anterior_ars: n(r.saldo_anterior_ars),
    saldo_anterior_usd: n(r.saldo_anterior_usd),
    saldo_actual_ars: n(r.saldo_actual_ars),
    saldo_actual_usd: n(r.saldo_actual_usd),
    total_consumos_ars: n(r.total_consumos_ars),
    total_consumos_usd: n(r.total_consumos_usd),
    archivo_nombre: (r.archivo_nombre as string | null) ?? null,
    archivo_path: (r.archivo_path as string | null) ?? null,
    transacciones: (r.transacciones as string[] | null) ?? [],
    financiero_en: (r.financiero_en as string | null) ?? null,
  };
}
export type ResumenTarjeta = ReturnType<typeof aResumen>;

function aMovimiento(m: Record<string, unknown>): MovimientoTarjeta {
  return {
    id: m.id as string,
    orden: m.orden as number,
    fecha: (m.fecha as string | null) ?? null,
    descripcion: m.descripcion as string,
    cupon: (m.cupon as string | null) ?? null,
    cuota: (m.cuota as number | null) ?? null,
    cuotas: (m.cuotas as number | null) ?? null,
    pesos: Number(m.pesos),
    dolares: Number(m.dolares),
    tipo: m.tipo as MovimientoTarjeta["tipo"],
    empresa: (m.empresa as MovimientoTarjeta["empresa"]) ?? null,
    detalle: (m.detalle as string | null) ?? null,
    reparto_nero: Number(m.reparto_nero),
  };
}
const COLUMNAS_MOVIMIENTO = "id, resumen_id, orden, fecha, descripcion, cupon, cuota, cuotas, pesos, dolares, tipo, empresa, detalle, reparto_nero";

export type FilaResumen = ResumenTarjeta & { totales: Totales; movimientos: number; controlOk: boolean | null };

/** Todos los resúmenes (del más nuevo al más viejo), con sus totales por empresa. */
export async function listarResumenes(): Promise<FilaResumen[]> {
  const supabase = await crearClienteServidor();
  const [{ data: resumenes }, movimientos] = await Promise.all([
    supabase.from("tarjeta_resumenes").select(COLUMNAS_RESUMEN).order("fecha_cierre", { ascending: false }),
    todosLosMovimientos(),
  ]);
  const porResumen = new Map<string, MovimientoTarjeta[]>();
  for (const m of movimientos) {
    const lista = porResumen.get(m.resumen_id) ?? [];
    lista.push(m);
    porResumen.set(m.resumen_id, lista);
  }
  return (resumenes ?? []).map((crudo) => {
    const r = aResumen(crudo);
    const lista = porResumen.get(r.id) ?? [];
    const controles = controlar(lista, r);
    return {
      ...r,
      totales: calcularTotales(lista, r.cotizacion_usd),
      movimientos: lista.length,
      controlOk: controles.length ? controles.every((c) => c.ok) : null,
    };
  });
}

/** Los movimientos de todos los resúmenes (de a 1000, el máximo por consulta). */
async function todosLosMovimientos() {
  const supabase = await crearClienteServidor();
  const todos: (MovimientoTarjeta & { resumen_id: string })[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await supabase
      .from("tarjeta_movimientos")
      .select(COLUMNAS_MOVIMIENTO)
      .order("resumen_id")
      .order("orden")
      .range(desde, desde + 999);
    for (const m of data ?? []) todos.push({ ...aMovimiento(m), resumen_id: m.resumen_id as string });
    if (!data || data.length < 1000) break;
  }
  return todos;
}

export async function obtenerResumen(id: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("tarjeta_resumenes").select(COLUMNAS_RESUMEN).eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: movimientos } = await supabase.from("tarjeta_movimientos").select(COLUMNAS_MOVIMIENTO).eq("resumen_id", id).order("orden");
  const resumen = aResumen(data);
  const lista = (movimientos ?? []).map(aMovimiento);
  return { resumen, movimientos: lista, totales: calcularTotales(lista, resumen.cotizacion_usd), controles: controlar(lista, resumen) };
}

/** Resúmenes con sus movimientos, para el Excel (uno o todos los de un año). */
export async function resumenesParaExcel(filtro: { id?: string; anio?: number }) {
  const supabase = await crearClienteServidor();
  let q = supabase.from("tarjeta_resumenes").select(COLUMNAS_RESUMEN).order("fecha_cierre");
  if (filtro.id) q = q.eq("id", filtro.id);
  else if (filtro.anio) q = q.gte("fecha_cierre", `${filtro.anio}-01-01`).lte("fecha_cierre", `${filtro.anio}-12-31`);
  const { data } = await q;
  const resumenes = (data ?? []).map(aResumen);
  if (!resumenes.length) return [];
  const movimientos = await todosLosMovimientos();
  return resumenes.map((r) => ({ resumen: r, movimientos: movimientos.filter((m) => m.resumen_id === r.id) }));
}

export async function listarReglas(): Promise<Regla[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("tarjeta_reglas").select("id, clave, empresa, detalle, ambigua").order("clave");
  return (data ?? []) as Regla[];
}

/** Nombres de tarjetas ya usados y la última cotización cargada (para sugerirlos al subir). */
export async function datosParaSubir() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("tarjeta_resumenes").select("tarjeta, cotizacion_usd").order("fecha_cierre", { ascending: false }).limit(50);
  const tarjetas = [...new Set((data ?? []).map((r) => r.tarjeta as string))];
  const cotizacion = n((data ?? []).find((r) => r.cotizacion_usd !== null)?.cotizacion_usd);
  return { tarjetas, cotizacion };
}

/** Detalles ya usados, para sugerirlos al escribir. */
export async function detallesUsados() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("tarjeta_reglas").select("detalle").not("detalle", "is", null);
  return [...new Set((data ?? []).map((r) => r.detalle as string))].sort();
}
