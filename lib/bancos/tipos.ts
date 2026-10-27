export const TIPOS_CUENTA = [
  { id: "cuenta_corriente", nombre: "Cuenta corriente" },
  { id: "caja_ahorro", nombre: "Caja de ahorro" },
  { id: "billetera", nombre: "Billetera virtual" },
  { id: "efectivo", nombre: "Efectivo / caja" },
] as const;
export type TipoCuenta = (typeof TIPOS_CUENTA)[number]["id"];

export type Cuenta = {
  id: string;
  nombre: string;
  banco: string | null;
  tipo: TipoCuenta;
  descubierto: number;
  activa: boolean;
};

/** Último saldo cargado de una cuenta hasta cierta fecha. */
export type SaldoCuenta = { saldo: number; fecha: string };

/** Un ingreso o egreso del cashflow: de Financiero (de Nero o de Ruta) o un cheque pendiente. */
export type MovimientoCaja = {
  id: string;
  origen: "financiero" | "cheque";
  empresa: "nero" | "ruta" | null;
  fecha: string;
  tipo: "ingreso" | "egreso";
  monto: number;
  descripcion: string;
  detalle: string | null;
  estado: "real" | "pendiente" | "proyectado";
};
