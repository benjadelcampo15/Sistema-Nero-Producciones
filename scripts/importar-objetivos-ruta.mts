// Importa la planilla "RUTA 2026 OK" a Objetivos de Ruta.
//   npm run importar-objetivos-ruta -- prueba [archivo]     → muestra lo que se cargaría y las observaciones
//   npm run importar-objetivos-ruta -- importar [archivo]   → carga enero a septiembre (histórico) y octubre (automático)
//   npm run importar-objetivos-ruta -- reemplazar [archivo] → igual, pisando los meses que ya existan
//
// Enero a septiembre se guardan como una foto de cada pestaña (filas, totales y
// repartos tal cual la planilla), con observaciones de lo que hay que revisar.
// No se corrige nada del histórico. Octubre se carga como el primer mes
// automático: fees, porcentajes, gastos y repartos como datos editables.
// Las pestañas de años anteriores, ejemplos y simulaciones no se leen.

import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import type { WorkSheet } from "xlsx";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

const ARCHIVO = process.argv.find((a) => a.endsWith(".xlsx")) ?? ".planilla/ruta-objetivos/ruta2026.xlsx";
const MODO = process.argv[2] ?? "prueba";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secreta = process.env.SUPABASE_SECRET_KEY;
if (!url || !secreta) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local");
  process.exit(1);
}
const supabase = createClient(url, secreta, { auth: { autoRefreshToken: false, persistSession: false } });

const libro = XLSX.readFile(ARCHIVO, { cellFormula: true });

// ─── Lectura de celdas ───────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;
const pesos = (n: number | null) => (n === null ? "—" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n));

function celda(hoja: WorkSheet, ref: string) {
  return hoja[ref] as { v?: unknown; f?: string; t?: string } | undefined;
}
/** Pesos con 2 decimales; los porcentajes (0,065) sin redondear. */
function numero(hoja: WorkSheet, ref: string, tipo: "pesos" | "porcentaje" = "pesos"): number | null {
  const c = celda(hoja, ref);
  if (typeof c?.v !== "number") return null;
  return tipo === "pesos" ? r2(c.v) : Math.round(c.v * 1e6) / 1e6;
}
function textoCelda(hoja: WorkSheet, ref: string) {
  const c = celda(hoja, ref);
  return c?.v === undefined || c.v === null ? "" : String(c.v).trim();
}
/** "I31 = I30-I29" para mostrar de dónde sale un total. */
function formula(hoja: WorkSheet, ref: string) {
  const c = celda(hoja, ref);
  return c?.f ? `${ref} = ${c.f}` : `${ref} (valor escrito)`;
}

type Columna = { titulo: string; col: string; tipo?: "pesos" | "porcentaje" };
type ConfigSeccion = {
  titulo: string;
  grupo: "ingresos" | "costos" | "variable" | "reparto" | "info";
  desde: number;
  hasta: number;
  detalle: string[];
  columnas: Columna[];
  totales?: (string | null)[];
};
type ConfigMes = {
  pestana: string;
  periodo: string;
  modelo: string;
  secciones: ConfigSeccion[];
  resultado: { ingresos: string | null; gastos: string | null; rentabilidad: string };
  extras?: { detalle: string; ref: string }[];
  anual?: string;
  observaciones: string[];
};

const TITULO_FEES: Columna[] = [
  { titulo: "Neto", col: "C" },
  { titulo: "Bruto", col: "D" },
  { titulo: "IVA", col: "E" },
];

