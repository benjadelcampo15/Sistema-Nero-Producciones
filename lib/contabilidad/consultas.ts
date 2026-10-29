import "server-only";
import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { hoy, sumar } from "@/lib/formato";
import type { Empresa } from "@/lib/empresas";
import { armarAsientos, ordenarAsientos, type ChequeContable, type MovimientoContable } from "./motor";
import {
  CLAVES_IMPUTACION,
  codigoPadre,
  compararCodigos,
  esDeResultado,
  type Asiento,
  type Aviso,
  type CuentaContable,
  type Imputaciones,
} from "./tipos";

const POR_PAGINA = 1000;

/** Trae todas las filas de una consulta de a 1000 (PostgREST corta en 1000). */
async function todas<T>(pagina: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) {
  const filas: T[] = [];
  for (let desde = 0; ; desde += POR_PAGINA) {
    const { data, error } = await pagina(desde, desde + POR_PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...((data ?? []) as T[]));
    if (!data || data.length < POR_PAGINA) return filas;
  }
}

export const listarCuentasContables = cache(async (): Promise<CuentaContable[]> => {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("cuentas_contables").select("id, codigo, nombre, imputable, activa");
  if (error) throw new Error(`No se pudo leer el plan de cuentas: ${error.message}`);
  return ((data ?? []) as CuentaContable[]).sort((a, b) => compararCodigos(a.codigo, b.codigo));
});

async function leerImputaciones(): Promise<Imputaciones> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("imputaciones").select("clave, cuenta_id");
  const mapa = Object.fromEntries((data ?? []).map((f) => [f.clave, f.cuenta_id]));
  const falta = CLAVES_IMPUTACION.find((c) => !mapa[c.clave]);
  if (falta) throw new Error(`Falta la cuenta para “${falta.nombre}” en Contabilidad → Imputación`);
  return mapa as Imputaciones;
}

/** Datos para la pantalla de imputación: categorías, cuentas bancarias y el resto de las claves. */
export async function obtenerImputacion() {
  const supabase = await crearClienteServidor();
  const [{ data: categorias }, { data: bancos }, { data: claves }] = await Promise.all([
    supabase.from("categorias").select("id, nombre, tipo, activa, cuenta_contable_id").order("nombre"),
    supabase.from("cuentas_bancarias").select("id, nombre, banco, activa, cuenta_contable_id").order("nombre"),
    supabase.from("imputaciones").select("clave, cuenta_id"),
  ]);
  return {
    categorias: (categorias ?? []) as { id: string; nombre: string; tipo: "ingreso" | "egreso"; activa: boolean; cuenta_contable_id: string | null }[],
    bancos: (bancos ?? []) as { id: string; nombre: string; banco: string | null; activa: boolean; cuenta_contable_id: string | null }[],
    claves: Object.fromEntries((claves ?? []).map((c) => [c.clave, c.cuenta_id])) as Partial<Imputaciones>,
  };
}

type FilaAsiento = {
  id: string;
  empresa: Empresa;
  fecha: string;
  descripcion: string;
  lineas: { orden: number; cuenta_id: string; debe: number | string; haber: number | string; detalle: string | null }[];
};

const aAsientoManual = (a: FilaAsiento): Asiento => ({
  id: a.id,
  empresa: a.empresa,
  fecha: a.fecha,
  descripcion: a.descripcion,
  origen: "manual",
  origenId: a.id,
  nota: null,
  lineas: [...a.lineas]
    .sort((x, y) => x.orden - y.orden)
    .map((l) => ({ cuenta_id: l.cuenta_id, debe: Number(l.debe), haber: Number(l.haber), detalle: l.detalle })),
});

export async function obtenerAsientoManual(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("asientos")
    .select("id, empresa, fecha, descripcion, lineas:asiento_lineas(orden, cuenta_id, debe, haber, detalle)")
    .eq("id", id)
    .maybeSingle();
  return data ? aAsientoManual(data as unknown as FilaAsiento) : null;
}

