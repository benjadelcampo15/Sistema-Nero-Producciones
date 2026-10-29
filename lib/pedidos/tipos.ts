export const ESTADOS_PEDIDO = ["borrador", "enviado", "recibido", "cancelado"] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export const ESTADO_PEDIDO: Record<EstadoPedido, { nombre: string; clase: string }> = {
  borrador: { nombre: "Borrador", clase: "bg-stone-200 text-stone-700" },
  enviado: { nombre: "Enviado", clase: "bg-sky-100 text-sky-800" },
  recibido: { nombre: "Recibido", clase: "bg-green-100 text-green-800" },
  cancelado: { nombre: "Cancelado", clase: "bg-red-100 text-red-800" },
};

export type Mayorista = { id: string; razon_social: string; telefono: string | null; email: string | null; contacto: string | null };

export type ItemPedido = {
  producto: { id: string; nombre: string; unidad: string; codigo: string | null };
  cantidad: number;
  precio_unitario: number | null;
  cantidad_recibida: number | null;
};

export type Pedido = {
  id: string;
  numero: number;
  proveedor: Mayorista;
  deposito: { id: string; nombre: string };
  fecha: string;
  fecha_entrega: string | null;
  estado: EstadoPedido;
  notas: string | null;
  recibido_en: string | null;
  items: ItemPedido[];
};

/** Un producto a la hora de armar un pedido: cuánto hay, cuánto falta y a cuánto se compró. */
export type ProductoParaPedir = {
  id: string;
  nombre: string;
  unidad: string;
  codigo: string | null;
  stock: number;
  porDeposito: Record<string, number>;
  minimo: number;
  /** Pedido a algún mayorista (enviado) y todavía no recibido. */
  enCamino: number;
  /** Último precio pedido a cada proveedor. */
  precios: Record<string, number>;
  /** Mayoristas que lo venden (catálogo), con su precio de lista si tiene. */
  catalogo: Record<string, number | null>;
  costo: number | null;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Lo que falta para llegar al mínimo, contando lo que ya está en camino. */
export const faltante = (p: Pick<ProductoParaPedir, "stock" | "minimo" | "enCamino">) => (p.minimo > 0 ? Math.max(0, r3(p.minimo - p.stock - p.enCamino)) : 0);

export const totalPedido = (items: Pick<ItemPedido, "cantidad" | "precio_unitario">[]) =>
  Math.round(items.reduce((t, i) => t + (i.precio_unitario ?? 0) * i.cantidad * 100, 0)) / 100;

/** Precio sugerido para un mayorista: el de su catálogo, el último que se le pidió o el costo promedio. */
export const precioSugerido = (p: Pick<ProductoParaPedir, "catalogo" | "precios" | "costo">, proveedorId: string) =>
  p.catalogo[proveedorId] ?? p.precios[proveedorId] ?? p.costo;