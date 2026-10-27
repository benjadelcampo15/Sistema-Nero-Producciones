import type { Empresa } from "@/lib/empresas";

/** Comprobantes que emite la app (códigos de ARCA). */
export const TIPOS_CBTE = [
  { id: 1, nombre: "Factura A", clase: "A" },
  { id: 6, nombre: "Factura B", clase: "B" },
  { id: 11, nombre: "Factura C", clase: "C" },
] as const;
export type ClaseCbte = (typeof TIPOS_CBTE)[number]["clase"];

export function nombreTipoCbte(id: number) {
  return TIPOS_CBTE.find((t) => t.id === id)?.nombre ?? `Comprobante ${id}`;
}

export const CONCEPTOS = [
  { id: 1, nombre: "Productos" },
  { id: 2, nombre: "Servicios" },
  { id: 3, nombre: "Productos y servicios" },
] as const;

export const TIPOS_DOC = [
  { id: 80, nombre: "CUIT" },
  { id: 96, nombre: "DNI" },
  { id: 99, nombre: "Consumidor final (sin identificar)" },
] as const;

/** Alícuotas de IVA (id de ARCA → porcentaje). */
export const ALICUOTAS = [
  { id: 5, porcentaje: 21 },
  { id: 4, porcentaje: 10.5 },
  { id: 6, porcentaje: 27 },
  { id: 8, porcentaje: 5 },
  { id: 9, porcentaje: 2.5 },
  { id: 3, porcentaje: 0 },
] as const;

/**
 * Condición frente al IVA del receptor (obligatoria según ARCA) y para qué
 * clase de comprobante sirve. Tomado de FEParamGetCondicionIvaReceptor.
 */
export const CONDICIONES_IVA = [
  { id: 1, nombre: "IVA Responsable Inscripto", clases: ["A", "C"] },
  { id: 6, nombre: "Responsable Monotributo", clases: ["A", "C"] },
  { id: 13, nombre: "Monotributista Social", clases: ["A", "C"] },
  { id: 16, nombre: "Monotributo Trabajador Independiente Promovido", clases: ["A", "C"] },
  { id: 5, nombre: "Consumidor Final", clases: ["B", "C"] },
  { id: 4, nombre: "IVA Sujeto Exento", clases: ["B", "C"] },
  { id: 7, nombre: "Sujeto No Categorizado", clases: ["B", "C"] },
  { id: 9, nombre: "Cliente del Exterior", clases: ["B", "C"] },
  { id: 10, nombre: "IVA Liberado – Ley N° 19.640", clases: ["B", "C"] },
  { id: 15, nombre: "IVA No Alcanzado", clases: ["B", "C"] },
] as const;

export type ItemComprobante = {
  descripcion: string;
  cantidad: number;
  /** Precio unitario sin IVA (en Factura C es el precio final). */
  precio: number;
  /** id de alícuota de ARCA (no aplica en Factura C). */
  alicuota: number | null;
};

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Neto, IVA por alícuota y total. En Factura C no se discrimina IVA. */
export function calcularTotales(items: ItemComprobante[], clase: ClaseCbte) {
  const porAlicuota = new Map<number, { base: number; importe: number }>();
  let neto = 0;
  for (const it of items) {
    const subtotal = redondear(it.cantidad * it.precio);
    neto += subtotal;
    if (clase !== "C" && it.alicuota !== null) {
      const porcentaje = ALICUOTAS.find((a) => a.id === it.alicuota)?.porcentaje ?? 0;
      const actual = porAlicuota.get(it.alicuota) ?? { base: 0, importe: 0 };
      porAlicuota.set(it.alicuota, {
        base: redondear(actual.base + subtotal),
        importe: redondear(actual.importe + (subtotal * porcentaje) / 100),
      });
    }
  }
  const alicuotas = [...porAlicuota.entries()].map(([id, v]) => ({ id, ...v }));
  const iva = redondear(alicuotas.reduce((t, a) => t + a.importe, 0));
  neto = redondear(neto);
  return { neto, iva, total: redondear(neto + iva), alicuotas };
}

export type Comprobante = {
  id: string;
  empresa: Empresa;
  entorno: "homologacion" | "produccion";
  estado: "emitido" | "rechazado";
  tipo_cbte: number;
  punto_venta: number;
  numero: number | null;
  fecha: string;
  concepto: number;
  fecha_servicio_desde: string | null;
  fecha_servicio_hasta: string | null;
  fecha_vto_pago: string | null;
  doc_tipo: number;
  doc_nro: string;
  receptor_nombre: string | null;
  condicion_iva_receptor: number;
  items: ItemComprobante[];
  neto: number;
  iva: number;
  total: number;
  cae: string | null;
  cae_vto: string | null;
  mensajes: { codigo: string; mensaje: string }[] | null;
  evento: { id: string; nombre: string } | null;
  cliente: { email: string | null } | null;
  transaccion_id: string | null;
  token: string | null;
  mail_enviado_a: string | null;
  mail_enviado_en: string | null;
  creado_en: string;
};

export function numeroComprobante(c: Pick<Comprobante, "punto_venta" | "numero">) {
  return `${String(c.punto_venta).padStart(5, "0")}-${String(c.numero ?? 0).padStart(8, "0")}`;
}
