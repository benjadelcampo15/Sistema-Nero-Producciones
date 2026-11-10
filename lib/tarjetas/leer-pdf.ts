import "server-only";
import { z } from "zod";
import { extraerConIA } from "@/lib/ai/leer-factura";
import type { Archivo } from "@/lib/ai/proveedores";
import { leerFecha } from "@/lib/extractos/tipos";
import { cuotaDeDescripcion, tipoDeDescripcion, type LineaTarjeta } from "./tipos";

const INSTRUCCIONES = `Es el resumen mensual de una tarjeta de crédito de un banco de Argentina (por ejemplo BBVA Visa o Mastercard).
Puede ser un PDF digital o escaneado. Extraé TODOS los renglones del detalle, sin omitir ninguno y en el orden en que aparecen:
- los consumos (de todos los titulares y adicionales),
- los pagos y créditos (por ejemplo "SU PAGO EN PESOS", devoluciones, bonificaciones), con importe NEGATIVO,
- los impuestos, cargos e intereses (sellos, intereses de financiación, punitorios, IVA, comisión de mantenimiento,
  percepciones de IVA, "DB.RG 5617", IIBB, etc.).
Para cada renglón:
- fecha (YYYY-MM-DD; si no tiene fecha, null). Los resúmenes suelen mostrar "29-Ene-26" o "29/01/26": el año es 2026.
- descripcion tal cual figura (sin el importe),
- cupon (número de cupón o comprobante si figura, si no null),
- cuota y cuotas si es una compra en cuotas ("C.02/06" → cuota 2, cuotas 6; si no, null),
- pesos: importe de la columna en pesos (0 si el renglón es en dólares),
- dolares: importe de la columna en dólares (0 si el renglón es en pesos),
- tipo: "consumo", "pago" o "cargo".
Los montos en formato argentino ("1.234,56") pasalos a número (1234.56).
No incluyas como renglones el saldo anterior, los subtotales ("TOTAL CONSUMOS DE ..."), el saldo actual ni el pago mínimo: van aparte.`;

const numero = (description: string) => ({ type: ["number", "null"], description });
const ESQUEMA = {
  type: "object",
  properties: {
    tarjeta: { type: "string", description: "Banco y marca de la tarjeta, por ejemplo 'BBVA Visa'" },
    fecha_cierre: { type: "string", description: "Fecha de cierre del resumen (YYYY-MM-DD)" },
    vencimiento: { type: ["string", "null"], description: "Fecha de vencimiento (YYYY-MM-DD)" },
    saldo_anterior_ars: numero("Saldo anterior en pesos"),
    saldo_anterior_usd: numero("Saldo anterior en dólares"),
    saldo_actual_ars: numero("Saldo actual en pesos (total a pagar en pesos)"),
    saldo_actual_usd: numero("Saldo actual en dólares"),
    total_consumos_ars: numero("Suma de los totales de consumos en pesos (de todos los titulares), sin impuestos ni cargos. null si no figura"),
    total_consumos_usd: numero("Suma de los totales de consumos en dólares. null si no figura"),
    movimientos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fecha: { type: ["string", "null"] },
          descripcion: { type: "string" },
          cupon: { type: ["string", "null"] },
          cuota: { type: ["integer", "null"] },
          cuotas: { type: ["integer", "null"] },
          pesos: { type: "number" },
          dolares: { type: "number" },
          tipo: { type: "string", enum: ["consumo", "pago", "cargo"] },
        },
        required: ["fecha", "descripcion", "cupon", "cuota", "cuotas", "pesos", "dolares", "tipo"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "tarjeta",
    "fecha_cierre",
    "vencimiento",
    "saldo_anterior_ars",
    "saldo_anterior_usd",
    "saldo_actual_ars",
    "saldo_actual_usd",
    "total_consumos_ars",
    "total_consumos_usd",
    "movimientos",
  ],
  additionalProperties: false,
};

const n = z.number().nullable();
const respuesta = z.object({
  tarjeta: z.string(),
  fecha_cierre: z.string(),
  vencimiento: z.string().nullable(),
  saldo_anterior_ars: n,
  saldo_anterior_usd: n,
  saldo_actual_ars: n,
  saldo_actual_usd: n,
  total_consumos_ars: n,
  total_consumos_usd: n,
  movimientos: z.array(
    z.object({
      fecha: z.string().nullable(),
      descripcion: z.string(),
      cupon: z.string().nullable(),
      cuota: z.number().nullable(),
      cuotas: z.number().nullable(),
      pesos: z.number(),
      dolares: z.number(),
      tipo: z.string(),
    }),
  ),
});

export type ResumenLeido = {
  tarjeta: string;
  fecha_cierre: string | null;
  vencimiento: string | null;
  saldo_anterior_ars: number | null;
  saldo_anterior_usd: number | null;
  saldo_actual_ars: number | null;
  saldo_actual_usd: number | null;
  total_consumos_ars: number | null;
  total_consumos_usd: number | null;
  lineas: LineaTarjeta[];
  salteadas: number;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const entero = (v: number | null) => (v !== null && Number.isInteger(v) && v > 0 && v < 1000 ? v : null);

/** Lee el resumen de la tarjeta con la IA. Los renglones sin importe se descartan (y se cuentan). */
export async function leerResumenPdf(archivo: Archivo): Promise<ResumenLeido> {
  const { datos } = await extraerConIA(archivo, INSTRUCCIONES, ESQUEMA, (crudo) => {
    const v = respuesta.safeParse(crudo);
    if (!v.success) throw new Error("La IA no devolvió los movimientos del resumen");
    return v.data;
  });
  let salteadas = 0;
  const lineas: LineaTarjeta[] = [];
  for (const m of datos.movimientos) {
    const pesos = r2(m.pesos);
    const dolares = r2(m.dolares);
    const descripcion = m.descripcion.trim().slice(0, 300);
    if ((!pesos && !dolares) || !descripcion) {
      salteadas++;
      continue;
    }
    // La cuota que figura en la descripción manda (es lo que imprime el banco).
    const enTexto = cuotaDeDescripcion(descripcion);
    // El tipo se controla con la descripción: un impuesto que la IA tomó como consumo pasa a cargo.
    const porTexto = tipoDeDescripcion(descripcion, pesos || dolares);
    const tipo = porTexto !== "consumo" ? porTexto : m.tipo === "pago" && (pesos < 0 || dolares < 0) ? "pago" : "consumo";
    lineas.push({
      fecha: m.fecha ? leerFecha(m.fecha) : null,
      descripcion,
      cupon: m.cupon?.trim().slice(0, 40) || null,
      cuota: enTexto?.cuota ?? entero(m.cuota),
      cuotas: enTexto?.cuotas ?? entero(m.cuotas),
      pesos,
      dolares,
      tipo,
    });
  }
  return {
    tarjeta: datos.tarjeta.trim().slice(0, 60),
    fecha_cierre: leerFecha(datos.fecha_cierre),
    vencimiento: datos.vencimiento ? leerFecha(datos.vencimiento) : null,
    saldo_anterior_ars: datos.saldo_anterior_ars,
    saldo_anterior_usd: datos.saldo_anterior_usd,
    saldo_actual_ars: datos.saldo_actual_ars,
    saldo_actual_usd: datos.saldo_actual_usd,
    total_consumos_ars: datos.total_consumos_ars,
    total_consumos_usd: datos.total_consumos_usd,
    lineas,
    salteadas,
  };
}