/** Meses de enero a marzo: el modelo de "costo salario" (igual que la planilla de objetivos de Nero). */
function modeloSalarios(p: {
  pestana: string;
  periodo: string;
  fees: [number, number, string];
  campanas: [number, number, string];
  ingreso: string;
  general: [number, number, string];
  shopping: [number, number, string];
  fijos: [number, number, string];
  variables: [number, number, string];
  costos: string;
  rentabilidad: string;
  anual?: string;
  observaciones: string[];
}): ConfigMes {
  return {
    pestana: p.pestana,
    periodo: p.periodo,
    modelo: "Modelo de costo salario: fees + rentabilidad de campañas − (salarios, salarios shopping, gastos fijos y variables).",
    secciones: [
      { titulo: "Fees", grupo: "ingresos", desde: p.fees[0], hasta: p.fees[1], detalle: ["A"], columnas: [{ titulo: "Monto", col: "B" }, { titulo: "IVA", col: "C" }], totales: [p.fees[2], null] },
      { titulo: "Rentabilidad campañas", grupo: "ingresos", desde: p.campanas[0], hasta: p.campanas[1], detalle: ["A"], columnas: [{ titulo: "Monto", col: "B" }], totales: [p.campanas[2]] },
      { titulo: "Costo salario general", grupo: "costos", desde: p.general[0], hasta: p.general[1], detalle: ["F", "H"], columnas: [{ titulo: "Monto", col: "G" }], totales: [p.general[2]] },
      { titulo: "Costo salario shopping", grupo: "costos", desde: p.shopping[0], hasta: p.shopping[1], detalle: ["F", "H"], columnas: [{ titulo: "Monto", col: "G" }], totales: [p.shopping[2]] },
      { titulo: "Gastos fijos", grupo: "costos", desde: p.fijos[0], hasta: p.fijos[1], detalle: ["F", "H"], columnas: [{ titulo: "Monto", col: "G" }], totales: [p.fijos[2]] },
      { titulo: "Gastos variables", grupo: "costos", desde: p.variables[0], hasta: p.variables[1], detalle: ["F", "H"], columnas: [{ titulo: "Monto", col: "G" }], totales: [p.variables[2]] },
      { titulo: "Distribución de la rentabilidad", grupo: "reparto", desde: 2, hasta: 7, detalle: ["J"], columnas: [{ titulo: "%", col: "L", tipo: "porcentaje" }, { titulo: "Monto", col: "K" }], totales: ["L8", null] },
    ],
    resultado: { ingresos: p.ingreso, gastos: p.costos, rentabilidad: p.rentabilidad },
    anual: p.anual,
    observaciones: p.observaciones,
  };
}

/** Abril y mayo: fees con IVA, dos modelos de sueldos y rentabilidad variable aparte. */
function modeloAbrilMayo(p: {
  pestana: string;
  periodo: string;
  fijos: [number, number, string];
  variables: [number, number, string];
  ingresosVariables: [number, number];
  repartoVariable: [number, number];
  ingresos: string;
  gastos: string;
  rentabilidad: string;
  anual: string;
  observaciones: string[];
}): ConfigMes {
  return {
    pestana: p.pestana,
    periodo: p.periodo,
    modelo: "Fees con IVA; el resultado usa los sueldos del modelo anterior (columna G). Rentabilidad variable y su reparto aparte.",
    secciones: [
      { titulo: "Fees", grupo: "ingresos", desde: 2, hasta: 11, detalle: ["A"], columnas: [{ titulo: "Neto", col: "B" }, { titulo: "Bruto", col: "C" }, { titulo: "IVA", col: "D" }], totales: ["B12", "C12", "D12"] },
      { titulo: "Sueldos (modelo anterior, usado en el resultado)", grupo: "costos", desde: 2, hasta: 10, detalle: ["F"], columnas: [{ titulo: "Monto", col: "G" }], totales: ["G13"] },
      { titulo: "Sueldos por porcentaje (modelo nuevo, solo referencia)", grupo: "info", desde: 2, hasta: 10, detalle: ["I"], columnas: [{ titulo: "%", col: "E", tipo: "porcentaje" }, { titulo: "Sueldo", col: "J" }], totales: ["E12", "J13"] },
      { titulo: "Costos fijos", grupo: "costos", desde: p.fijos[0], hasta: p.fijos[1], detalle: ["F"], columnas: [{ titulo: "Monto", col: "G" }], totales: [p.fijos[2]] },
      { titulo: "Costos variables", grupo: "variable", desde: p.variables[0], hasta: p.variables[1], detalle: ["F"], columnas: [{ titulo: "Monto", col: "G" }], totales: [p.variables[2] === "G0" ? null : p.variables[2]] },
      { titulo: "Ingresos variables", grupo: "variable", desde: p.ingresosVariables[0], hasta: p.ingresosVariables[1], detalle: ["A"], columnas: [{ titulo: "Monto", col: "B" }], totales: [null] },
      { titulo: "Distribución rentabilidad fee", grupo: "reparto", desde: 34, hasta: 37, detalle: ["I"], columnas: [{ titulo: "%", col: "L", tipo: "porcentaje" }, { titulo: "Monto", col: "J" }], totales: [null, null] },
      { titulo: "Distribución rentabilidad variable", grupo: "reparto", desde: p.repartoVariable[0], hasta: p.repartoVariable[1], detalle: ["A"], columnas: [{ titulo: "%", col: "D", tipo: "porcentaje" }, { titulo: "Monto", col: "B" }], totales: [null, null] },
    ],
    resultado: { ingresos: p.ingresos, gastos: p.gastos, rentabilidad: p.rentabilidad },
    extras: [
      { detalle: "Costos variables (con signo negativo)", ref: "B19" },
      { detalle: "Rentabilidad variable", ref: "B26" },
      { detalle: "Caja estructura", ref: "J42" },
      { detalle: "Bono 20%", ref: "J43" },
      { detalle: "Contingencia 80%", ref: "J44" },
      { detalle: "Modelo nuevo (no usado): total gastos", ref: "J29" },
      { detalle: "Modelo nuevo (no usado): rentabilidad", ref: "J31" },
    ],
    anual: p.anual,
    observaciones: p.observaciones,
  };
}

