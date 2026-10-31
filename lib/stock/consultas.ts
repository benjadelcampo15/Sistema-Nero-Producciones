import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { sumar } from "@/lib/formato";
import type { Deposito, FilaStock, LineaEntrada, LineaSalida, MovimientoStock, Producto, ResumenEntrada, ResumenSalida } from "./tipos";

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function listarDepositos({ incluirInactivos = false } = {}) {
  const supabase = await crearClienteServidor();
  let consulta = supabase.from("depositos").select("id, nombre, direccion, activo").order("nombre");
  if (!incluirInactivos) consulta = consulta.eq("activo", true);
  const { data } = await consulta;
  return (data ?? []) as Deposito[];
}

export async function listarProductos({ incluirInactivos = false } = {}) {
  const supabase = await crearClienteServidor();
  let consulta = supabase.from("productos").select("id, nombre, unidad, codigo, stock_minimo, activo").order("nombre");
  if (!incluirInactivos) consulta = consulta.eq("activo", true);
  const { data } = await consulta;
  return ((data ?? []) as Producto[]).map((p) => ({ ...p, stock_minimo: Number(p.stock_minimo) }));
}

type FilaVista = { producto_id: string; deposito_id: string; cantidad: number; costo_promedio: number | null };

/** Stock de cada producto por depósito (vista general). */
export async function obtenerStock(): Promise<FilaStock[]> {
  const supabase = await crearClienteServidor();
  const [productos, { data, error }] = await Promise.all([
    listarProductos(),
    supabase.from("stock_actual").select("producto_id, deposito_id, cantidad, costo_promedio"),
  ]);
  if (error) throw new Error(`No se pudo leer el stock: ${error.message}`);

  const filas = (data ?? []) as FilaVista[];
  return productos.map((producto) => {
    const suyas = filas.filter((f) => f.producto_id === producto.id);
    const porDeposito = Object.fromEntries(suyas.map((f) => [f.deposito_id, Number(f.cantidad)]));
    const total = suyas.reduce((t, f) => t + Number(f.cantidad), 0);
    // Costo promedio general: ponderado por la cantidad en cada depósito.
    const conCosto = suyas.filter((f) => f.costo_promedio !== null && Number(f.cantidad) > 0);
    const cantidadConCosto = conCosto.reduce((t, f) => t + Number(f.cantidad), 0);
    const costoPromedio = cantidadConCosto
      ? conCosto.reduce((t, f) => t + Number(f.cantidad) * Number(f.costo_promedio), 0) / cantidadConCosto
      : null;
    const costoPorDeposito = Object.fromEntries(suyas.map((f) => [f.deposito_id, f.costo_promedio === null ? null : Number(f.costo_promedio)]));
    return { producto, porDeposito, costoPorDeposito, total, costoPromedio };
  });
}

/** Movimientos sueltos; con sinSalidas, los de una salida o entrada de varios productos no (se listan agrupados aparte). */
export async function listarMovimientos(filtros: { deposito?: string; producto?: string; sinSalidas?: boolean } = {}) {
  const supabase = await crearClienteServidor();
  let consulta = supabase
    .from("movimientos_stock")
    .select(
      "id, tipo, cantidad, costo_unitario, fecha, creado_en, motivo, transferencia_id, factura_id, salida_id, entrada_id, pedido_id, producto:productos(id, nombre, unidad), deposito:depositos(id, nombre), evento:eventos(id, nombre)",
    )
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(500);
  if (filtros.deposito) consulta = consulta.eq("deposito_id", filtros.deposito);
  if (filtros.producto) consulta = consulta.eq("producto_id", filtros.producto);
  if (filtros.sinSalidas) consulta = consulta.is("salida_id", null).is("entrada_id", null);
  const { data, error } = await consulta;
  if (error) throw new Error(`No se pudieron leer los movimientos: ${error.message}`);
  return ((data ?? []) as unknown as MovimientoStock[]).map((m) => ({
    ...m,
    cantidad: Number(m.cantidad),
    costo_unitario: n(m.costo_unitario),
  }));
}

type FilaSalida = Omit<ResumenSalida, "productos" | "costoTotal" | "sinCosto"> & {
  lineas: { cantidad: number | string; costo_unitario: number | string | null }[];
};

