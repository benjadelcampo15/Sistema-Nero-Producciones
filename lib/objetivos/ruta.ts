import { z } from "zod";
import { formatoPesos } from "@/lib/formato";

/**
 * Objetivos de Ruta. Enero a septiembre 2026 son una foto de la planilla
 * ("historico"); desde octubre 2026 cada mes se calcula con estas reglas
 * ("automatico"), sin depender de posiciones de celdas.
 */

/** Primer mes con cálculo automático; los anteriores son el histórico de la planilla. */
export const PRIMER_PERIODO_AUTOMATICO = "2026-10";

export const IVA = 0.21;
export const IB = 0.04;

export const periodo = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, "0")}`;
const r2 = (n: number) => Math.round(n * 100) / 100;
const suma = (ns: number[]) => r2(ns.reduce((s, n) => s + n, 0));
const pct = (n: number) => `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)}%`;

// ─── Mes automático ──────────────────────────────────────────────────────

const monto = z.number().min(-1e13).max(1e13);
const porcentaje = z.number().min(0).max(100);
const texto = (max: number) => z.string().trim().max(max);

const fila = z.object({ concepto: texto(200), monto });
const reparto = z.object({ nombre: texto(80), porcentaje });

export const esquemaMesRuta = z.object({
  fees: z.array(z.object({ cliente_id: z.uuid(), neto: monto })).max(100).default([]),
  // Porcentaje de cada colaborador sobre el total neto de fees del mes (8 = 8%).
  porcentajes: z.array(z.object({ colaborador_id: z.uuid(), porcentaje })).max(60).default([]),
  gastos_fijos: z.array(fila).max(200).default([]),
  gastos_variables: z.array(fila).max(200).default([]),
  one_shots: z
    .array(
      z.object({
        id: texto(40),
        cliente: texto(200),
        descripcion: texto(300),
        neto: monto,
        asignaciones: z.array(z.object({ colaborador_id: z.uuid(), monto })).max(60).default([]),
      }),
    )
    .max(100)
    .default([]),
  distribucion_mensual: z.array(reparto).max(20).default([]),
  distribucion_variable: z.array(reparto).max(20).default([]),
  // Para revisar con el equipo (diferencias con la planilla, criterios a confirmar).
  observaciones: z.array(texto(1500)).max(50).default([]),
  notas: z.string().max(4000).optional(),
});
export type MesRuta = z.infer<typeof esquemaMesRuta>;

export const MES_RUTA_VACIO: MesRuta = {
  fees: [],
  porcentajes: [],
  gastos_fijos: [],
  gastos_variables: [],
  one_shots: [],
  distribucion_mensual: [],
  distribucion_variable: [],
  observaciones: [],
};

/** Balance de un evento de Ruta en el mes (resultado = ingresos − egresos de sus movimientos). */
export type EventoRuta = { id: string; nombre: string; fecha: string; ingresos: number; egresos: number; resultado: number };

/** Un importe calculado y de dónde sale. */
export type Calculado = { valor: number; formula: string };
const calc = (valor: number, formula: string): Calculado => ({ valor: r2(valor), formula });

const esEstructura = (nombre: string) => /estructura/i.test(nombre);
const PARECE_IMPUESTO = /\biva\b|ingresos brutos|\biibb\b|\bib\b/i;

export function calcularMesRuta(d: MesRuta, nombres: { clientes: Map<string, string>; colaboradores: Map<string, string> }, eventos: EventoRuta[]) {
  const cliente = (id: string) => nombres.clientes.get(id) ?? "Cliente borrado";
  const colaborador = (id: string) => nombres.colaboradores.get(id) ?? "Colaborador borrado";

  // Fees: IVA y bruto para facturar; el IB (4% del neto) es costo y no se suma al cliente.
  const fees = d.fees.map((f) => ({
    cliente_id: f.cliente_id,
    cliente: cliente(f.cliente_id),
    neto: f.neto,
    iva: r2(f.neto * IVA),
    bruto: r2(f.neto * (1 + IVA)),
    ib: r2(f.neto * IB),
  }));
  const fNeto = suma(fees.map((f) => f.neto));
  const totalFees = {
    neto: calc(fNeto, `Suma de los netos de ${fees.length} cliente${fees.length === 1 ? "" : "s"}`),
    iva: calc(suma(fees.map((f) => f.iva)), `${formatoPesos(fNeto)} × 21%`),
    bruto: calc(suma(fees.map((f) => f.bruto)), `Neto + IVA`),
    ib: calc(suma(fees.map((f) => f.ib)), `${formatoPesos(fNeto)} × 4%`),
  };

  // Sueldos sobre el total neto de fees.
  const sueldos = d.porcentajes.map((p) => ({
    colaborador_id: p.colaborador_id,
    colaborador: colaborador(p.colaborador_id),
    porcentaje: p.porcentaje,
    sueldo: calc((fNeto * p.porcentaje) / 100, `${formatoPesos(fNeto)} (neto fees) × ${pct(p.porcentaje)}`),
  }));
  const porcentajeSueldos = r2(suma(d.porcentajes.map((p) => p.porcentaje)));
  const totalSueldos = calc(suma(sueldos.map((s) => s.sueldo.valor)), `${pct(porcentajeSueldos)} del neto de fees`);

  // One shots: neto − IB − asignaciones = saldo para estructura (integra el resultado mensual).
  const oneShots = d.one_shots.map((o) => {
    const asignado = suma(o.asignaciones.map((a) => a.monto));
    const ib = r2(o.neto * IB);
    return {
      ...o,
      iva: r2(o.neto * IVA),
      bruto: r2(o.neto * (1 + IVA)),
      ib,
      asignado,
      estructura: calc(o.neto - ib - asignado, `${formatoPesos(o.neto)} neto − ${formatoPesos(ib)} IB − ${formatoPesos(asignado)} asignado`),
    };
  });
  const oNeto = suma(oneShots.map((o) => o.neto));
  const totalOneShots = {
    neto: calc(oNeto, `Suma de ${oneShots.length} one shot${oneShots.length === 1 ? "" : "s"}`),
    iva: calc(suma(oneShots.map((o) => o.iva)), `${formatoPesos(oNeto)} × 21%`),
    bruto: calc(suma(oneShots.map((o) => o.bruto)), "Neto + IVA"),
    ib: calc(suma(oneShots.map((o) => o.ib)), `${formatoPesos(oNeto)} × 4%`),
    asignado: calc(suma(oneShots.map((o) => o.asignado)), "Suma de las asignaciones a empleados"),
    estructura: calc(suma(oneShots.map((o) => o.estructura.valor)), "Neto − IB − asignaciones de todos los one shots"),
  };

  // Lo que cobra cada colaborador en el mes: sueldo sobre fees + one shots.
  const ids = [...new Set([...d.porcentajes.map((p) => p.colaborador_id), ...d.one_shots.flatMap((o) => o.asignaciones.map((a) => a.colaborador_id))])];
  const porColaborador = ids.map((id) => {
    const sueldo = sueldos.find((s) => s.colaborador_id === id)?.sueldo.valor ?? 0;
    const os = suma(d.one_shots.flatMap((o) => o.asignaciones.filter((a) => a.colaborador_id === id).map((a) => a.monto)));
    return { colaborador_id: id, colaborador: colaborador(id), sueldo, oneShots: os, total: r2(sueldo + os) };
  });

  const fijos = calc(suma(d.gastos_fijos.map((g) => g.monto)), `Suma de ${d.gastos_fijos.length} gasto${d.gastos_fijos.length === 1 ? "" : "s"} fijo${d.gastos_fijos.length === 1 ? "" : "s"}`);
  const variables = calc(suma(d.gastos_variables.map((g) => g.monto)), `Suma de ${d.gastos_variables.length} gasto${d.gastos_variables.length === 1 ? "" : "s"} variable${d.gastos_variables.length === 1 ? "" : "s"}`);

  // Resultado mensual: sobre netos (el IVA se cobra y se paga, no es rentabilidad).
  const lineasMensual = [
    { concepto: "Fees netos", valor: fNeto, signo: 1 },
    { concepto: "Ingresos brutos de fees (4%)", valor: totalFees.ib.valor, signo: -1 },
    { concepto: "Sueldos sobre fees", valor: totalSueldos.valor, signo: -1 },
    { concepto: "Gastos fijos", valor: fijos.valor, signo: -1 },
    { concepto: "Gastos variables", valor: variables.valor, signo: -1 },
    { concepto: "One shots: saldo para estructura", valor: totalOneShots.estructura.valor, signo: 1 },
  ];
  const rentabilidad = calc(
    suma(lineasMensual.map((l) => l.signo * l.valor)),
    "Fees netos − IB fees − sueldos − gastos fijos − gastos variables + saldo de one shots",
  );

  // Rentabilidad variable: el resultado del balance de cada evento de Ruta del mes (ya neto de sus costos).
  const variable = calc(suma(eventos.map((e) => e.resultado)), `Suma del balance de ${eventos.length} evento${eventos.length === 1 ? "" : "s"} de Ruta`);

  const repartir = (lista: MesRuta["distribucion_mensual"], base: Calculado, titulo: string) => {
    const total = r2(suma(lista.map((r) => r.porcentaje)));
    // Con pérdida no hay reparto: nunca se generan pagos negativos.
    const conReparto = base.valor > 0;
    return {
      titulo,
      base,
      sumaPorcentajes: total,
      ok: Math.abs(total - 100) < 0.001,
      conReparto,
      filas: lista.map((r) => ({
        ...r,
        monto: calc(conReparto ? (base.valor * r.porcentaje) / 100 : 0, conReparto ? `${formatoPesos(base.valor)} × ${pct(r.porcentaje)}` : "Sin reparto: el resultado no es positivo"),
      })),
    };
  };
  const repartoMensual = repartir(d.distribucion_mensual, rentabilidad, "Distribución de la rentabilidad mensual");
  const repartoVariable = repartir(d.distribucion_variable, variable, "Distribución de la rentabilidad variable");

  const estructuraDe = (r: ReturnType<typeof repartir>) => suma(r.filas.filter((f) => esEstructura(f.nombre)).map((f) => f.monto.valor));
  const cajaEstructura = calc(
    estructuraDe(repartoMensual) + estructuraDe(repartoVariable),
    "Parte de estructura del reparto mensual + parte de estructura del reparto variable",
  );

  // Avisos para no contar dos veces ni dejar repartos mal armados.
  const avisos: string[] = [];
  for (const r of [repartoMensual, repartoVariable]) {
    if (r.filas.length && !r.ok) avisos.push(`${r.titulo}: los porcentajes suman ${pct(r.sumaPorcentajes)} (tienen que sumar 100%).`);
    if (!r.conReparto && r.base.valor < 0) avisos.push(`${r.titulo}: el resultado es negativo (${formatoPesos(r.base.valor)}); no se reparte.`);
  }
  for (const g of [...d.gastos_fijos, ...d.gastos_variables]) {
    if (PARECE_IMPUESTO.test(g.concepto)) avisos.push(`"${g.concepto}" parece un impuesto que ya calcula el sistema (IVA e IB de fees y one shots): revisá que no esté cargado dos veces.`);
  }
  for (const g of d.gastos_variables) {
    const evento = eventos.find((e) => g.concepto && e.nombre.toLowerCase().includes(g.concepto.toLowerCase().trim()));
    if (evento) avisos.push(`El gasto variable "${g.concepto}" coincide con el evento "${evento.nombre}": si ya está en su balance, no lo cargues acá.`);
  }
  for (const o of oneShots) if (o.estructura.valor < 0) avisos.push(`One shot "${o.descripcion || o.cliente}": lo asignado supera el neto menos IB.`);

  return {
    fees,
    totalFees,
    sueldos,
    porcentajeSueldos,
    totalSueldos,
    oneShots,
    totalOneShots,
    porColaborador,
    fijos,
    variables,
    impuestos: {
      ivaFees: totalFees.iva,
      ibFees: totalFees.ib,
      ivaOneShots: totalOneShots.iva,
      ibOneShots: totalOneShots.ib,
    },
    lineasMensual,
    rentabilidad,
    eventos,
    variable,
    repartoMensual,
    repartoVariable,
    cajaEstructura,
    avisos,
  };
}
export type CalculoRuta = ReturnType<typeof calcularMesRuta>;

// ─── Histórico (foto de la planilla) ─────────────────────────────────────

const columna = z.object({ titulo: texto(60), tipo: z.enum(["pesos", "porcentaje"]).default("pesos") });
const seccionHistorica = z.object({
  titulo: texto(120),
  grupo: z.enum(["ingresos", "costos", "variable", "reparto", "info"]),
  columnas: z.array(columna).max(8),
  filas: z.array(z.object({ detalle: texto(200), valores: z.array(z.number().nullable()) })).max(200),
  totales: z.array(z.number().nullable()),
  // De dónde sale cada total en la planilla (celda y fórmula).
  formulas: z.array(texto(300)).default([]),
});

export const esquemaHistorico = z.object({
  pestana: texto(60),
  modelo: texto(300),
  secciones: z.array(seccionHistorica).max(30),
  resultado: z.object({
    ingresos: z.number().nullable(),
    gastos: z.number().nullable(),
    rentabilidad: z.number(),
    formula: texto(500),
  }),
  extras: z.array(z.object({ detalle: texto(200), monto: z.number().nullable(), formula: texto(300).optional() })).max(30).default([]),
  anualPlanilla: z.number().nullable().default(null),
  observaciones: z.array(texto(1500)).max(50).default([]),
});
export type Historico = z.infer<typeof esquemaHistorico>;
