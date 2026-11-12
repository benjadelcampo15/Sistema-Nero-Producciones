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
  // Porcentaje de ingresos brutos sobre los netos (4 = 4%).
  ib_porcentaje: porcentaje.optional(),
  // Correcciones a mano de importes calculados (clave → valor): mandan sobre el cálculo hasta restaurarlas.
  ajustes: z.record(z.string().max(120), monto).default({}),
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
  ajustes: {},
};

/**
 * Un evento de Ruta en el mes, con los mismos cinco indicadores que muestra la
 * planilla del evento (total ingresos, total gastos, IVA a pagar, IIBB y
 * rentabilidad real). Sin planilla, se usa el balance de sus movimientos.
 */
export type EventoRuta = {
  id: string;
  nombre: string;
  fecha: string;
  ingresos: number;
  egresos: number;
  iva: number;
  iibb: number;
  rentabilidad: number;
  /** Sin planilla cargada: ingresos − egresos de sus movimientos (sin IVA ni IIBB). */
  sinPlanilla?: boolean;
  /** Formato viejo (cierres anteriores): ingresos − egresos. */
  resultado?: number;
};

/** Normaliza un evento guardado en un cierre viejo (solo traía ingresos, egresos y resultado). */
export const eventoRutaCompleto = (e: EventoRuta): EventoRuta =>
  e.rentabilidad === undefined
    ? { ...e, iva: 0, iibb: 0, rentabilidad: e.resultado ?? r2(e.ingresos - e.egresos), sinPlanilla: true }
    : e;

/**
 * Un importe calculado y de dónde sale. Si tiene clave, se puede corregir a
 * mano: el ajuste manda sobre el cálculo hasta que se restaura.
 */
export type Calculado = { valor: number; formula: string; clave?: string; automatico?: number; manual?: boolean };

const esEstructura = (nombre: string) => /estructura/i.test(nombre);
const PARECE_IMPUESTO = /\biva\b|ingresos brutos|\biibb\b|\bib\b/i;

