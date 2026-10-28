import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Empresa } from "@/lib/empresas";
import type { EstadoLinea } from "./tipos";

export type CuentaExtracto = {
  id: string;
  nombre: string;
  banco: string | null;
  tipo: string;
  empresa: Empresa;
  activa: boolean;
  formato_extracto: unknown;
};

export async function listarCuentas(): Promise<CuentaExtracto[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("cuentas_bancarias").select("id, nombre, banco, tipo, empresa, activa, formato_extracto").order("nombre");
  return (data ?? []) as CuentaExtracto[];
}

export type ResumenExtracto = {
  id: string;
  cuenta: string;
  desde: string;
  hasta: string;
  saldo_final: number | null;
  archivo_nombre: string;
  creado_en: string;
  lineas: number;
  pendientes: number;
};

export async function listarExtractos(): Promise<ResumenExtracto[]> {
  const supabase = await crearClienteServidor();
  const [{ data: extractos, error }, { data: lineas }] = await Promise.all([
    supabase.from("extractos").select("id, desde, hasta, saldo_final, archivo_nombre, creado_en, cuenta:cuentas_bancarias(nombre)").order("hasta", { ascending: false }).limit(200),
    supabase.from("extracto_lineas").select("extracto_id, estado").limit(50000),
  ]);
  if (error) throw new Error(`No se pudieron leer los extractos: ${error.message}`);
  const conteo = new Map<string, { lineas: number; pendientes: number }>();
  for (const l of lineas ?? []) {
    const c = conteo.get(l.extracto_id) ?? { lineas: 0, pendientes: 0 };
    c.lineas++;
    if (l.estado === "pendiente") c.pendientes++;
    conteo.set(l.extracto_id, c);
  }
  return (extractos ?? []).map((e) => ({
    id: e.id,
    cuenta: (e.cuenta as unknown as { nombre: string } | null)?.nombre ?? "",
    desde: e.desde,
    hasta: e.hasta,
    saldo_final: e.saldo_final === null ? null : Number(e.saldo_final),
    archivo_nombre: e.archivo_nombre,
    creado_en: e.creado_en,
    ...(conteo.get(e.id) ?? { lineas: 0, pendientes: 0 }),
  }));
}

/** Movimiento de Financiero tal como se muestra al conciliar. */
export type MovimientoParaConciliar = {
  id: string;
  empresa: Empresa;
  tipo: "ingreso" | "egreso";
  monto: number;
  fecha: string | null;
  descripcion: string;
  contraparte: string | null;
  estado: "real" | "pendiente" | "proyectado";
  medio_pago: string;
  categoria: string;
};

export type LineaConciliacion = {
  id: string;
  fecha: string;
  concepto: string;
  referencia: string | null;
  monto: number;
  saldo: number | null;
  estado: EstadoLinea;
  nota: string | null;
  movimiento: MovimientoParaConciliar | null;
  // Movimientos con el mismo importe y tipo, del más cercano en fecha al más lejano.
  candidatos: MovimientoParaConciliar[];
  sugerido: string | null;
};

/** Días de diferencia para sugerir automáticamente un movimiento. */
const DIAS_SUGERENCIA = 10;
/** Ventana para buscar candidatos alrededor del período del extracto. */
const DIAS_VENTANA = 45;

const dias = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Medios de pago que pasan por cada tipo de cuenta (para "en Financiero y no en el banco"). */
const MEDIOS_POR_CUENTA: Record<string, string[]> = {
  cuenta_corriente: ["transferencia", "tarjeta", "cheque", "cheque_emitido", "cheque_a_emitir", "cheque_a_cobrar"],
  caja_ahorro: ["transferencia", "tarjeta"],
  billetera: ["mercado_pago"],
  efectivo: ["efectivo"],
};

type FilaTransaccion = {
  id: string;
  empresa: Empresa;
  tipo: "ingreso" | "egreso";
  monto: number | string;
  fecha: string | null;
  descripcion: string;
  contraparte: string | null;
  estado: "real" | "pendiente" | "proyectado";
  medio_pago: string;
  categoria: { nombre: string } | null;
};

const aMovimiento = (t: FilaTransaccion): MovimientoParaConciliar => ({
  id: t.id,
  empresa: t.empresa,
  tipo: t.tipo,
  monto: Number(t.monto),
  fecha: t.fecha,
  descripcion: t.descripcion,
  contraparte: t.contraparte,
  estado: t.estado,
  medio_pago: t.medio_pago,
  categoria: t.categoria?.nombre ?? "",
});