/** Junio a septiembre: fees con IVA, sueldos por porcentaje, gastos fijos y variables, repartos. */
function modeloPorcentajes(p: {
  pestana: string;
  periodo: string;
  feesHasta: number;
  totalFees: number;
  ajustes: [number, number];
  sueldos: [number, number, number];
  fijos: [number, number, string];
  variables: [number, number, string];
  ingresosVariables: [number, number, string];
  rentaVariable: string;
  repartoFee: [number, number];
  repartoVariable: [number, number];
  caja: number;
  ingresos: string;
  gastos: string;
  rentabilidad: string;
  extraSecciones?: ConfigSeccion[];
  observaciones: string[];
}): ConfigMes {
  const t = p.totalFees;
  return {
    pestana: p.pestana,
    periodo: p.periodo,
    modelo: "Fees con IVA; sueldos = neto de fees × porcentaje de cada colaborador; gastos fijos; rentabilidad variable y repartos.",
    secciones: [
      { titulo: "Fees", grupo: "ingresos", desde: 3, hasta: p.feesHasta, detalle: ["B"], columnas: TITULO_FEES, totales: [`C${t}`, `D${t}`, `E${t}`] },
      { titulo: "Ajustes al pie de la hoja", grupo: "info", desde: p.ajustes[0], hasta: p.ajustes[1], detalle: ["B"], columnas: [{ titulo: "Neto", col: "C" }], totales: [null] },
      ...(p.extraSecciones ?? []),
      { titulo: "Sueldos sobre fees", grupo: "costos", desde: 3, hasta: p.sueldos[1], detalle: ["H"], columnas: [{ titulo: "%", col: "G", tipo: "porcentaje" }, { titulo: "Sueldo", col: "I" }], totales: [`G${p.sueldos[2]}`, `I${p.sueldos[2]}`] },
      { titulo: "Costos fijos", grupo: "costos", desde: p.fijos[0], hasta: p.fijos[1], detalle: ["H"], columnas: [{ titulo: "Monto", col: "I" }], totales: [p.fijos[2]] },
      { titulo: "Costos variables", grupo: "variable", desde: p.variables[0], hasta: p.variables[1], detalle: ["B"], columnas: [{ titulo: "Monto", col: "C" }], totales: [p.variables[2]] },
      { titulo: "Ingresos variables", grupo: "variable", desde: p.ingresosVariables[0], hasta: p.ingresosVariables[1], detalle: ["B"], columnas: [{ titulo: "Monto", col: "C" }], totales: [p.ingresosVariables[2]] },
      { titulo: "Distribución rentabilidad fee", grupo: "reparto", desde: p.repartoFee[0], hasta: p.repartoFee[1], detalle: ["H"], columnas: [{ titulo: "%", col: "K", tipo: "porcentaje" }, { titulo: "Monto", col: "I" }], totales: [null, null] },
      { titulo: "Distribución rentabilidad variable", grupo: "reparto", desde: p.repartoVariable[0], hasta: p.repartoVariable[1], detalle: ["B"], columnas: [{ titulo: "%", col: "E", tipo: "porcentaje" }, { titulo: "Monto", col: "C" }], totales: [null, null] },
    ],
    resultado: { ingresos: p.ingresos, gastos: p.gastos, rentabilidad: p.rentabilidad },
    extras: [
      { detalle: "Rentabilidad variable", ref: p.rentaVariable },
      { detalle: "Caja estructura", ref: `I${p.caja}` },
      { detalle: "Bono 20%", ref: `I${p.caja + 1}` },
      { detalle: "Contingencia 80%", ref: `I${p.caja + 2}` },
    ],
    observaciones: p.observaciones,
  };
}

