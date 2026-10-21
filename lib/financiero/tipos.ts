export const TIPOS = ["ingreso", "egreso"] as const;
export type TipoMovimiento = (typeof TIPOS)[number];

export const MEDIOS_PAGO = ["transferencia", "efectivo", "mercado_pago", "tarjeta", "cheque", "otro"] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];

export const NOMBRE_MEDIO_PAGO: Record<MedioPago, string> = {
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  mercado_pago: "Mercado Pago",
  tarjeta: "Tarjeta",
  cheque: "Cheque",
  otro: "Otro",
};

export type Categoria = { id: string; nombre: string; tipo: TipoMovimiento; activa: boolean };

export type EventoResumido = { id: string; nombre: string; fecha: string };

export type Transaccion = {
  id: string;
  tipo: TipoMovimiento;
  monto: number;
  fecha: string;
  descripcion: string;
  contraparte: string | null;
  medio_pago: MedioPago;
  notas: string | null;
  categoria: { id: string; nombre: string };
  evento: { id: string; nombre: string } | null;
};
