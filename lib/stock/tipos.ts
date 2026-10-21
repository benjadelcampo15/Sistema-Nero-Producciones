export type Deposito = { id: string; nombre: string; direccion: string | null; activo: boolean };

export type Producto = {
  id: string;
  nombre: string;
  unidad: string;
  codigo: string | null;
  stock_minimo: number;
  activo: boolean;
};

export const UNIDADES = ["unidad", "botella", "caja", "pack", "kg", "litro", "metro"] as const;

export const TIPOS_MOVIMIENTO_STOCK = ["entrada", "salida", "ajuste", "transferencia"] as const;
export type TipoMovimientoStock = (typeof TIPOS_MOVIMIENTO_STOCK)[number];

export const NOMBRE_TIPO_STOCK: Record<TipoMovimientoStock, string> = {
  entrada: "Entrada",
  salida: "Salida",
  ajuste: "Ajuste de inventario",
  transferencia: "Transferencia entre depósitos",
};

export type MovimientoStock = {
  id: string;
  tipo: "entrada" | "salida" | "ajuste";
  cantidad: number;
  costo_unitario: number | null;
  fecha: string;
  motivo: string | null;
  transferencia_id: string | null;
  factura_id: string | null;
  producto: { id: string; nombre: string; unidad: string };
  deposito: { id: string; nombre: string };
  evento: { id: string; nombre: string } | null;
};

/** Fila de la vista general: un producto con su cantidad en cada depósito. */
export type FilaStock = {
  producto: Producto;
  porDeposito: Record<string, number>;
  total: number;
  costoPromedio: number | null;
};

export function formatoCantidad(n: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(n);
}