const BONO_REF = "La “Propuesta distribución bono” tiene referencias rotas (#REF!): no se importó.";

const MESES: ConfigMes[] = [
  modeloSalarios({
    pestana: "ENERO-26",
    periodo: "2026-01",
    fees: [3, 13, "B14"],
    campanas: [16, 20, "B21"],
    ingreso: "B22",
    general: [2, 11, "G12"],
    shopping: [14, 19, "G20"],
    fijos: [22, 38, "G39"],
    variables: [41, 48, "G49"],
    costos: "G50",
    rentabilidad: "G51",
    observaciones: [
      "El resultado es negativo y la distribución de la planilla reparte montos negativos (K2:K7).",
      "“Sueldo contabilidad” ($225.000) figura dos veces en gastos fijos (G34 y G38).",
    ],
  }),
  modeloSalarios({
    pestana: "FEBRERO-26",
    periodo: "2026-02",
    fees: [3, 12, "B13"],
    campanas: [15, 22, "B23"],
    ingreso: "B24",
    general: [2, 7, "G8"],
    shopping: [10, 14, "G15"],
    fijos: [17, 30, "G31"],
    variables: [33, 40, "G41"],
    costos: "G42",
    rentabilidad: "G43",
    anual: "G44",
    observaciones: [
      "La rentabilidad anual (G44 = 'ENERO-26'!G51+G43+'MARZO-26'!G17) suma por error la celda G17 de marzo (Internet ITC, $17.409,44). La app calcula la anual sin ese error.",
      "El resultado es negativo y la distribución de la planilla reparte montos negativos (K2:K7).",
    ],
  }),
  modeloSalarios({
    pestana: "MARZO-26",
    periodo: "2026-03",
    fees: [3, 8, "B9"],
    campanas: [11, 20, "B21"],
    ingreso: "B22",
    general: [2, 7, "G8"],
    shopping: [10, 14, "G15"],
    fijos: [17, 30, "G31"],
    variables: [33, 40, "G41"],
    costos: "G42",
    rentabilidad: "G43",
    anual: "G44",
    observaciones: [
      "La rentabilidad anual de la planilla (G44) arrastra el error de febrero.",
      "“Coberturas shopping” (−$390.000) está cargado como un fee negativo.",
    ],
  }),
  modeloAbrilMayo({
    pestana: "ABRIL-26",
    periodo: "2026-04",
    fijos: [14, 23, "G24"],
    variables: [25, 29, "G0"],
    ingresosVariables: [20, 25],
    repartoVariable: [30, 36],
    ingresos: "G31",
    gastos: "G30",
    rentabilidad: "G32",
    anual: "G33",
    observaciones: [
      "Hay dos modelos de sueldos. El resultado (G32) usa el modelo anterior (columna G); el modelo por porcentaje (columna J) queda solo como referencia.",
      "Los costos variables se restan dos veces con signos opuestos: dentro de la rentabilidad variable (B26 incluye B19 negativo) y en el total de gastos (G30 = G13+G24+B19, con B19 negativo). En el resultado se compensan y terminan sin descontarse.",
      "“Coberturas shopping” (−$340.000) figura con bruto e IVA de −$340.000 cada uno (no aplica el 21%).",
      "La distribución de la rentabilidad fee (J34:J37) usa G32, que ya incluye la rentabilidad variable (que además tiene su propio reparto).",
    ],
  }),
  modeloAbrilMayo({
    pestana: "MAYO - 26",
    periodo: "2026-05",
    fijos: [14, 24, "G25"],
    variables: [26, 29, "G30"],
    ingresosVariables: [20, 23],
    repartoVariable: [29, 35],
    ingresos: "G32",
    gastos: "G31",
    rentabilidad: "G33",
    anual: "G34",
    observaciones: [
      "El resultado (G33) usa los sueldos del modelo anterior (columna G); el modelo por porcentaje (columna J) queda solo como referencia.",
      "La rentabilidad variable es negativa (B26) y el reparto variable de la planilla reparte montos negativos.",
      "Hay un fee sin nombre de −$390.000 (fila 7).",
      "La distribución de la rentabilidad fee usa G33, que ya incluye la rentabilidad variable (que además tiene su propio reparto).",
    ],
  }),
  modeloPorcentajes({
    pestana: "JUNIO - 26",
    periodo: "2026-06",
    feesHasta: 12,
    totalFees: 13,
    ajustes: [217, 218],
    sueldos: [3, 10, 11],
    fijos: [14, 23, "I24"],
    variables: [17, 25, "C26"],
    ingresosVariables: [29, 33, "C34"],
    rentaVariable: "C35",
    repartoFee: [32, 35],
    repartoVariable: [38, 44],
    caja: 40,
    ingresos: "I27",
    gastos: "I26",
    rentabilidad: "I28",
    extraSecciones: [
      { titulo: "Aguinaldo (calculado aparte, no entra en el resultado)", grupo: "info", desde: 3, hasta: 10, detalle: ["J"], columnas: [{ titulo: "Monto", col: "K" }], totales: ["K11"] },
    ],
    observaciones: [
      "El descuento de Shopping (−$390.000, fila 217) baja el neto total (C13), y con eso los sueldos y el IB, pero no el bruto ni el IVA. Como el resultado se calcula con el bruto, ese descuento no resta en la rentabilidad.",
      "El ajuste de Chocolezza (−$85.000, fila 218) está incluido en el neto de Chocolezza (C5).",
      BONO_REF,
    ],
  }),
  modeloPorcentajes({
    pestana: "JULIO - 26",
    periodo: "2026-07",
    feesHasta: 13,
    totalFees: 14,
    ajustes: [217, 218],
    sueldos: [3, 11, 12],
    fijos: [15, 26, "I27"],
    variables: [18, 26, "C27"],
    ingresosVariables: [30, 34, "C35"],
    rentaVariable: "C36",
    repartoFee: [35, 38],
    repartoVariable: [39, 44],
    caja: 43,
    ingresos: "I30",
    gastos: "I29",
    rentabilidad: "I31",
    observaciones: [
      "El ajuste de Shopping (−$350.000, fila 217) se descuenta dos veces del neto total: ya está dentro de C6 y C14 lo vuelve a sumar.",
      "IVA FEE (I16 = $4.575.874,68) e IB FEE (I17 = $855.995,18) están escritos a mano y no coinciden con lo calculado (IVA E14 = $4.599.618,28; 4% de C14 = $862.117,77).",
      "Distribución fee: estructura 0% (Santi 35%, Agus 40%, Valen 25%).",
    ],
  }),
  modeloPorcentajes({
    pestana: "AGOSTO - 26",
    periodo: "2026-08",
    feesHasta: 12,
    totalFees: 13,
    ajustes: [217, 217],
    sueldos: [3, 11, 12],
    fijos: [15, 24, "I25"],
    variables: [17, 25, "C26"],
    ingresosVariables: [29, 33, "C34"],
    rentaVariable: "C35",
    repartoFee: [33, 36],
    repartoVariable: [38, 44],
    caja: 41,
    ingresos: "I28",
    gastos: "I27",
    rentabilidad: "I29",
    observaciones: [
      "IVA FEE (I16 = $4.575.874,68) está escrito a mano (es el de julio); el IVA calculado (E13) es $4.640.106,43.",
      "Distribución fee: los porcentajes suman 125%. Estructura figura con 25% pero no tiene fórmula (no se calcula); Santi 35%, Agus 40% y Valen 25% reparten el 100%.",
      "La rentabilidad variable es negativa (C35): resta en el total de ingresos y el reparto variable reparte montos negativos.",
      "El descuento de Shopping (−$390.000, fila 217) baja el neto total pero no el bruto ni el IVA.",
      BONO_REF,
    ],
  }),
  modeloPorcentajes({
    pestana: "SEPTIEMBRE - 26",
    periodo: "2026-09",
    feesHasta: 12,
    totalFees: 13,
    ajustes: [218, 218],
    sueldos: [3, 11, 12],
    fijos: [15, 26, "I27"],
    variables: [17, 26, "C27"],
    ingresosVariables: [30, 34, "C35"],
    rentaVariable: "C36",
    repartoFee: [35, 38],
    repartoVariable: [39, 45],
    caja: 43,
    ingresos: "I30",
    gastos: "I29",
    rentabilidad: "I31",
    extraSecciones: [
      { titulo: "One shots", grupo: "ingresos", desde: 3, hasta: 12, detalle: ["N"], columnas: [{ titulo: "Neto", col: "O" }, { titulo: "Bruto", col: "P" }, { titulo: "IVA", col: "Q" }], totales: ["O13", "P13", "Q13"] },
      {
        titulo: "Asignaciones de one shots",
        grupo: "costos",
        desde: 3,
        hasta: 11,
        detalle: ["S"],
        columnas: [
          { titulo: "All in", col: "T" },
          { titulo: "Plan medio turismo", col: "U" },
          { titulo: "Pauta UK Latam", col: "V" },
          { titulo: "Crédito Mágico", col: "W" },
          { titulo: "Total", col: "L" },
        ],
        totales: ["T12", "U12", "V12", "W12", "L12"],
      },
    ],
    observaciones: [
      "IVA FEE (I16 = $4.575.874,68) está escrito a mano; el IVA calculado (E13) es $4.671.578,19.",
      "One shot Crédito Mágico: falta su IVA (Q6 vacía). El bruto (P13) incluye $63.000 de IVA que no se descuenta como costo, así que la rentabilidad queda $63.000 más alta.",
      "“Tarjeta que no cubre variable” ($1.500.621,24) está marcada con “??????” en la planilla.",
      "El reparto variable que se descuenta (C46 = SUM(C41:C45)) no incluye estructura (C39).",
      "El descuento de Shopping (−$390.000, fila 218) baja el neto total pero no el bruto ni el IVA.",
    ],
  }),
];