/**
 * Todos los asientos de una empresa hasta una fecha (automáticos y manuales),
 * en orden de libro diario, con los avisos de lo que conviene revisar.
 */
export const obtenerLibro = cache(async (empresa: Empresa, hasta: string) => {
  const supabase = await crearClienteServidor();
  // Cheques y comprobantes tienen permisos propios: se leen con la clave secreta
  // (solo los campos que hacen falta) para que la contabilidad sea la misma para todos.
  const admin = crearClienteAdmin();

  const [cuentas, imputaciones, { data: categorias }, movimientos, manuales, conciliadas, cheques, comprobantes, sinFecha, proyectados] = await Promise.all([
    listarCuentasContables(),
    leerImputaciones(),
    supabase.from("categorias").select("id, cuenta_contable_id"),
    todas<MovimientoContable>((d, h) =>
      supabase
        .from("transacciones")
        .select("id, empresa, tipo, monto, fecha, descripcion, contraparte, medio_pago, estado, facturado, iva, categoria_id, factura_id")
        .eq("empresa", empresa)
        .is("eliminado_en", null)
        .in("estado", ["real", "pendiente"])
        .not("fecha", "is", null)
        .lte("fecha", hasta)
        .order("id")
        .range(d, h),
    ),
    todas<FilaAsiento>((d, h) =>
      supabase
        .from("asientos")
        .select("id, empresa, fecha, descripcion, lineas:asiento_lineas(orden, cuenta_id, debe, haber, detalle)")
        .eq("empresa", empresa)
        .lte("fecha", hasta)
        .order("id")
        .range(d, h),
    ),
    todas<{ transaccion_id: string; cuenta: { cuenta_contable_id: string | null } | null }>((d, h) =>
      supabase.from("extracto_lineas").select("transaccion_id, cuenta:cuentas_bancarias(cuenta_contable_id)").eq("estado", "conciliada").order("id").range(d, h),
    ),
    todas<ChequeContable>((d, h) =>
      admin.from("cheques").select("id, tipo, estado, monto, fecha_pago, numero, transaccion_id").not("transaccion_id", "is", null).lte("fecha_pago", hasta).order("id").range(d, h),
    ),
    todas<{ transaccion_id: string }>((d, h) =>
      admin.from("comprobantes_emitidos").select("transaccion_id").not("transaccion_id", "is", null).order("id").range(d, h),
    ),
    supabase.from("transacciones").select("id", { count: "exact", head: true }).eq("empresa", empresa).is("eliminado_en", null).is("fecha", null).neq("estado", "proyectado"),
    supabase.from("transacciones").select("id", { count: "exact", head: true }).eq("empresa", empresa).is("eliminado_en", null).eq("estado", "proyectado").lte("fecha", hasta),
  ]);

  const { asientos: automaticos, avisos } = armarAsientos(
    movimientos.map((m) => ({ ...m, monto: Number(m.monto), iva: m.iva === null ? null : Number(m.iva) })),
    cheques.map((c) => ({ ...c, monto: Number(c.monto) })),
    {
      cuentaDeCategoria: new Map((categorias ?? []).map((c) => [c.id, c.cuenta_contable_id])),
      imputaciones,
      bancoConciliado: new Map(conciliadas.filter((l) => l.cuenta?.cuenta_contable_id).map((l) => [l.transaccion_id, l.cuenta!.cuenta_contable_id!])),
      conComprobante: new Set([...movimientos.filter((m) => m.factura_id).map((m) => m.id), ...comprobantes.map((c) => c.transaccion_id)]),
    },
  );

  const todosLosAvisos: Aviso[] = [...avisos];
  if (sinFecha.count)
    todosLosAvisos.push({ texto: "movimientos sin fecha no entran a la contabilidad hasta que se les ponga fecha", cantidad: sinFecha.count, href: `/financiero?empresa=${empresa}` });
  if (proyectados.count) todosLosAvisos.push({ texto: "movimientos proyectados no generan asiento (son estimaciones)", cantidad: proyectados.count });

  return {
    cuentas,
    cuentaPorId: new Map(cuentas.map((c) => [c.id, c])),
    asientos: ordenarAsientos([...automaticos, ...manuales.map(aAsientoManual)]),
    avisos: todosLosAvisos,
  };
});
export type Libro = Awaited<ReturnType<typeof obtenerLibro>>;

