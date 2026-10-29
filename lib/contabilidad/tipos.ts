import type { Empresa } from "@/lib/empresas";

export type CuentaContable = { id: string; codigo: string; nombre: string; imputable: boolean; activa: boolean };

/** El primer dígito del código define el tipo de cuenta. */
export const TIPOS_CUENTA_CONTABLE = {
  "1": "Activo",
  "2": "Pasivo",
  "3": "Patrimonio neto",
  "4": "Ingresos",
  "5": "Egresos",
} as const;
export type TipoCuentaContable = keyof typeof TIPOS_CUENTA_CONTABLE;

export const tipoDeCodigo = (codigo: string) => codigo[0] as TipoCuentaContable;
/** Las cuentas de resultado (ingresos y egresos) se cierran contra el patrimonio. */
export const esDeResultado = (codigo: string) => codigo[0] === "4" || codigo[0] === "5";
/** "1.1.1.02" → "1.1.1" (null en la raíz). */
export const codigoPadre = (codigo: string) => (codigo.includes(".") ? codigo.slice(0, codigo.lastIndexOf(".")) : null);

/** Orden natural de códigos: 1.1.2 antes que 1.1.10. */
export function compararCodigos(a: string, b: string) {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return 0;
}

/** Cuentas de la imputación automática que no salen de una categoría ni de una cuenta bancaria. */
export const CLAVES_IMPUTACION = [
  { clave: "efectivo", nombre: "Pagos y cobros en efectivo", grupo: "Medios de pago" },
  { clave: "transferencia", nombre: "Transferencias (si el movimiento no está conciliado con un extracto)", grupo: "Medios de pago" },
  { clave: "mercado_pago", nombre: "Mercado Pago", grupo: "Medios de pago" },
  { clave: "otro", nombre: "Medio “Otro / sin especificar”", grupo: "Medios de pago" },
  { clave: "tarjeta_ingreso", nombre: "Cobros con tarjeta", grupo: "Medios de pago" },
  { clave: "tarjeta_egreso", nombre: "Pagos con tarjeta", grupo: "Medios de pago" },
  { clave: "cheques_en_cartera", nombre: "Cheques recibidos (hasta que se cobran)", grupo: "Cheques" },
  { clave: "cheques_a_pagar", nombre: "Cheques emitidos (hasta que se debitan)", grupo: "Cheques" },
  { clave: "deudores", nombre: "Ingresos pendientes de cobro", grupo: "Pendientes" },
  { clave: "proveedores", nombre: "Egresos pendientes de pago", grupo: "Pendientes" },
  { clave: "iva_debito", nombre: "IVA de los ingresos facturados", grupo: "IVA" },
  { clave: "iva_credito", nombre: "IVA de los egresos facturados", grupo: "IVA" },
  { clave: "ingresos_a_clasificar", nombre: "Ingresos de categorías sin cuenta", grupo: "Sin cuenta" },
  { clave: "egresos_a_clasificar", nombre: "Egresos de categorías sin cuenta", grupo: "Sin cuenta" },
] as const;
export type ClaveImputacion = (typeof CLAVES_IMPUTACION)[number]["clave"];
export type Imputaciones = Record<ClaveImputacion, string>;

export type LineaAsiento = { cuenta_id: string; debe: number; haber: number; detalle: string | null };

export type OrigenAsiento = "manual" | "movimiento" | "cheque";

export type Asiento = {
  /** Manual: id del asiento. Automático: "mov:<id>" o "chq:<id>". */
  id: string;
  empresa: Empresa;
  fecha: string;
  descripcion: string;
  origen: OrigenAsiento;
  /** Id del asiento manual, del movimiento de Financiero o del cheque. */
  origenId: string;
  /** Aclaración de cómo se armó (IVA incluido, pendiente, cheque…). */
  nota: string | null;
  lineas: LineaAsiento[];
};

export type Aviso = { texto: string; cantidad: number; href?: string };
