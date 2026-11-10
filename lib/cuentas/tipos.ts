import type { Empresa } from "@/lib/empresas";
import type { MedioPago } from "@/lib/financiero/tipos";

/** pago: cuenta de un proveedor (le pagamos) · cobro: cuenta de un cliente (nos paga). */
export type TipoCuenta = "pago" | "cobro";

/** Empresa de una ficha: una de las dos o null (trabaja con las dos). */
export type EmpresaFicha = Empresa | null;

export const leerEmpresaFicha = (valor: unknown): EmpresaFicha => (valor === "nero" || valor === "ruta" ? valor : null);

/** Un comprobante de la cuenta: lo que se facturó y cuánto queda pendiente. */
export type ComprobanteCuenta = {
  /** Movimiento de Financiero de la factura (al que se imputan los pagos). */
  id: string;
  fecha: string | null;
  nombre: string;
  href: string | null;
  total: number;
  pendiente: number;
  /** Movimientos pendientes del comprobante (el original y lo que quedó de dividirlo). */
  pendientes: string[];
  /** Si es un movimiento a mano (sin factura): sus datos para editarlo o borrarlo. */
  cargo: CargoEditable | null;
  /** Evento del que viene (si viene de uno). */
  evento?: EventoCuenta;
  /** Es un gasto de la planilla del evento (se cambia desde la planilla). */
  deLaPlanilla?: boolean;
};

/** Movimiento a mano de una cuenta. Con pagos, el importe no puede quedar por debajo de lo pagado. */
export type CargoEditable = { id: string; detalle: string; monto: number; fecha: string | null; categoria_id: string; conPagos: boolean; pagado: number };

/** Un pago o cobro registrado desde la cuenta corriente (o pagado directo en Financiero). */
export type PagoCuenta = {
  id: string | null;
  fecha: string | null;
  monto: number;
  medio_pago: MedioPago;
  notas: string | null;
};

/** Renglón del extracto: debe (facturado) o haber (pagado), con el saldo acumulado. */
/** Evento del que viene un movimiento (gastos de la planilla, facturas cargadas al evento). */
export type EventoCuenta = { id: string; nombre: string };

/** Lo de un evento dentro de la cuenta: deuda, pagado y lo que falta. */
export type ResumenEventoCuenta = EventoCuenta & { total: number; pagado: number; pendiente: number };

export type RenglonCuenta = {
  fecha: string | null;
  /** Eventos de la fila (un pago puede cubrir gastos de varios). */
  eventos: string[];
  /** Viene de la planilla de un evento: se cambia desde la planilla. */
  planilla?: EventoCuenta;
  detalle: string;
  href: string | null;
  debe: number;
  haber: number;
  saldo: number;
  /** Pago registrado desde la cuenta (se edita y elimina acá). */
  pago?: PagoCuenta & { id: string };
  /** Pago marcado directo en Financiero (se cambia allá). */
  enFinanciero?: boolean;
  cargo?: CargoEditable | null;
};

export type CuentaCorriente = {
  comprobantes: ComprobanteCuenta[];
  pagos: PagoCuenta[];
  extracto: RenglonCuenta[];
  saldo: number;
  facturado: number;
  pagado: number;
  /** Eventos con movimientos en la cuenta, para filtrar. */
  eventos: ResumenEventoCuenta[];
};