// ─── Histórico ───────────────────────────────────────────────────────────

function leerSeccion(hoja: WorkSheet, s: ConfigSeccion) {
  const filas: { detalle: string; valores: (number | null)[] }[] = [];
  for (let f = s.desde; f <= s.hasta; f++) {
    const valores = s.columnas.map((c) => numero(hoja, `${c.col}${f}`, c.tipo));
    const detalle = s.detalle.map((c) => textoCelda(hoja, `${c}${f}`)).filter(Boolean).join(" · ");
    // Filas sin ningún importe (títulos, renglones vacíos o en cero sin nombre) no se cargan.
    if (valores.every((v) => v === null) || (!detalle && valores.every((v) => !v))) continue;
    filas.push({ detalle: (detalle || "(sin nombre)").slice(0, 200), valores });
  }
  const totales = (s.totales ?? s.columnas.map(() => null)).map((ref, i) => (ref ? numero(hoja, ref, s.columnas[i].tipo) : null));
  const formulas = (s.totales ?? []).map((ref) => (ref ? formula(hoja, ref) : "")).filter(Boolean);
  return {
    titulo: s.titulo,
    grupo: s.grupo,
    columnas: s.columnas.map((c) => ({ titulo: c.titulo, tipo: c.tipo ?? "pesos" })),
    filas,
    totales,
    formulas,
  };
}

