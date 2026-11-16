import type { Empresa } from "@/lib/empresas";

/** Solicitudes de pagos: seguimiento de pedidos de pago a proveedores (no mueve plata ni Financiero). */

export const PRIORIDADES_PAGO = ["muy_urgente", "urgente", "normal"] as const;
export type PrioridadPago = (typeof PRIORIDADES_PAGO)[number];
export const NOMBRE_PRIORIDAD_PAGO: Record<PrioridadPago, string> = { muy_urgente: "Muy urgente", urgente: "Urgente", normal: "Normal" };
export const COLOR_PRIORIDAD_PAGO: Record<PrioridadPago, string> = {
  muy_urgente: "bg-red-600 text-white",
  urgente: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
  normal: "bg-stone-100 text-stone-700",
};

export const ESTADOS_PAGO = ["pendiente", "aprobada", "parcial", "pagada", "rechazada", "cancelada"] as const;
export type EstadoPago = (typeof ESTADOS_PAGO)[number];
export const NOMBRE_ESTADO_PAGO: Record<EstadoPago, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  parcial: "Pagada en parte",
  pagada: "Pagada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};
export const COLOR_ESTADO_PAGO: Record<EstadoPago, string> = {
  pendiente: "bg-sky-100 text-sky-900",
  aprobada: "bg-violet-100 text-violet-900",
  parcial: "bg-amber-100 text-amber-900",
  pagada: "bg-green-100 text-green-800",
  rechazada: "bg-red-100 text-red-800",
  cancelada: "bg-stone-200 text-stone-600",
};
/** Estados abiertos: todavía falta resolver o pagar. */
export const ESTADOS_ABIERTOS: EstadoPago[] = ["pendiente", "aprobada", "parcial"];

export const MEDIOS_PAGO = ["Transferencia", "Efectivo", "Cheque", "Mercado Pago", "Otro"] as const;

export type SolicitudPago = {
  id: string;
  numero: number;
  empresa: Empresa;
  proveedor_id: string | null;
  proveedor: string;
  evento_id: string | null;
  evento: string | null;
  monto: number;
  pagado: number;
  datos_bancarios: string;
  prioridad: PrioridadPago;
  motivo: string | null;
  estado: EstadoPago;
  nota_admin: string | null;
  solicitado_por: string;
  solicitante: string | null;
  creado_en: string;
  estado_en: string | null;
  estado_por: string | null;
};

export type PagoSolicitud = { id: string; fecha: string; importe: number; medio: string; observacion: string | null; comprobante_path: string | null };
export type MovimientoHistorial = { accion: string; detalle: string | null; usuario: string | null; creado_en: string };

/** Orden del panel: abiertas primero, por prioridad y antigüedad; después las cerradas, las más nuevas arriba. */
export function ordenarSolicitudes(lista: SolicitudPago[]) {
  const rangoEstado = (e: EstadoPago) => (ESTADOS_ABIERTOS.includes(e) ? 0 : 1);
  return [...lista].sort(
    (a, b) =>
      rangoEstado(a.estado) - rangoEstado(b.estado) ||
      (rangoEstado(a.estado) === 0
        ? PRIORIDADES_PAGO.indexOf(a.prioridad) - PRIORIDADES_PAGO.indexOf(b.prioridad) || a.creado_en.localeCompare(b.creado_en)
        : b.creado_en.localeCompare(a.creado_en)),
  );
}
