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
  creado_en: string;
  motivo: string | null;
  transferencia_id: string | null;
  factura_id: string | null;
  salida_id: string | null;
  producto: { id: string; nombre: string; unidad: string };
  deposito: { id: string; nombre: string };
  evento: { id: string; nombre: string } | null;
};

/** Fila de la vista general: un producto con su cantidad en cada depósito. */
export type FilaStock = {
  producto: Producto;
  porDeposito: Record<string, number>;
  /** Costo promedio de las entradas en cada depósito (null: sin entradas con costo). */
  costoPorDeposito: Record<string, number | null>;
  total: number;
  costoPromedio: number | null;
};

export function formatoCantidad(n: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(n);
}

/** Costo de lo que sale de un depósito: el promedio de ese depósito o, si no tiene, el general del producto. */
export function costoDeSalida(fila: Pick<FilaStock, "costoPorDeposito" | "costoPromedio">, depositoId: string) {
  return fila.costoPorDeposito[depositoId] ?? (fila.costoPromedio === null ? null : Math.round(fila.costoPromedio * 100) / 100);
}

export const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Cómo se cargan los productos de una salida: lo que quedó al contar, o directamente lo que salió. */
export type ModoSalida = "conteo" | "cantidad";

/** Una salida de varios productos, resumida para el historial. */
export type ResumenSalida = {
  id: string;
  fecha: string;
  creado_en: string;
  modo: ModoSalida;
  motivo: string | null;
  deposito: { id: string; nombre: string };
  evento: { id: string; nombre: string } | null;
  productos: number;
  /** Suma de cantidad × costo de los productos con costo. */
  costoTotal: number;
  sinCosto: number;
};

export type LineaSalida = {
  id: string;
  producto: { id: string; nombre: string; unidad: string };
  cantidad: number;
  costo_unitario: number | null;
  stock_inicial: number | null;
  stock_contado: number | null;
};