function armarHistorico(c: ConfigMes) {
  const hoja = libro.Sheets[c.pestana];
  if (!hoja) throw new Error(`No está la pestaña ${c.pestana}`);
  const secciones = c.secciones.map((s) => leerSeccion(hoja, s));
  const observaciones = [...c.observaciones];

  // Diferencias entre la suma de las filas y el total de la planilla (no se corrigen: se marcan).
  for (const s of secciones) {
    s.totales.forEach((total, i) => {
      if (total === null || s.columnas[i].tipo === "porcentaje") return;
      const sumaFilas = r2(s.filas.reduce((a, f) => a + (f.valores[i] ?? 0), 0));
      if (Math.abs(sumaFilas - total) > 0.05) {
        observaciones.push(
          `${s.titulo}${s.columnas.length > 1 ? ` (${s.columnas[i].titulo})` : ""}: el total de la planilla es ${pesos(total)} y la suma de las filas da ${pesos(sumaFilas)} (diferencia ${pesos(r2(total - sumaFilas))}). Total: ${s.formulas[i] ?? ""}.`,
        );
      }
    });
  }

  const resultado = {
    ingresos: c.resultado.ingresos ? numero(hoja, c.resultado.ingresos) : null,
    gastos: c.resultado.gastos ? numero(hoja, c.resultado.gastos) : null,
    rentabilidad: numero(hoja, c.resultado.rentabilidad) ?? 0,
    formula: [c.resultado.rentabilidad, c.resultado.ingresos, c.resultado.gastos]
      .filter((r): r is string => !!r)
      .map((r) => formula(hoja, r))
      .join(" · "),
  };
  if (resultado.ingresos !== null && resultado.gastos !== null && Math.abs(resultado.ingresos - resultado.gastos - resultado.rentabilidad) > 0.05) {
    observaciones.push(`La rentabilidad (${pesos(resultado.rentabilidad)}) no es ingresos − gastos (${pesos(r2(resultado.ingresos - resultado.gastos))}).`);
  }

  return {
    pestana: c.pestana,
    modelo: c.modelo,
    secciones,
    resultado,
    extras: (c.extras ?? []).map((e) => ({ detalle: e.detalle, monto: numero(hoja, e.ref), formula: formula(hoja, e.ref) })),
    anualPlanilla: c.anual ? numero(hoja, c.anual) : null,
    observaciones,
  };
}

