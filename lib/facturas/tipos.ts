import type { Empresa } from "@/lib/empresas";

export const ESTADOS_FACTURA = ["procesando", "por_revisar", "aprobada", "rechazada", "error"] as const;
export type EstadoFactura = (typeof ESTADOS_FACTURA)[number];

export const NOMBRE_ESTADO_FACTURA: Record<EstadoFactura, string> = {
  procesando: "Procesando",
  por_revisar: "Por revisar",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  error: "Error de lectura",
};

export const COLOR_ESTADO_FACTURA: Record<EstadoFactura, string> = {
  procesando: "bg-sky-100 text-sky-800",
  por_revisar: "bg-amber-100 text-amber-800",
  aprobada: "bg-green-100 text-green-800",
  rechazada: "bg-stone-200 text-stone-600",
  error: "bg-red-100 text-red-800",
};

export const TIPOS_ARCHIVO = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const TAMANO_MAXIMO = 10 * 1024 * 1024;

export type Factura = {
  id: string;
  empresa: Empresa;
  archivo_path: string;
  archivo_nombre: string;
  archivo_tipo: string;
  estado: EstadoFactura;
  error: string | null;
  datos_ia: Record<string, unknown> | null;
  proveedor_ia: string | null;
  tipo_comprobante: string | null;
  punto_venta: string | null;
  numero: string | null;
  fecha_emision: string | null;
  cuit_emisor: string | null;
  razon_social_emisor: string | null;
  cuit_receptor: string | null;
  razon_social_receptor: string | null;
  neto: number | null;
  iva: number | null;
  total: number | null;
  duplicada_de: string | null;
  creado_en: string;
  actualizado_en: string;
};
