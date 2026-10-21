import "server-only";
import { z } from "zod";

/**
 * Datos que la IA extrae de una factura. Todos los campos son obligatorios
 * (los proveedores lo exigen para respuestas estructuradas estrictas): si un
 * dato no figura, la IA devuelve "" o 0 y la persona lo completa al revisar.
 */
export const esquemaDatosFactura = z.object({
  tipo_comprobante: z.string(),
  punto_venta: z.string(),
  numero: z.string(),
  fecha_emision: z.string(),
  cuit_emisor: z.string(),
  razon_social_emisor: z.string(),
  cuit_receptor: z.string(),
  razon_social_receptor: z.string(),
  neto: z.number(),
  iva: z.number(),
  otros_impuestos: z.number(),
  total: z.number(),
  moneda: z.enum(["ARS", "USD"]),
  descripcion: z.string(),
  items: z.array(z.object({ descripcion: z.string(), importe: z.number() })),
  emitida_por_nero: z.boolean(),
  categoria_sugerida: z.string(),
  confianza: z.enum(["alta", "media", "baja"]),
  observaciones: z.string(),
});

export type DatosFactura = z.infer<typeof esquemaDatosFactura>;

/** JSON Schema compatible con OpenAI (modo estricto) y Gemini (responseJsonSchema). */
export function jsonSchemaFactura(categorias: string[]) {
  const texto = (description: string) => ({ type: "string", description });
  const numero = (description: string) => ({ type: "number", description });
  const propiedades = {
    tipo_comprobante: texto('Letra o tipo: "A", "B", "C", "M", "E", "Ticket", "Recibo", "Nota de crédito A", etc.'),
    punto_venta: texto("Punto de venta, solo dígitos (ej: 00003)"),
    numero: texto("Número de comprobante, solo dígitos (ej: 00001234)"),
    fecha_emision: texto("Fecha de emisión en formato YYYY-MM-DD"),
    cuit_emisor: texto("CUIT del emisor, 11 dígitos sin guiones"),
    razon_social_emisor: texto("Razón social o nombre del emisor"),
    cuit_receptor: texto("CUIT del receptor/cliente, 11 dígitos sin guiones"),
    razon_social_receptor: texto("Razón social o nombre del receptor/cliente"),
    neto: numero("Importe neto gravado (sin IVA). 0 si no figura"),
    iva: numero("Total de IVA. 0 si no figura (ej: factura C)"),
    otros_impuestos: numero("Percepciones, IIBB y otros tributos. 0 si no hay"),
    total: numero("Importe total de la factura"),
    moneda: { type: "string", enum: ["ARS", "USD"], description: "Moneda del comprobante" },
    descripcion: texto("Resumen corto de qué se factura (máx. 80 caracteres)"),
    items: {
      type: "array",
      description: "Renglones del detalle (máximo 20)",
      items: {
        type: "object",
        properties: { descripcion: texto("Detalle del renglón"), importe: numero("Importe del renglón") },
        required: ["descripcion", "importe"],
        additionalProperties: false,
      },
    },
    emitida_por_nero: {
      type: "boolean",
      description: "true si el EMISOR es Nero Producciones (es un ingreso); false si Nero la recibe (es un gasto)",
    },
    categoria_sugerida: {
      type: "string",
      enum: categorias,
      description: "Categoría contable más adecuada de la lista",
    },
    confianza: {
      type: "string",
      enum: ["alta", "media", "baja"],
      description: "Qué tan legible y completa estaba la factura",
    },
    observaciones: texto("Algo a revisar (datos ilegibles, montos que no cierran, etc.). Vacío si no hay"),
  };
  return {
    type: "object",
    properties: propiedades,
    required: Object.keys(propiedades),
    additionalProperties: false,
  };
}

export function instruccionesFactura(nombresCategorias: string[]) {
  const cuitNero = process.env.NERO_CUIT?.replace(/\D/g, "");
  return [
    "Sos un asistente contable argentino. Extraé los datos de este comprobante (factura, ticket o recibo; normalmente emitido según las normas de ARCA/AFIP).",
    `La empresa usuaria es Nero Producciones${cuitNero ? ` (CUIT ${cuitNero})` : ""}. Si Nero es el emisor, la factura es un ingreso; si Nero es el receptor, es un gasto.`,
    "Reglas:",
    "- Montos como números con punto decimal (1234.56), sin separador de miles.",
    "- CUIT: solo los 11 dígitos.",
    "- Fechas en formato YYYY-MM-DD.",
    '- Si un dato no figura o es ilegible, devolvé "" (texto) o 0 (número) y mencionalo en observaciones. No inventes datos.',
    "- Verificá que neto + IVA + otros impuestos ≈ total; si no cierra, decilo en observaciones.",
    `- categoria_sugerida tiene que ser una de: ${nombresCategorias.join(", ")}.`,
  ].join("\n");
}
