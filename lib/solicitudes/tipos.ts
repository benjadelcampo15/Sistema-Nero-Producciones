/** Centro de Solicitudes: lo que se muestra (sirve en el servidor y en el navegador). */

export const TIPOS = [
  { id: "funcionalidad", nombre: "Nueva funcionalidad" },
  { id: "mejora", nombre: "Mejora de algo existente" },
  { id: "proceso", nombre: "Modificación de proceso" },
  { id: "error", nombre: "Reporte de error" },
  { id: "otro", nombre: "Otro" },
] as const;
export type TipoSolicitud = (typeof TIPOS)[number]["id"];

export const PRIORIDADES = [
  { id: "baja", nombre: "Baja" },
  { id: "media", nombre: "Media" },
  { id: "alta", nombre: "Alta" },
] as const;
export type Prioridad = (typeof PRIORIDADES)[number]["id"];

/** La interna (la define el equipo) suma "urgente". */
export const PRIORIDADES_INTERNAS = [...PRIORIDADES, { id: "urgente", nombre: "Urgente" }] as const;
export type PrioridadInterna = (typeof PRIORIDADES_INTERNAS)[number]["id"];

export const ESTADOS = [
  { id: "recibida", nombre: "Recibida", clase: "bg-sky-100 text-sky-800", significado: "El cliente envió la solicitud" },
  { id: "evaluacion", nombre: "En evaluación", clase: "bg-violet-100 text-violet-800", significado: "El equipo está analizando el pedido" },
  { id: "informacion", nombre: "Pendiente de información", clase: "bg-amber-100 text-amber-900", significado: "Se necesita una aclaración del cliente" },
  { id: "aprobada", nombre: "Aprobada", clase: "bg-teal-100 text-teal-800", significado: "Se decidió avanzar con el pedido" },
  { id: "desarrollo", nombre: "En desarrollo", clase: "bg-indigo-100 text-indigo-800", significado: "Se está implementando" },
  { id: "pruebas", nombre: "En pruebas", clase: "bg-fuchsia-100 text-fuchsia-800", significado: "Se está verificando el funcionamiento" },
  { id: "resuelta", nombre: "Resuelta", clase: "bg-green-100 text-green-800", significado: "El cambio fue implementado" },
  { id: "rechazada", nombre: "Rechazada", clase: "bg-stone-200 text-stone-700", significado: "No se realizará la modificación" },
] as const;
export type EstadoSolicitud = (typeof ESTADOS)[number]["id"];

/** Los que siguen abiertos (todo menos resuelta y rechazada). */
export const ESTADOS_ABIERTOS: EstadoSolicitud[] = ["recibida", "evaluacion", "informacion", "aprobada", "desarrollo", "pruebas"];

export const CLASIFICACIONES = [
  { id: "evaluacion", nombre: "Pendiente de evaluación comercial" },
  { id: "mantenimiento", nombre: "Incluida en el mantenimiento" },
  { id: "cotizacion", nombre: "Sujeta a cotización" },
  { id: "general", nombre: "Mejora general de Planix" },
] as const;
export type Clasificacion = (typeof CLASIFICACIONES)[number]["id"];

export const nombreDe = <T extends { id: string; nombre: string }>(lista: readonly T[], id: string | null | undefined) => lista.find((x) => x.id === id)?.nombre ?? "—";

/** 12 → "PLN-0012". */
export const codigoSolicitud = (numero: number) => `PLN-${String(numero).padStart(4, "0")}`;

/** "PLN-0012" o "12" → 12. */
export function leerCodigo(codigo: string) {
  const n = Number(codigo.replace(/^PLN-/i, ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export type Solicitud = {
  id: string;
  numero: number;
  empresa: string;
  empresa_nombre: string;
  titulo: string;
  tipo: TipoSolicitud;
  descripcion: string;
  prioridad_sugerida: Prioridad;
  estado: EstadoSolicitud;
  prioridad_interna: PrioridadInterna | null;
  responsable: string | null;
  fecha_estimada: string | null;
  clasificacion: Clasificacion;
  resolucion: string | null;
  cotizacion_monto: number | null;
  cotizacion_detalle: string | null;
  cotizacion_estado: "pendiente" | "aprobada" | "rechazada" | null;
  cotizacion_respondida_por: string | null;
  cotizacion_respondida_en: string | null;
  creado_por_nombre: string;
  creado_por_email: string;
  creado_en: string;
  actualizado_en: string;
  actividad_cliente_en: string;
  actividad_equipo_en: string | null;
};

export type EventoSolicitud = {
  id: string;
  tipo: string;
  texto: string | null;
  datos: Record<string, unknown> | null;
  interno: boolean;
  lado: "cliente" | "equipo";
  autor_nombre: string;
  creado_en: string;
};

export type Adjunto = { id: string; evento_id: string | null; nombre: string; tipo: string; tamano: number; interno: boolean; subido_por: string; creado_en: string };

/** Adjuntos: hasta 10 MB entre todos los de un envío, de estos tipos. */
export const MAXIMO_ADJUNTOS = 10 * 1024 * 1024;
export const TIPOS_ADJUNTO = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
export const ACEPTA_ADJUNTOS = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv,.docx,.xlsx";
