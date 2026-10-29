import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { obtenerStock } from "@/lib/stock/consultas";
import type { Mayorista, Pedido, ProductoParaPedir } from "./tipos";

const CAMPOS =
  "id, numero, fecha, fecha_entrega, estado, notas, recibido_en, confirmado_en, respuesta_proveedor, fecha_entrega_confirmada, proveedor:proveedores(id, razon_social, telefono, email, contacto, token), deposito:depositos(id, nombre), items:pedido_items(orden, cantidad, precio_unitario, aclaracion, promo, bonificadas, cantidad_confirmada, nota_proveedor, cantidad_recibida, bonificadas_recibidas, producto:productos(id, nombre, unidad, codigo))";

type Numero = number | string | null;
type Fila = Omit<Pedido, "items"> & {
  items: (Omit<Pedido["items"][number], "cantidad" | "precio_unitario" | "bonificadas" | "cantidad_confirmada" | "cantidad_recibida" | "bonificadas_recibidas"> & {
    orden: number;
    cantidad: Numero;
    precio_unitario: Numero;
    bonificadas: Numero;
    cantidad_confirmada: Numero;
    cantidad_recibida: Numero;
    bonificadas_recibidas: Numero;
  })[];
};

const n = (v: Numero) => (v === null ? null : Number(v));

const aPedido = (f: Fila): Pedido => ({
  ...f,
  numero: Number(f.numero),
  items: [...f.items]
    .sort((a, b) => a.orden - b.orden)
    .map((i) => ({
      producto: i.producto,
      aclaracion: i.aclaracion,
      promo: i.promo,
      nota_proveedor: i.nota_proveedor,
      cantidad: Number(i.cantidad),
      precio_unitario: n(i.precio_unitario),
      bonificadas: Number(i.bonificadas ?? 0),
      cantidad_confirmada: n(i.cantidad_confirmada),
      cantidad_recibida: n(i.cantidad_recibida),
      bonificadas_recibidas: n(i.bonificadas_recibidas),
    })),
});

export async function listarPedidos() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("pedidos").select(CAMPOS).order("numero", { ascending: false }).limit(300);
  if (error) throw new Error(`No se pudieron leer los pedidos: ${error.message}`);
  return ((data ?? []) as unknown as Fila[]).map(aPedido);
}

export async function obtenerPedido(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("pedidos").select(CAMPOS).eq("id", id).maybeSingle();
  return data ? aPedido(data as unknown as Fila) : null;
}

export async function listarMayoristas(): Promise<Mayorista[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("proveedores").select("id, razon_social, telefono, email, contacto, token").eq("activo", true).order("razon_social");
  return (data ?? []) as Mayorista[];
}

/**
 * Productos activos con su stock, mínimo, lo que está en camino (pedidos
 * enviados sin recibir, salvo el que se está editando) y el último precio.
 */
export async function productosParaPedir(excluirPedido?: string): Promise<ProductoParaPedir[]> {
  const supabase = await crearClienteServidor();
  const [stock, { data: items }, { data: catalogo }] = await Promise.all([
    obtenerStock(),
    supabase
      .from("pedido_items")
      .select("producto_id, cantidad, precio_unitario, pedido:pedidos!inner(id, estado, fecha, proveedor_id)")
      .neq("pedido.estado", "cancelado")
      .limit(20000),
    supabase.from("proveedor_productos").select("proveedor_id, producto_id, precio, promo, promo_hasta").limit(20000),
  ]);
  const catalogos = new Map<string, Record<string, number | null>>();
  const promos = new Map<string, Record<string, { promo: string; hasta: string | null }>>();
  for (const c of catalogo ?? []) {
    const delProducto = catalogos.get(c.producto_id) ?? {};
    delProducto[c.proveedor_id] = c.precio === null ? null : Number(c.precio);
    catalogos.set(c.producto_id, delProducto);
    if (c.promo) promos.set(c.producto_id, { ...(promos.get(c.producto_id) ?? {}), [c.proveedor_id]: { promo: c.promo, hasta: c.promo_hasta } });
  }

  const enCamino = new Map<string, number>();
  // Último precio por producto y proveedor (los ítems más recientes pisan a los viejos).
  const precios = new Map<string, Record<string, { precio: number; fecha: string }>>();
  for (const i of (items ?? []) as unknown as { producto_id: string; cantidad: number; precio_unitario: number | null; pedido: { id: string; estado: string; fecha: string; proveedor_id: string } }[]) {
    if ((i.pedido.estado === "enviado" || i.pedido.estado === "confirmado") && i.pedido.id !== excluirPedido) enCamino.set(i.producto_id, (enCamino.get(i.producto_id) ?? 0) + Number(i.cantidad));
    if (i.precio_unitario === null) continue;
    const delProducto = precios.get(i.producto_id) ?? {};
    const actual = delProducto[i.pedido.proveedor_id];
    if (!actual || actual.fecha <= i.pedido.fecha) delProducto[i.pedido.proveedor_id] = { precio: Number(i.precio_unitario), fecha: i.pedido.fecha };
    precios.set(i.producto_id, delProducto);
  }

  return stock.map((f) => ({
    id: f.producto.id,
    nombre: f.producto.nombre,
    unidad: f.producto.unidad,
    codigo: f.producto.codigo,
    stock: Math.round(f.total * 1000) / 1000,
    porDeposito: f.porDeposito,
    minimo: f.producto.stock_minimo,
    enCamino: Math.round((enCamino.get(f.producto.id) ?? 0) * 1000) / 1000,
    precios: Object.fromEntries(Object.entries(precios.get(f.producto.id) ?? {}).map(([prov, x]) => [prov, x.precio])),
    catalogo: catalogos.get(f.producto.id) ?? {},
    promos: promos.get(f.producto.id) ?? {},
    costo: f.costoPromedio === null ? null : Math.round(f.costoPromedio * 100) / 100,
  }));
}

/**
 * Página del proveedor (sin sesión): busca por su token con la clave secreta y
 * devuelve solo sus datos básicos y sus pedidos (nada de stock ni costos).
 */
export async function portalProveedor(token: string) {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return null;
  const admin = crearClienteAdmin();
  const { data: proveedor } = await admin.from("proveedores").select("id, razon_social").eq("token", token).maybeSingle();
  if (!proveedor) return null;
  const { data } = await admin
    .from("pedidos")
    .select(CAMPOS)
    .eq("proveedor_id", proveedor.id)
    .in("estado", ["enviado", "confirmado", "recibido"])
    .order("numero", { ascending: false })
    .limit(30);
  return { proveedor: proveedor as { id: string; razon_social: string }, pedidos: ((data ?? []) as unknown as Fila[]).map(aPedido) };
}