/** El extracto con sus líneas, los candidatos de cada una y lo que está en Financiero pero no en el banco. */
export async function obtenerConciliacion(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data: extracto } = await supabase
    .from("extractos")
    .select("id, cuenta_id, desde, hasta, saldo_inicial, saldo_final, archivo_nombre, archivo_path, origen, cuenta:cuentas_bancarias(id, nombre, banco, tipo, empresa)")
    .eq("id", id)
    .maybeSingle();
  if (!extracto) return null;
  const cuenta = extracto.cuenta as unknown as { id: string; nombre: string; banco: string | null; tipo: string; empresa: Empresa };

  const campos = "id, empresa, tipo, monto, fecha, descripcion, contraparte, estado, medio_pago, categoria:categorias(nombre)";
  const [{ data: lineas, error }, { data: conFecha }, { data: sinFecha }, { data: vinculadas }] = await Promise.all([
    supabase.from("extracto_lineas").select("id, fecha, concepto, referencia, monto, saldo, estado, nota, transaccion_id").eq("extracto_id", id).order("orden"),
    supabase
      .from("transacciones")
      .select(campos)
      .is("eliminado_en", null)
      .gte("fecha", sumarDias(extracto.desde, -DIAS_VENTANA))
      .lte("fecha", sumarDias(extracto.hasta, DIAS_VENTANA))
      .limit(10000),
    supabase.from("transacciones").select(campos).is("eliminado_en", null).is("fecha", null).neq("estado", "real").limit(2000),
    // Movimientos ya conciliados con cualquier extracto (no se ofrecen de nuevo).
    supabase.from("extracto_lineas").select("transaccion_id").not("transaccion_id", "is", null).limit(50000),
  ]);
  if (error) throw new Error(`No se pudieron leer las líneas: ${error.message}`);

  const movimientos = [...((conFecha ?? []) as unknown as FilaTransaccion[]), ...((sinFecha ?? []) as unknown as FilaTransaccion[])].map(aMovimiento);
  const porId = new Map(movimientos.map((m) => [m.id, m]));
  const usados = new Set((vinculadas ?? []).map((v) => v.transaccion_id as string));

  // Los vinculados a líneas de este extracto pueden estar fuera de la ventana: se traen aparte.
  const faltan = (lineas ?? []).map((l) => l.transaccion_id).filter((t): t is string => !!t && !porId.has(t));
  if (faltan.length) {
    const { data } = await supabase.from("transacciones").select(campos).in("id", faltan);
    for (const t of (data ?? []) as unknown as FilaTransaccion[]) porId.set(t.id, aMovimiento(t));
  }

  const sugeridos = new Set<string>();
  const resultado: LineaConciliacion[] = (lineas ?? []).map((l) => {
    const monto = Number(l.monto);
    const base = {
      id: l.id,
      fecha: l.fecha,
      concepto: l.concepto,
      referencia: l.referencia,
      monto,
      saldo: l.saldo === null ? null : Number(l.saldo),
      estado: l.estado as EstadoLinea,
      nota: l.nota,
      movimiento: l.transaccion_id ? (porId.get(l.transaccion_id) ?? null) : null,
    };
    if (l.estado !== "pendiente") return { ...base, candidatos: [], sugerido: null };
    const tipo = monto > 0 ? "ingreso" : "egreso";
    const candidatos = movimientos
      .filter((m) => !usados.has(m.id) && m.tipo === tipo && Math.abs(m.monto - Math.abs(monto)) < 0.01)
      .sort((a, b) => (a.fecha === null ? 999 : dias(a.fecha, l.fecha)) - (b.fecha === null ? 999 : dias(b.fecha, l.fecha)))
      .slice(0, 8);
    // Sugerencia: el más cercano en fecha, si está cerca y no se le sugirió a otra línea.
    const sugerido =
      candidatos.find((c) => !sugeridos.has(c.id) && (c.fecha === null ? c.estado !== "real" : dias(c.fecha, l.fecha) <= DIAS_SUGERENCIA))?.id ?? null;
    if (sugerido) sugeridos.add(sugerido);
    return { ...base, candidatos, sugerido };
  });

  // En Financiero, cobrado/pagado en el período por un medio que pasa por esta cuenta, y sin conciliar.
  const medios = MEDIOS_POR_CUENTA[cuenta.tipo] ?? [];
  const sinBanco = movimientos
    .filter((m) => m.estado === "real" && m.fecha && m.fecha >= extracto.desde && m.fecha <= extracto.hasta && medios.includes(m.medio_pago) && !usados.has(m.id))
    .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));

  return {
    extracto: {
      id: extracto.id,
      desde: extracto.desde,
      hasta: extracto.hasta,
      saldoInicial: extracto.saldo_inicial === null ? null : Number(extracto.saldo_inicial),
      saldoFinal: extracto.saldo_final === null ? null : Number(extracto.saldo_final),
      archivo: extracto.archivo_nombre,
      tieneArchivo: !!extracto.archivo_path,
      origen: extracto.origen,
    },
    cuenta,
    lineas: resultado,
    sinBanco,
  };
}
export type Conciliacion = NonNullable<Awaited<ReturnType<typeof obtenerConciliacion>>>;
