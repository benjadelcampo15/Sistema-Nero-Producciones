import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Deposito, FilaStock, MovimientoStock, Producto } from "./tipos";

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
    return { producto, porDeposito, total, costoPromedio };
  });
}

export async function listarMovimientos(filtros: { deposito?: string; producto?: string } = {}) {
  const supabase = await crearClienteServidor();
  let consulta = supabase
    .from("movimientos_stock")
    .select(
      "id, tipo, cantidad, costo_unitario, fecha, motivo, transferencia_id, factura_id, producto:productos(id, nombre, unidad), deposito:depositos(id, nombre), evento:eventos(id, nombre)",
    )
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(500);
  if (filtros.deposito) consulta = consulta.eq("deposito_id", filtros.deposito);
  if (filtros.producto) consulta = consulta.eq("producto_id", filtros.producto);
  const { data, error } = await consulta;
  if (error) throw new Error(`No se pudieron leer los movimientos: ${error.message}`);
  return ((data ?? []) as unknown as MovimientoStock[]).map((m) => ({
    ...m,
    cantidad: Number(m.cantidad),
    costo_unitario: n(m.costo_unitario),
  }));
}