// ─── Octubre: primer mes automático ──────────────────────────────────────

const NOMBRES: Record<string, string> = { JOSE: "José", "SOFI MARENGO": "Sofi", ADMINISTRACION: "Administración" };
const nombrePropio = (t: string) => {
  const limpio = t.trim().replace(/\s+/g, " ").toUpperCase();
  return NOMBRES[limpio] ?? limpio.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());
};

function leerOctubre() {
  const hoja = libro.Sheets["OCTUBRE - 26"];
  const fees: { cliente: string; neto: number }[] = [];
  for (let f = 3; f <= 12; f++) {
    const nombre = textoCelda(hoja, `B${f}`);
    const neto = numero(hoja, `C${f}`);
    if (nombre && neto !== null) fees.push({ cliente: nombrePropio(nombre), neto });
  }
  // El descuento de coberturas de Shopping que la planilla suma al pie (C218).
  const ajuste = numero(hoja, "C218");
  if (ajuste) fees.push({ cliente: "Ajuste Shopping (coberturas)", neto: ajuste });

  const porcentajes: { colaborador: string; porcentaje: number }[] = [];
  for (let f = 3; f <= 11; f++) {
    const nombre = textoCelda(hoja, `H${f}`);
    const p = numero(hoja, `G${f}`);
    if (nombre && p !== null) porcentajes.push({ colaborador: nombrePropio(nombre), porcentaje: r2((celda(hoja, `G${f}`)!.v as number) * 100) });
  }

  // Costos fijos manuales: los impuestos (IVA e IB) los calcula la app.
  const gastos_fijos: { concepto: string; monto: number }[] = [];
  for (let f = 15; f <= 26; f++) {
    const concepto = textoCelda(hoja, `H${f}`);
    const monto = numero(hoja, `I${f}`);
    if (!concepto || monto === null || /IVA|INGRESOS BRUTOS/i.test(concepto)) continue;
    gastos_fijos.push({ concepto: nombrePropio(concepto), monto });
  }
  const gastos_variables: { concepto: string; monto: number }[] = [];
  for (let f = 18; f <= 26; f++) {
    const concepto = textoCelda(hoja, `B${f}`);
    const monto = numero(hoja, `C${f}`);
    if (concepto && monto) gastos_variables.push({ concepto: nombrePropio(concepto), monto });
  }

  const distribucion_mensual = [35, 36, 37, 38].map((f) => ({
    nombre: nombrePropio(textoCelda(hoja, `H${f}`).replace(/ PAGO MENSUAL/i, "")),
    porcentaje: r2(((celda(hoja, `K${f}`)?.v as number) ?? 0) * 100),
  }));
  const distribucion_variable = [39, 42, 43, 44, 45].map((f) => ({
    nombre: nombrePropio(textoCelda(hoja, `B${f}`)),
    porcentaje: r2(((celda(hoja, `E${f}`)?.v as number) ?? 0) * 100),
  }));

  const sinImporte = [3, 4, 5].map((f) => textoCelda(hoja, `N${f}`)).filter(Boolean);
  return {
    fees,
    porcentajes,
    gastos_fijos,
    gastos_variables,
    distribucion_mensual,
    distribucion_variable,
    rentabilidadPlanilla: numero(hoja, "I31"),
    oneShotsSinImporte: sinImporte,
  };
}

// ─── Guardado ────────────────────────────────────────────────────────────

async function idsPorNombre(tabla: "ruta_clientes" | "ruta_colaboradores", nombres: string[]) {
  const { data: existentes, error } = await supabase.from(tabla).select("id, nombre");
  if (error) throw new Error(error.message);
  const mapa = new Map(existentes.map((e) => [e.nombre.toLowerCase(), e.id as string]));
  const faltan = [...new Set(nombres)].filter((n) => !mapa.has(n.toLowerCase()));
  if (faltan.length) {
    const { data: creados, error: e2 } = await supabase.from(tabla).insert(faltan.map((nombre) => ({ nombre }))).select("id, nombre");
    if (e2) throw new Error(e2.message);
    for (const c of creados) mapa.set(c.nombre.toLowerCase(), c.id);
  }
  return (nombre: string) => mapa.get(nombre.toLowerCase())!;
}

