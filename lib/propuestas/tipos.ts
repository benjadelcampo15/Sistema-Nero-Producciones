import { z } from "zod";
import type { Empresa } from "@/lib/empresas";
import { PRIORIDADES_PAGO, type PrioridadPago } from "@/lib/pagos/tipos";

/**
 * Propuestas de pago: repartir un dinero disponible entre los pagos que se
 * quieren hacer. Es planificación: no registra pagos ni mueve Financiero.
 */

export const ESTADOS_PROPUESTA = ["borrador", "aprobada", "finalizada"] as const;
export type EstadoPropuesta = (typeof ESTADOS_PROPUESTA)[number];
export const NOMBRE_ESTADO_PROPUESTA: Record<EstadoPropuesta, string> = { borrador: "Borrador", aprobada: "Aprobada", finalizada: "Finalizada" };
export const COLOR_ESTADO_PROPUESTA: Record<EstadoPropuesta, string> = {
  borrador: "bg-stone-100 text-stone-700 ring-1 ring-stone-300",
  aprobada: "bg-violet-100 text-violet-900",
  finalizada: "bg-green-100 text-green-800",
};

export type PagoPropuesto = {
  id: string;
  proveedor: string;
  detalle: string;
  evento_id: string | null;
  adeudado: number | null;
  importe: number;
  alias_cbu: string;
  prioridad: PrioridadPago;
  observaciones: string;
  solicitud_id: string | null;
  solicitante: string | null;
};

export type DatosPropuesta = {
  nombre: string;
  fecha: string;
  disponible: number;
  observaciones: string;
  items: PagoPropuesto[];
};

export type Propuesta = DatosPropuesta & {
  id: string;
  numero: number;
  empresa: Empresa;
  estado: EstadoPropuesta;
  creado_en: string;
  actualizado_en: string;
  creador: string | null;
  modificador: string | null;
};

export type ResumenPropuesta = {
  id: string;
  numero: number;
  empresa: Empresa;
  nombre: string;
  fecha: string;
  disponible: number;
  estado: EstadoPropuesta;
  pagos: number;
  total: number;
  creador: string | null;
  modificador: string | null;
  actualizado_en: string;
};

export type SolicitudDisponible = {
  id: string;
  numero: number;
  proveedor: string;
  monto: number;
  pagado: number;
  datos_bancarios: string;
  prioridad: PrioridadPago;
  motivo: string | null;
  estado: string;
  evento_id: string | null;
  evento: string | null;
  solicitante: string | null;
  creado_en: string;
};

const importe = z.number().finite().min(0, "Los importes no pueden ser negativos").max(1e13);

export const esquemaPago = z.object({
  id: z.uuid(),
  proveedor: z.string().trim().min(1, "Falta el proveedor").max(200),
  detalle: z.string().max(500),
  evento_id: z.uuid().nullable(),
  adeudado: importe.nullable(),
  importe,
  alias_cbu: z.string().max(200),
  prioridad: z.enum(PRIORIDADES_PAGO),
  observaciones: z.string().max(1000),
  solicitud_id: z.uuid().nullable(),
  solicitante: z.string().max(200).nullable(),
});

export const esquemaPropuesta = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre").max(200),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  disponible: importe,
  observaciones: z.string().max(2000),
  items: z.array(esquemaPago).max(500),
});

/** Centavos, para que las sumas den exacto. */
const c = (n: number) => Math.round(n * 100);

export type FilaCalculada = {
  pago: PagoPropuesto;
  /** Cuánto del disponible se lleva la propuesta hasta este pago inclusive. */
  acumulado: number;
  /** Lo que queda después de este pago. */
  saldoDespues: number;
  /** Con lo que queda antes de este pago, no alcanza para cubrirlo entero. */
  noAlcanza: boolean;
  /** Lo que todavía queda disponible al llegar a este pago (para ajustarlo). */
  disponibleAntes: number;
  /** Paga menos de lo adeudado. */
  parcial: boolean;
};

/** Total propuesto, saldo restante y el acumulado de cada pago en el orden elegido. */
export function calcularPropuesta(disponible: number, items: PagoPropuesto[]) {
  let acumulado = 0;
  const base = c(disponible);
  const filas: FilaCalculada[] = items.map((pago) => {
    const antes = base - acumulado;
    acumulado += c(pago.importe);
    return {
      pago,
      acumulado: acumulado / 100,
      saldoDespues: (base - acumulado) / 100,
      noAlcanza: c(pago.importe) > 0 && base - acumulado < 0,
      disponibleAntes: Math.max(0, antes) / 100,
      parcial: pago.adeudado !== null && c(pago.importe) < c(pago.adeudado),
    };
  });
  const total = acumulado / 100;
  const saldo = (base - acumulado) / 100;
  const adeudado = items.reduce((s, p) => s + c(p.adeudado ?? 0), 0) / 100;
  return {
    filas,
    total,
    saldo,
    adeudado,
    /** Porcentaje del disponible ya comprometido (puede pasar de 1). */
    uso: base > 0 ? acumulado / base : acumulado > 0 ? Infinity : 0,
    excedido: saldo < 0,
    porPrioridad: PRIORIDADES_PAGO.map((p) => ({
      prioridad: p,
      cantidad: items.filter((i) => i.prioridad === p).length,
      total: items.filter((i) => i.prioridad === p).reduce((s, i) => s + c(i.importe), 0) / 100,
    })),
  };
}

/** Ordena por prioridad (muy urgente primero) respetando el orden actual dentro de cada una. */
export function ordenarPorPrioridad(items: PagoPropuesto[]) {
  return items
    .map((p, i) => ({ p, i }))
    .sort((a, b) => PRIORIDADES_PAGO.indexOf(a.p.prioridad) - PRIORIDADES_PAGO.indexOf(b.p.prioridad) || a.i - b.i)
    .map((x) => x.p);
}

/** Lo que falta pagar de una solicitud (si está pagada en parte, el saldo). */
export const saldoSolicitud = (s: SolicitudDisponible) => Math.max(0, Math.round((s.monto - s.pagado) * 100) / 100);