const CAMPOS_SALIDA = "id, fecha, creado_en, modo, motivo, deposito:depositos(id, nombre), evento:eventos(id, nombre)";

function resumir(s: FilaSalida): ResumenSalida {
  const { lineas, ...resto } = s;
  const conCosto = lineas.filter((l) => l.costo_unitario !== null);
  return {
    ...resto,
    productos: lineas.length,
    costoTotal: sumar(conCosto.map((l) => -Number(l.cantidad) * Number(l.costo_unitario))),
    sinCosto: lineas.length - conCosto.length,
  };
}

/** Salidas de varios productos (conteos de barra), de la más reciente a la más vieja. */
export async function listarSalidas(filtros: { deposito?: string } = {}) {
  const supabase = await crearClienteServidor();
  let consulta = supabase
    .from("salidas_stock")
    .select(`${CAMPOS_SALIDA}, lineas:movimientos_stock(cantidad, costo_unitario)`)
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(200);
  if (filtros.deposito) consulta = consulta.eq("deposito_id", filtros.deposito);
  const { data, error } = await consulta;
  if (error) throw new Error(`No se pudieron leer las salidas: ${error.message}`);
  return ((data ?? []) as unknown as FilaSalida[]).map(resumir);
}

export async function obtenerSalida(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("salidas_stock")
    .select(`${CAMPOS_SALIDA}, lineas:movimientos_stock(id, cantidad, costo_unitario, stock_inicial, stock_contado, producto:productos(id, nombre, unidad))`)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const fila = data as unknown as Omit<FilaSalida, "lineas"> & { lineas: LineaSalida[] };
  const lineas: LineaSalida[] = fila.lineas
    .map((l) => ({
      ...l,
      cantidad: -Number(l.cantidad),
      costo_unitario: n(l.costo_unitario),
      stock_inicial: n(l.stock_inicial),
      stock_contado: n(l.stock_contado),
    }))
    .sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre, "es"));
  return { ...resumir(fila as FilaSalida), lineas };
}
type FilaEntrada = Omit<ResumenEntrada, "productos" | "costoTotal" | "sinCosto"> & {
  lineas: { cantidad: number | string; costo_unitario: number | string | null }[];
};

const CAMPOS_ENTRADA = "id, fecha, creado_en, motivo, deposito:depositos(id, nombre), evento:eventos(id, nombre)";

function resumirEntrada(e: FilaEntrada): ResumenEntrada {
  const { lineas, ...resto } = e;
  const conCosto = lineas.filter((l) => l.costo_unitario !== null);
  return {
    ...resto,
    productos: lineas.length,
    costoTotal: sumar(conCosto.map((l) => Number(l.cantidad) * Number(l.costo_unitario))),
    sinCosto: lineas.length - conCosto.length,
  };
}

/** Entradas de varios productos, de la más reciente a la más vieja. */
export async function listarEntradas(filtros: { deposito?: string } = {}) {
  const supabase = await crearClienteServidor();
  let consulta = supabase
    .from("entradas_stock")
    .select(`${CAMPOS_ENTRADA}, lineas:movimientos_stock(cantidad, costo_unitario)`)
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(200);
  if (filtros.deposito) consulta = consulta.eq("deposito_id", filtros.deposito);
  const { data, error } = await consulta;
  if (error) throw new Error(`No se pudieron leer las entradas: ${error.message}`);
  return ((data ?? []) as unknown as FilaEntrada[]).map(resumirEntrada);
}

export async function obtenerEntrada(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("entradas_stock")
    .select(`${CAMPOS_ENTRADA}, lineas:movimientos_stock(id, cantidad, costo_unitario, producto:productos(id, nombre, unidad))`)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const fila = data as unknown as Omit<FilaEntrada, "lineas"> & { lineas: LineaEntrada[] };
  const lineas: LineaEntrada[] = fila.lineas
    .map((l) => ({ ...l, cantidad: Number(l.cantidad), costo_unitario: n(l.costo_unitario) }))
    .sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre, "es"));
  return { ...resumirEntrada(fila as FilaEntrada), lineas };
}