export type FilaSaldo = {
  cuenta: CuentaContable;
  nivel: number;
  inicial: number;
  debe: number;
  haber: number;
  final: number;
};

/**
 * Saldo inicial, movimientos del período y saldo final de cada cuenta (con los
 * rubros sumando a sus cuentas). Saldo positivo = deudor; negativo = acreedor.
 * Las cuentas de resultado empiezan de cero cada ejercicio (año calendario): lo
 * de años anteriores se muestra en Resultados no asignados.
 */
export function calcularSaldos(libro: Libro, desde: string, hasta: string): FilaSaldo[] {
  const inicioEjercicio = `${desde.slice(0, 4)}-01-01`;
  const noAsignados = libro.cuentas.find((c) => c.codigo === "3.2.01")?.id ?? null;
  const acumulado = new Map<string, { inicial: number[]; debe: number[]; haber: number[] }>();
  const de = (id: string) => {
    let a = acumulado.get(id);
    if (!a) acumulado.set(id, (a = { inicial: [], debe: [], haber: [] }));
    return a;
  };

  for (const asiento of libro.asientos) {
    if (asiento.fecha > hasta) continue;
    for (const l of asiento.lineas) {
      const cuenta = libro.cuentaPorId.get(l.cuenta_id);
      if (!cuenta) continue;
      if (asiento.fecha >= desde) {
        if (l.debe) de(cuenta.id).debe.push(l.debe);
        if (l.haber) de(cuenta.id).haber.push(l.haber);
      } else if (esDeResultado(cuenta.codigo) && asiento.fecha < inicioEjercicio) {
        if (noAsignados) de(noAsignados).inicial.push(l.debe - l.haber);
      } else {
        de(cuenta.id).inicial.push(l.debe - l.haber);
      }
    }
  }

  const filas = new Map<string, FilaSaldo>();
  for (const cuenta of libro.cuentas) {
    filas.set(cuenta.codigo, { cuenta, nivel: cuenta.codigo.split(".").length - 1, inicial: 0, debe: 0, haber: 0, final: 0 });
  }
  for (const [id, a] of acumulado) {
    const cuenta = libro.cuentaPorId.get(id)!;
    const inicial = sumar(a.inicial);
    const debe = sumar(a.debe);
    const haber = sumar(a.haber);
    // Suma en la cuenta y en todos sus rubros.
    for (let codigo: string | null = cuenta.codigo; codigo; codigo = codigoPadre(codigo)) {
      const f = filas.get(codigo);
      if (!f) continue;
      f.inicial = sumar([f.inicial, inicial]);
      f.debe = sumar([f.debe, debe]);
      f.haber = sumar([f.haber, haber]);
    }
  }
  for (const f of filas.values()) f.final = sumar([f.inicial, f.debe, -f.haber]);
  return [...filas.values()];
}

/** Período de los filtros: por defecto el mes actual (o el año, para los balances). */
export function leerPeriodo(params: Record<string, string | string[] | undefined>, defecto: "mes" | "anio") {
  const valor = (k: string) => (typeof params[k] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params[k] as string) ? (params[k] as string) : null);
  const fechaHoy = hoy();
  const [anio, mes] = fechaHoy.split("-");
  const finDeMes = new Date(Date.UTC(Number(anio), Number(mes), 0)).toISOString().slice(0, 10);
  const desde = valor("desde") ?? (defecto === "mes" ? `${anio}-${mes}-01` : `${anio}-01-01`);
  let hasta = valor("hasta") ?? (defecto === "mes" ? finDeMes : `${anio}-12-31`);
  if (hasta < desde) hasta = desde;
  return { desde, hasta };
}