export function calcularMesRuta(d: MesRuta, nombres: { clientes: Map<string, string>; colaboradores: Map<string, string> }, eventosOriginales: EventoRuta[]) {
  const cliente = (id: string) => nombres.clientes.get(id) ?? "Cliente borrado";
  const colaborador = (id: string) => nombres.colaboradores.get(id) ?? "Colaborador borrado";
  const ajustes = d.ajustes ?? {};
  /** El valor vigente: el ajuste manual si hay, si no el automático. */
  const v = (clave: string, automatico: number, formula: string): Calculado =>
    Object.hasOwn(ajustes, clave)
      ? { valor: r2(ajustes[clave]), formula, clave, automatico: r2(automatico), manual: true }
      : { valor: r2(automatico), formula, clave };
  const ib = (d.ib_porcentaje ?? IB * 100) / 100;
  const ibTexto = pct(ib * 100);

  // Fees: IVA y bruto para facturar; el IB (del neto) es costo y no se suma al cliente.
  const fees = d.fees.map((f) => ({
    cliente_id: f.cliente_id,
    cliente: cliente(f.cliente_id),
    neto: f.neto,
    iva: v(`fee:${f.cliente_id}:iva`, f.neto * IVA, `${formatoPesos(f.neto)} × 21%`),
    bruto: v(`fee:${f.cliente_id}:bruto`, f.neto * (1 + IVA), "Neto + IVA"),
    ib: v(`fee:${f.cliente_id}:ib`, f.neto * ib, `${formatoPesos(f.neto)} × ${ibTexto}`),
  }));
  const totalFees = {
    neto: v("fees:neto", suma(fees.map((f) => f.neto)), `Suma de los netos de ${fees.length} cliente${fees.length === 1 ? "" : "s"}`),
    iva: v("fees:iva", suma(fees.map((f) => f.iva.valor)), "Suma del IVA de cada cliente"),
    bruto: v("fees:bruto", suma(fees.map((f) => f.bruto.valor)), "Suma del bruto de cada cliente"),
    ib: v("fees:ib", suma(fees.map((f) => f.ib.valor)), `Suma del IB (${ibTexto}) de cada cliente`),
  };
  const fNeto = totalFees.neto.valor;

  // Sueldos sobre el total neto de fees.
  const sueldos = d.porcentajes.map((p) => ({
    colaborador_id: p.colaborador_id,
    colaborador: colaborador(p.colaborador_id),
    porcentaje: p.porcentaje,
    sueldo: v(`sueldo:${p.colaborador_id}`, (fNeto * p.porcentaje) / 100, `${formatoPesos(fNeto)} (neto fees) × ${pct(p.porcentaje)}`),
  }));
  const porcentajeSueldos = r2(suma(d.porcentajes.map((p) => p.porcentaje)));
  const totalSueldos = v("sueldos:total", suma(sueldos.map((s) => s.sueldo.valor)), `Suma de los sueldos (${pct(porcentajeSueldos)} del neto de fees)`);

  // One shots: neto − IB − asignaciones = saldo para estructura (integra el resultado mensual).
  const oneShots = d.one_shots.map((o) => {
    const asignado = v(`os:${o.id}:asignado`, suma(o.asignaciones.map((a) => a.monto)), "Suma de las asignaciones");
    const ibOs = v(`os:${o.id}:ib`, o.neto * ib, `${formatoPesos(o.neto)} × ${ibTexto}`);
    return {
      ...o,
      iva: v(`os:${o.id}:iva`, o.neto * IVA, `${formatoPesos(o.neto)} × 21%`),
      bruto: v(`os:${o.id}:bruto`, o.neto * (1 + IVA), "Neto + IVA"),
      ib: ibOs,
      asignado,
      estructura: v(
        `os:${o.id}:estructura`,
        o.neto - ibOs.valor - asignado.valor,
        `${formatoPesos(o.neto)} neto − ${formatoPesos(ibOs.valor)} IB − ${formatoPesos(asignado.valor)} asignado`,
      ),
    };
  });
  const totalOneShots = {
    neto: v("os:neto", suma(oneShots.map((o) => o.neto)), `Suma de ${oneShots.length} one shot${oneShots.length === 1 ? "" : "s"}`),
    iva: v("os:iva", suma(oneShots.map((o) => o.iva.valor)), "Suma del IVA de cada one shot"),
    bruto: v("os:bruto", suma(oneShots.map((o) => o.bruto.valor)), "Suma del bruto de cada one shot"),
    ib: v("os:ib", suma(oneShots.map((o) => o.ib.valor)), `Suma del IB (${ibTexto}) de cada one shot`),
    asignado: v("os:asignado", suma(oneShots.map((o) => o.asignado.valor)), "Suma de las asignaciones a empleados"),
    estructura: v("os:estructura", suma(oneShots.map((o) => o.estructura.valor)), "Neto − IB − asignaciones de todos los one shots"),
  };

  // Lo que cobra cada colaborador en el mes: sueldo sobre fees + one shots.
  const ids = [...new Set([...d.porcentajes.map((p) => p.colaborador_id), ...d.one_shots.flatMap((o) => o.asignaciones.map((a) => a.colaborador_id))])];
  const porColaborador = ids.map((id) => {
    const sueldo = sueldos.find((s) => s.colaborador_id === id)?.sueldo.valor ?? 0;
    const os = suma(d.one_shots.flatMap((o) => o.asignaciones.filter((a) => a.colaborador_id === id).map((a) => a.monto)));
    return { colaborador_id: id, colaborador: colaborador(id), sueldo, oneShots: os, total: r2(sueldo + os) };
  });

  const fijos = v("fijos:total", suma(d.gastos_fijos.map((g) => g.monto)), `Suma de ${d.gastos_fijos.length} gasto${d.gastos_fijos.length === 1 ? "" : "s"} fijo${d.gastos_fijos.length === 1 ? "" : "s"}`);
  const variables = v(
    "variables:total",
    suma(d.gastos_variables.map((g) => g.monto)),
    `Suma de ${d.gastos_variables.length} gasto${d.gastos_variables.length === 1 ? "" : "s"} variable${d.gastos_variables.length === 1 ? "" : "s"}`,
  );

  // Resultado mensual: sobre netos (el IVA se cobra y se paga, no es rentabilidad).
  const lineasMensual = [
    { concepto: "Fees netos", c: totalFees.neto, signo: 1 },
    { concepto: `Ingresos brutos de fees (${ibTexto})`, c: totalFees.ib, signo: -1 },
    { concepto: "Sueldos sobre fees", c: totalSueldos, signo: -1 },
    { concepto: "Gastos fijos", c: fijos, signo: -1 },
    { concepto: "Gastos variables", c: variables, signo: -1 },
    { concepto: "One shots: saldo para estructura", c: totalOneShots.estructura, signo: 1 },
  ].map((l) => ({ ...l, valor: l.c.valor }));
  const rentabilidad = v(
    "rentabilidad",
    suma(lineasMensual.map((l) => l.signo * l.valor)),
    "Fees netos − IB fees − sueldos − gastos fijos − gastos variables + saldo de one shots",
  );

  // Rentabilidad variable: la rentabilidad real de cada evento de Ruta del mes (la de su planilla).
  const eventos = eventosOriginales.map(eventoRutaCompleto).map((e) => {
    const origen = e.sinPlanilla ? "del balance de movimientos (el evento no tiene planilla)" : "de la planilla del evento";
    return {
      ...e,
      cIngresos: v(`ev:${e.id}:ingresos`, e.ingresos, `Total ingresos ${origen}`),
      cEgresos: v(`ev:${e.id}:egresos`, e.egresos, `Total gastos ${origen}`),
      cIva: v(`ev:${e.id}:iva`, e.iva, e.sinPlanilla ? "Sin planilla: no se calcula" : "IVA a pagar de la planilla del evento"),
      cIibb: v(`ev:${e.id}:iibb`, e.iibb, e.sinPlanilla ? "Sin planilla: no se calcula" : "IIBB de la planilla del evento"),
    };
  }).map((e) => {
    // Sin ajustes es exactamente la del evento; si se corrigió ingresos, gastos, IVA o IIBB, se mueve por esa diferencia.
    const dif = e.cIngresos.valor - e.ingresos - (e.cEgresos.valor - e.egresos) - (e.cIva.valor - e.iva) - (e.cIibb.valor - e.iibb);
    const base = e.sinPlanilla ? "Ingresos − egresos de sus movimientos" : "Rentabilidad real de la planilla del evento";
    return { ...e, cRentabilidad: v(`ev:${e.id}:rentabilidad`, e.rentabilidad + dif, Math.abs(dif) >= 0.005 ? `${base}, con los ajustes de esta fila` : base) };
  });
  const variable = v(
    "variable",
    suma(eventos.map((e) => e.cRentabilidad.valor)),
    `Suma de la rentabilidad real de ${eventos.length} evento${eventos.length === 1 ? "" : "s"} de Ruta`,
  );

  const repartir = (lista: MesRuta["distribucion_mensual"], base: Calculado, titulo: string, prefijo: string) => {
    const total = r2(suma(lista.map((r) => r.porcentaje)));
    // Con pérdida no hay reparto: nunca se generan pagos negativos.
    const conReparto = base.valor > 0;
    return {
      titulo,
      base,
      sumaPorcentajes: total,
      ok: Math.abs(total - 100) < 0.001,
      conReparto,
      filas: lista.map((r, i) => ({
        ...r,
        monto: v(
          `${prefijo}:${i}`,
          conReparto ? (base.valor * r.porcentaje) / 100 : 0,
          conReparto ? `${formatoPesos(base.valor)} × ${pct(r.porcentaje)}` : "Sin reparto: el resultado no es positivo",
        ),
      })),
    };
  };
  const repartoMensual = repartir(d.distribucion_mensual, rentabilidad, "Distribución de la rentabilidad mensual", "reparto:mensual");
  const repartoVariable = repartir(d.distribucion_variable, variable, "Distribución de la rentabilidad variable", "reparto:variable");

  const estructuraDe = (r: ReturnType<typeof repartir>) => suma(r.filas.filter((f) => esEstructura(f.nombre)).map((f) => f.monto.valor));
  const cajaEstructura = v(
    "caja",
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
    if (evento) avisos.push(`El gasto variable "${g.concepto}" coincide con el evento "${evento.nombre}": si ya está en su planilla, no lo cargues acá.`);
  }
  for (const o of oneShots) if (o.estructura.valor < 0) avisos.push(`One shot "${o.descripcion || o.cliente}": lo asignado supera el neto menos IB.`);
  // Ajustes que ya no corresponden a nada (un cliente o evento que se sacó): no afectan el resultado.
  const usadas = new Set<string>();
  const marcar = (c: Calculado) => c.clave && usadas.add(c.clave);
  [totalFees.neto, totalFees.iva, totalFees.bruto, totalFees.ib, totalSueldos, fijos, variables, rentabilidad, variable, cajaEstructura].forEach(marcar);
  Object.values(totalOneShots).forEach(marcar);
  fees.forEach((f) => [f.iva, f.bruto, f.ib].forEach(marcar));
  sueldos.forEach((s) => marcar(s.sueldo));
  oneShots.forEach((o) => [o.iva, o.bruto, o.ib, o.asignado, o.estructura].forEach(marcar));
  eventos.forEach((e) => [e.cIngresos, e.cEgresos, e.cIva, e.cIibb, e.cRentabilidad].forEach(marcar));
  [...repartoMensual.filas, ...repartoVariable.filas].forEach((f) => marcar(f.monto));
  const ajustesVigentes = Object.keys(ajustes).filter((k) => usadas.has(k));
  const eventosConAjuste = eventos.filter((e) => [e.cIngresos, e.cEgresos, e.cIva, e.cIibb, e.cRentabilidad].some((c) => c.manual)).length;

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
    ibPorcentaje: ib * 100,
    impuestos: {
      ivaFees: totalFees.iva,
      ibFees: totalFees.ib,
      ivaOneShots: totalOneShots.iva,
      ibOneShots: totalOneShots.ib,
    },
    lineasMensual,
    rentabilidad,
    eventos,
    eventosConAjuste,
    variable,
    repartoMensual,
    repartoVariable,
    cajaEstructura,
    ajustesVigentes,
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
