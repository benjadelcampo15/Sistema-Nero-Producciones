import { z } from "zod";

export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const item = z.object({
  detalle: z.string().trim().max(200),
  monto: z.number().min(-1e13).max(1e13),
  nota: z.string().max(500).optional(),
});
const lista = z.array(item).max(200).default([]);

/** Un mes de la planilla de objetivos. */
export const esquemaMes = z.object({
  fees: lista,
  eventos: lista,
  salarios: lista,
  creators: lista,
  fijos: lista,
  variables: lista,
  distribucion: z.array(z.object({ detalle: z.string().trim().max(100), porcentaje: z.number().min(0).max(100) })).max(30).default([]),
  notas: z.string().max(4000).optional(),
});

export type Item = z.infer<typeof item>;
export type DatosMes = z.infer<typeof esquemaMes>;
export type ListaMes = "fees" | "eventos" | "salarios" | "creators" | "fijos" | "variables";

/** Bloques de la planilla, en el orden en que se muestran. */
export const BLOQUES: { id: ListaMes; nombre: string; grupo: "ingresos" | "costos"; total: string }[] = [
  { id: "fees", nombre: "Fees", grupo: "ingresos", total: "Total fees" },
  { id: "eventos", nombre: "Rentabilidad eventos", grupo: "ingresos", total: "Total rent. campaña" },
  { id: "salarios", nombre: "Costo salario general", grupo: "costos", total: "Total costo sal. gral." },
  { id: "creators", nombre: "Costo salario creators", grupo: "costos", total: "Total costo sal. creators" },
  { id: "fijos", nombre: "Gastos fijos", grupo: "costos", total: "Total gastos fijos" },
  { id: "variables", nombre: "Gastos variables", grupo: "costos", total: "Total gastos variables" },
];

export const MES_VACIO: DatosMes = { fees: [], eventos: [], salarios: [], creators: [], fijos: [], variables: [], distribucion: [] };

const suma = (l: Item[]) => Math.round(l.reduce((s, i) => s + i.monto, 0) * 100) / 100;
const dividir = (a: number, b: number) => (b ? a / b : null);

/** Totales y ratios de un mes, como los calcula la planilla. */
export function calcularMes(d: DatosMes) {
  const t = Object.fromEntries(BLOQUES.map((b) => [b.id, suma(d[b.id])])) as Record<ListaMes, number>;
  const ingreso = t.fees + t.eventos;
  const costos = t.salarios + t.creators + t.fijos + t.variables;
  const final = Math.round((ingreso - costos) * 100) / 100;
  return {
    totales: t,
    ingreso,
    costos,
    final,
    ratios: [
      { nombre: "Venta fee / total ventas", valor: dividir(t.fees, ingreso) },
      { nombre: "Rent. eventos / total ventas", valor: dividir(t.eventos, ingreso) },
      { nombre: "Costo sal. gral. / total ventas", valor: dividir(t.salarios, ingreso) },
      { nombre: "Costo sal. creators / total ventas", valor: dividir(t.creators, ingreso) },
      { nombre: "Gastos fijos / total costos", valor: dividir(t.fijos, costos) },
      { nombre: "Gastos variables / total costos", valor: dividir(t.variables, costos) },
      { nombre: "Rentabilidad % sobre ventas", valor: dividir(final, ingreso) },
    ],
    // Reparto de la rentabilidad del mes según los porcentajes.
    distribucion: d.distribucion.map((x) => ({ ...x, monto: Math.round(final * x.porcentaje) / 100 })),
  };
}
