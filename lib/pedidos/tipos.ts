export const ESTADOS_PEDIDO = ["borrador", "enviado", "confirmado", "recibido", "cancelado"] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export const ESTADO_PEDIDO: Record<EstadoPedido, { nombre: string; clase: string }> = {
  borrador: { nombre: "Borrador", clase: "bg-stone-200 text-stone-700" },
  enviado: { nombre: "Enviado", clase: "bg-sky-100 text-sky-800" },
  confirmado: { nombre: "Confirmado por el proveedor", clase: "bg-violet-100 text-violet-800" },
  recibido: { nombre: "Recibido", clase: "bg-green-100 text-green-800" },
  cancelado: { nombre: "Cancelado", clase: "bg-red-100 text-red-800" },
};

/** Pedidos que todavía se pueden editar, recibir o cancelar. */
export const pedidoAbierto = (estado: EstadoPedido) => estado === "borrador" || estado === "enviado" || estado === "confirmado";

export type Mayorista = { id: string; razon_social: string; telefono: string | null; email: string | null; contacto: string | null; token: string };

export type ItemPedido = {
  producto: { id: string; nombre: string; unidad: string; codigo: string | null };
  cantidad: number;
  precio_unitario: number | null;
  aclaracion: string | null;
  /** Promo del proveedor al momento del pedido (ej. "4+1"). */
  promo: string | null;
  bonificadas: number;
  /** Lo que el proveedor confirmó que manda (null: no respondió) y su nota. */
  cantidad_confirmada: number | null;
  nota_proveedor: string | null;
  cantidad_recibida: number | null;
  bonificadas_recibidas: number | null;
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
  confirmado_en: string | null;
  respuesta_proveedor: string | null;
  fecha_entrega_confirmada: string | null;
  items: ItemPedido[];
};

/** Promos: "4+1" (por cada 4, 1 de regalo) o "10%" (descuento sobre el precio). */
export const FORMATO_PROMO = /^(\d+\+\d+|\d+([.,]\d+)?%)$/;

/** Normaliza lo que se escribe ("4 + 1", "10 %", "10,5%") al formato guardado; null si no es válida. */
export function leerPromo(texto: string) {
  const t = texto.replace(/\s/g, "").replace(",", ".");
  return t && FORMATO_PROMO.test(t) ? t : null;
}

/** Cuántas vienen de regalo al pedir `cantidad` con una promo "N+M". */
export function bonificadasDe(promo: string | null | undefined, cantidad: number) {
  const m = /^(\d+)\+(\d+)$/.exec(promo ?? "");
  if (!m || Number(m[1]) <= 0) return 0;
  return Math.floor(cantidad / Number(m[1])) * Number(m[2]);
}

/** Descuento de una promo "10%" (0.1); 0 si no es de descuento. */
export function descuentoDe(promo: string | null | undefined) {
  const m = /^(\d+(\.\d+)?)%$/.exec(promo ?? "");
  return m ? Math.min(Number(m[1]), 100) / 100 : 0;
}

/** "4+1" → "4+1 (1 de regalo cada 4)"; "10%" → "10% de descuento". */
export function describirPromo(promo: string) {
  const m = /^(\d+)\+(\d+)$/.exec(promo);
  if (m) return `${promo} (${m[2]} de regalo cada ${m[1]})`;
  return `${promo.replace(".", ",")} de descuento`;
}

/** La promo de un mayorista para el producto, si está vigente en `fecha`. */
export function promoVigente(p: Pick<ProductoParaPedir, "promos">, proveedorId: string, fecha: string) {
  const x = p.promos[proveedorId];
  return x && (!x.hasta || x.hasta >= fecha) ? x.promo : null;
}
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
  /** Promo de cada mayorista para este producto ("4+1" o "10%") y hasta cuándo vale. */
  promos: Record<string, { promo: string; hasta: string | null }>;
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