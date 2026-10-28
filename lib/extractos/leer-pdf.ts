import "server-only";
import { z } from "zod";
import { extraerConIA } from "@/lib/ai/leer-factura";
import type { Archivo } from "@/lib/ai/proveedores";
import { leerFecha, type LineaLeida } from "./tipos";

const INSTRUCCIONES = `Es un extracto o resumen de cuenta bancaria (o de billetera virtual) de Argentina.
Extraé TODOS los movimientos de la cuenta, sin omitir ninguno y en el orden en que aparecen.
Para cada uno: fecha (YYYY-MM-DD), concepto tal cual figura, referencia o número de comprobante si hay,
monto con signo (positivo si entra plata a la cuenta —crédito—, negativo si sale —débito—) y el saldo
después del movimiento si el extracto lo muestra (null si no).
Los montos en formato argentino ("1.234,56") pasalos a número (1234.56).
No incluyas renglones de saldo anterior, subtotales ni totales como movimientos: el saldo inicial
y el saldo final van aparte. Si hay varias cuentas o monedas, tomá solo la cuenta en pesos principal.`;

const numero = (description: string) => ({ type: ["number", "null"], description });
const ESQUEMA = {
  type: "object",
  properties: {
    desde: { type: "string", description: "Primer día del período del extracto (YYYY-MM-DD)" },
    hasta: { type: "string", description: "Último día del período del extracto (YYYY-MM-DD)" },
    saldo_inicial: numero("Saldo al inicio del período (saldo anterior). null si no figura"),
    saldo_final: numero("Saldo al final del período. null si no figura"),
    movimientos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "YYYY-MM-DD" },
          concepto: { type: "string" },
          referencia: { type: ["string", "null"] },
          monto: { type: "number", description: "Positivo = crédito, negativo = débito" },
          saldo: numero("Saldo después del movimiento. null si no figura"),
        },
        required: ["fecha", "concepto", "referencia", "monto", "saldo"],
        additionalProperties: false,
      },
    },
  },
  required: ["desde", "hasta", "saldo_inicial", "saldo_final", "movimientos"],
  additionalProperties: false,
};

const respuesta = z.object({
  desde: z.string(),
  hasta: z.string(),
  saldo_inicial: z.number().nullable(),
  saldo_final: z.number().nullable(),
  movimientos: z.array(
    z.object({ fecha: z.string(), concepto: z.string(), referencia: z.string().nullable(), monto: z.number(), saldo: z.number().nullable() }),
  ),
});

/** Lee un extracto en PDF con la IA. Las fechas inválidas o montos en cero se descartan (y se cuentan). */
export async function leerExtractoPdf(archivo: Archivo) {
  const { datos } = await extraerConIA(archivo, INSTRUCCIONES, ESQUEMA, (crudo) => {
    const v = respuesta.safeParse(crudo);
    if (!v.success) throw new Error("La IA no devolvió los movimientos del extracto");
    return v.data;
  });
  const lineas: LineaLeida[] = [];
  let salteadas = 0;
  for (const m of datos.movimientos) {
    const fecha = leerFecha(m.fecha);
    const monto = Math.round(m.monto * 100) / 100;
    if (!fecha || !monto) {
      salteadas++;
      continue;
    }
    lineas.push({
      fecha,
      concepto: m.concepto.trim().slice(0, 300),
      referencia: m.referencia?.trim().slice(0, 100) || null,
      monto,
      saldo: m.saldo === null ? null : Math.round(m.saldo * 100) / 100,
    });
  }
  return {
    lineas,
    salteadas,
    desde: leerFecha(datos.desde),
    hasta: leerFecha(datos.hasta),
    saldoInicial: datos.saldo_inicial,
    saldoFinal: datos.saldo_final,
  };
}
