export const TIPOS = ["ingreso", "egreso"] as const;
export type TipoMovimiento = (typeof TIPOS)[number];

export const MEDIOS_PAGO = [
  "transferencia",
  "efectivo",
  "mercado_pago",
  "tarjeta",
  "cheque_emitido",
  "cheque_a_emitir",
  "cheque_a_cobrar",
  "cheque",
  "otro",
] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];

/** Medios de pago con cheque: al elegirlos se carga el cheque en la sección Cheques. */
export const MEDIOS_CHEQUE: readonly MedioPago[] = ["cheque_a_emitir", "cheque_emitido", "cheque_a_cobrar", "cheque"];

/** Datos del cheque vinculado a un movimiento (para editarlo desde el movimiento). */
export type ChequeDeMovimiento = { numero: string | null; banco: string | null; fecha_pago: string; electronico: boolean; estado: string };

export const NOMBRE_MEDIO_PAGO: Record<MedioPago, string> = {
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  mercado_pago: "Mercado Pago",
  tarjeta: "Tarjeta",
  cheque_emitido: "Cheque emitido",
  cheque_a_emitir: "Cheque a emitir",
  cheque_a_cobrar: "Cheque a cobrar",
  cheque: "Cheque",
  otro: "Otro / sin especificar",
};

/** real: ya se cobró/pagó · pendiente: comprometido · proyectado: estimación. */
export const ESTADOS_MOVIMIENTO = ["real", "pendiente", "proyectado"] as const;
export type EstadoMovimiento = (typeof ESTADOS_MOVIMIENTO)[number];

export const NOMBRE_ESTADO_MOVIMIENTO: Record<EstadoMovimiento, string> = {
  real: "Real",
  pendiente: "Pendiente",
  proyectado: "Proyectado",
};

export type Categoria = { id: string; nombre: string; tipo: TipoMovimiento; activa: boolean };

export type EventoResumido = { id: string; nombre: string; fecha: string };

export type Transaccion = {
  id: string;
  tipo: TipoMovimiento;
  monto: number;
  // null: sin fecha (no entra al cashflow ni a los totales por período).
  fecha: string | null;
  descripcion: string;
  contraparte: string | null;
  medio_pago: MedioPago;
  estado: EstadoMovimiento;
  facturado: boolean;
  iva: number | null;
  iibb: number | null;
  notas: string | null;
  categoria: { id: string; nombre: string };
  evento: { id: string; nombre: string } | null;
};

export type Totales = { ingresos: number; egresos: number; resultado: number };
