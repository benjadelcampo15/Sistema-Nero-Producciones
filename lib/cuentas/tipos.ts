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
};

/** Movimiento a mano de una cuenta: con pagos, solo se cambian el detalle y la categoría. */
export type CargoEditable = { id: string; detalle: string; monto: number; fecha: string | null; categoria_id: string; conPagos: boolean };

/** Un pago o cobro registrado desde la cuenta corriente (o pagado directo en Financiero). */
export type PagoCuenta = {
  id: string | null;
  fecha: string;
  monto: number;
  medio_pago: MedioPago;
  notas: string | null;
  anulado: boolean;
};

/** Renglón del extracto: debe (facturado) o haber (pagado), con el saldo acumulado. */
export type RenglonCuenta = { fecha: string | null; detalle: string; href: string | null; debe: number; haber: number; saldo: number; pagoId: string | null; cargo?: CargoEditable | null; anulado?: boolean };

export type CuentaCorriente = { comprobantes: ComprobanteCuenta[]; pagos: PagoCuenta[]; extracto: RenglonCuenta[]; saldo: number; facturado: number; pagado: number };