async function main() {
  const historicos = MESES.map((c) => ({ periodo: c.periodo, datos: armarHistorico(c) }));

  // Rentabilidad anual: la de la app (suma de los resultados) contra la que escribe la planilla.
  let acumulada = 0;
  for (const h of historicos) {
    acumulada = r2(acumulada + h.datos.resultado.rentabilidad);
    if (h.datos.anualPlanilla !== null && Math.abs(h.datos.anualPlanilla - acumulada) > 0.05) {
      h.datos.observaciones.push(
        `Rentabilidad anual: la planilla dice ${pesos(h.datos.anualPlanilla)} y la suma de los resultados de enero a este mes da ${pesos(acumulada)} (diferencia ${pesos(r2(h.datos.anualPlanilla - acumulada))}).`,
      );
    }
  }

  const oct = leerOctubre();
  for (const h of historicos) {
    console.log(`\n${h.periodo} · ${h.datos.pestana}: rentabilidad ${pesos(h.datos.resultado.rentabilidad)} (ingresos ${pesos(h.datos.resultado.ingresos)} · gastos ${pesos(h.datos.resultado.gastos)})`);
    for (const s of h.datos.secciones) console.log(`   ${s.titulo}: ${s.filas.length} filas · total ${s.totales.map((t) => (t === null ? "—" : t)).join(" / ")}`);
    for (const o of h.datos.observaciones) console.log(`   ⚠ ${o}`);
  }
  console.log(`\nAnual enero–septiembre (suma): ${pesos(acumulada)}`);
  console.log("\n2026-10 (automático):", JSON.stringify(oct, null, 1));

  if (MODO === "prueba") return;

  const idCliente = await idsPorNombre("ruta_clientes", oct.fees.map((f) => f.cliente));
  const idColaborador = await idsPorNombre("ruta_colaboradores", oct.porcentajes.map((p) => p.colaborador));
  const octubre = {
    fees: oct.fees.map((f) => ({ cliente_id: idCliente(f.cliente), neto: f.neto })),
    porcentajes: oct.porcentajes.map((p) => ({ colaborador_id: idColaborador(p.colaborador), porcentaje: p.porcentaje })),
    gastos_fijos: oct.gastos_fijos,
    gastos_variables: oct.gastos_variables,
    one_shots: [],
    distribucion_mensual: oct.distribucion_mensual,
    distribucion_variable: oct.distribucion_variable,
    observaciones: [
      `Cargado desde la pestaña “OCTUBRE - 26”. La planilla da una rentabilidad de ${pesos(oct.rentabilidadPlanilla)}. Diferencias esperables con la app: el ajuste de Shopping (−$390.000) en la planilla solo baja los sueldos y el IB, no la rentabilidad; acá resta como un fee negativo.`,
      "Errores de la planilla que no se replicaron: el total de costos variables (C27 = SUM(C18:C21)) deja afuera las filas 22 a 24, y la propuesta de bono tiene referencias #REF!.",
      ...(oct.oneShotsSinImporte.length ? [`La planilla lista los one shots ${oct.oneShotsSinImporte.join(", ")} sin importe en octubre: no se cargaron.`] : []),
      "Criterios confirmados: rentabilidad variable separada de la mensual (su parte de estructura va a Caja Estructura); el saldo de los one shots (neto − IB − asignaciones) integra la rentabilidad mensual; Santi conserva el 10% del reparto variable; con pérdida no se reparte.",
    ],
  };

  const filas = [
    ...historicos.map((h) => ({ periodo: h.periodo, modo: "historico", datos: h.datos, cerrado: true })),
    { periodo: "2026-10", modo: "automatico", datos: octubre, cerrado: false },
  ];
  const { data: previos } = await supabase.from("ruta_meses").select("periodo").in("periodo", filas.map((f) => f.periodo));
  if (previos?.length && MODO !== "reemplazar") {
    console.log(`\nYa hay meses cargados (${previos.map((p) => p.periodo).join(", ")}). Usá "reemplazar" para pisarlos.`);
    return;
  }
  const { error } = await supabase.from("ruta_meses").upsert(filas, { onConflict: "periodo" });
  if (error) throw new Error(error.message);
  console.log(`\nCargados ${filas.length} meses (enero a septiembre histórico, octubre automático).`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
