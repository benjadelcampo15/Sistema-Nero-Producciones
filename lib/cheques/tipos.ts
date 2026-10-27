import type { Empresa } from "@/lib/empresas";

export type TipoCheque = "emitido" | "recibido";
export type EstadoCheque = "pendiente" | "depositado" | "cobrado" | "debitado" | "endosado" | "rechazado" | "anulado";

export type Cheque = {
  id: string;
  empresa: Empresa;
  tipo: TipoCheque;
  estado: EstadoCheque;
  electronico: boolean;
  numero: string | null;
  banco: string | null;
  monto: number;
  fecha_emision: string | null;
  fecha_pago: string;
  contraparte: string;
  cuit: string | null;
  evento_id: string | null;
  notas: string | null;
  aviso_enviado_en: string | null;
  evento: { id: string; nombre: string } | null;
};

/** Pestañas de la sección: la ruta usa el plural. */
export const PESTANAS = [
  { ruta: "recibidos", tipo: "recibido", nombre: "Recibidos" },
  { ruta: "emitidos", tipo: "emitido", nombre: "Emitidos" },
] as const;

/** Estados posibles según el tipo, en el orden en que se usan. */
export const ESTADOS: Record<TipoCheque, { id: EstadoCheque; nombre: string }[]> = {
  recibido: [
    { id: "pendiente", nombre: "En cartera" },
    { id: "depositado", nombre: "Depositado" },
    { id: "cobrado", nombre: "Acreditado" },
    { id: "endosado", nombre: "Endosado" },
    { id: "rechazado", nombre: "Rechazado" },
  ],
  emitido: [
    { id: "pendiente", nombre: "Pendiente de débito" },
    { id: "debitado", nombre: "Debitado" },
    { id: "rechazado", nombre: "Rechazado" },
    { id: "anulado", nombre: "Anulado" },
  ],
};

export function nombreEstado(tipo: TipoCheque, estado: EstadoCheque) {
  return ESTADOS[tipo].find((e) => e.id === estado)?.nombre ?? estado;
}

/** Días desde `desde` hasta `hasta` (fechas "YYYY-MM-DD"); negativo si ya pasó. */
export function diasEntre(desde: string, hasta: string) {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

export function sumarDias(fecha: string, dias: number) {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Cuántos días antes del vencimiento se manda el aviso por mail. */
export const DIAS_AVISO = 2;
