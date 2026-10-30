export const ESTADOS_EVENTO = ["planificado", "en_curso", "cerrado", "cancelado"] as const;
export type EstadoEvento = (typeof ESTADOS_EVENTO)[number];

export const NOMBRE_ESTADO_EVENTO: Record<EstadoEvento, string> = {
  planificado: "Planificado",
  en_curso: "En curso",
  cerrado: "Cerrado",
  cancelado: "Cancelado",
};

export const COLOR_ESTADO_EVENTO: Record<EstadoEvento, string> = {
  planificado: "bg-sky-100 text-sky-800",
  en_curso: "bg-amber-100 text-amber-800",
  cerrado: "bg-stone-200 text-stone-700",
  cancelado: "bg-red-100 text-red-800",
};

import type { Empresa } from "@/lib/empresas";

export type Evento = {
  id: string;
  empresa: Empresa;
  nombre: string;
  fecha: string;
  lugar: string | null;
  estado: EstadoEvento;
  presupuesto: number | null;
  notas: string | null;
  /** Los eventos nuevos: la planilla se refleja en Financiero. */
  planilla_en_financiero: boolean;
};

export type Balance = { ingresos: number; egresos: number; resultado: number; movimientos: number };

export type EventoConBalance = Evento & { balance: Balance };
