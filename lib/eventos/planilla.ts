import { z } from "zod";

/** Sectores de gastos de la planilla de eventos, en su orden. */
export const SECTORES = ["Artística", "Técnica", "Infraestructura", "Contenido y activaciones", "Recursos humanos", "Mercadería", "Gastronomía", "Seguros y aranceles"];

/** Tipos de factura de un gasto; el % es el IVA crédito sugerido sobre el neto. */
export const TIPOS_FACTURA = [
  { id: "", nombre: "Sin factura", iva: 0 },
  { id: "A21", nombre: "A 21%", iva: 21 },
  { id: "A105", nombre: "A 10,5%", iva: 10.5 },
  { id: "A27", nombre: "A 27%", iva: 27 },
  { id: "B", nombre: "B", iva: 0 },
  { id: "C", nombre: "C", iva: 0 },
] as const;

const monto = z.number().min(-1e13).max(1e13);
const texto = (max: number) => z.string().max(max).default("");

/** Id del renglón (lo pone el servidor al guardar): lo vincula con su movimiento de Financiero. */
const idRenglon = z.string().max(40).optional();

const esquemaIngreso = z.object({
  id: idRenglon,
  detalle: texto(200),
  neto: monto,
  // IVA débito (lo que se factura con IVA) y bruto (lo que entra).
  iva: monto,
  bruto: monto,
  factura: z.boolean().default(false),
  pagado: z.boolean().default(false),
});

const esquemaGasto = z.object({
  id: idRenglon,
  sector: texto(60),
  detalle: texto(200),
  neto: monto,
  tipo_factura: texto(10),
  // IVA crédito.
  iva: monto,
  urgente: z.boolean().default(false),
  // Lo ya pagado (seña); la diferencia es lo que falta pagar.
  sena: monto,
  datos_bancarios: texto(300),
});

const esquemaEntrada = z.object({
  detalle: texto(120),
  valor: monto,
  cantidad: z.number().min(0).max(1e7),
  proyectada: z.number().min(0).max(1e7).default(0),
});

export const esquemaPlanilla = z.object({
  /** Alícuota de IIBB sobre el neto de los ingresos facturados (%). */
  alicuota_iibb: z.number().min(0).max(100).default(4),
  ingresos: z.array(esquemaIngreso).max(300).default([]),
  gastos: z.array(esquemaGasto).max(1000).default([]),
  entradas: z.array(esquemaEntrada).max(100).default([]),
  notas: z.string().max(4000).optional(),
});

export type Ingreso = z.infer<typeof esquemaIngreso>;
export type Gasto = z.infer<typeof esquemaGasto>;
export type Entrada = z.infer<typeof esquemaEntrada>;
export type Planilla = z.infer<typeof esquemaPlanilla>;

export const PLANILLA_VACIA: Planilla = { alicuota_iibb: 4, ingresos: [], gastos: [], entradas: [] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const suma = (valores: number[]) => r2(valores.reduce((s, v) => s + v, 0));

export const totalGasto = (g: Gasto) => r2(g.neto + g.iva);
export const diferenciaGasto = (g: Gasto) => r2(totalGasto(g) - g.sena);
export const iibbIngreso = (i: Ingreso, alicuota: number) => (i.factura ? r2((i.neto * alicuota) / 100) : 0);

/** Resumen del evento como lo calcula la planilla. */
export function calcularPlanilla(p: Planilla) {
  const ingresos = {
    neto: suma(p.ingresos.map((i) => i.neto)),
    iva: suma(p.ingresos.map((i) => i.iva)),
    bruto: suma(p.ingresos.map((i) => i.bruto)),
    iibb: suma(p.ingresos.map((i) => iibbIngreso(i, p.alicuota_iibb))),
  };
  const totalesGastos = (lista: Gasto[]) => ({
    neto: suma(lista.map((g) => g.neto)),
    iva: suma(lista.map((g) => g.iva)),
    total: suma(lista.map(totalGasto)),
    sena: suma(lista.map((g) => g.sena)),
    diferencia: suma(lista.map(diferenciaGasto)),
  });
  // Sectores en el orden de la planilla; los que no están en la lista van al final.
  const nombres = [...SECTORES, ...new Set(p.gastos.map((g) => g.sector).filter((s) => s && !SECTORES.includes(s)))];
  const sectores = nombres
    .map((nombre) => ({ nombre, gastos: p.gastos.filter((g) => (g.sector || "Otros") === nombre) }))
    .concat([{ nombre: "Otros", gastos: p.gastos.filter((g) => !g.sector) }])
    .filter((s) => s.gastos.length || SECTORES.includes(s.nombre))
    .map((s) => ({ ...s, totales: totalesGastos(s.gastos) }));
  const gastos = totalesGastos(p.gastos);
  const ivaAPagar = r2(ingresos.iva - gastos.iva);
  const rentabilidad = r2(ingresos.bruto - gastos.total - ivaAPagar - ingresos.iibb);
  const entradas = {
    cantidad: p.entradas.reduce((s, e) => s + e.cantidad, 0),
    total: suma(p.entradas.map((e) => e.valor * e.cantidad)),
    cantidadProyectada: p.entradas.reduce((s, e) => s + e.proyectada, 0),
    totalProyectado: suma(p.entradas.map((e) => e.valor * e.proyectada)),
  };
  return {
    ingresos,
    gastos,
    sectores,
    ivaAPagar,
    iibb: ingresos.iibb,
    rentabilidad,
    margen: ingresos.bruto ? rentabilidad / ingresos.bruto : null,
    entradas,
  };
}
