// Importa la hoja BASE de la planilla de Nero (o, con --ruta, la de Ruta).
//   npm run importar                         → importa .planilla/planilla.xlsx
//   npm run importar -- prueba [archivo]     → lee y muestra totales, sin escribir nada
//   npm run importar -- reemplazar [archivo] → respalda y borra TODO Financiero, e importa
//   npm run importar -- borrar               → borra lo importado (marcado en notas)
//   npm run importar -- prueba .planilla/ruta/ruta.xlsx --ruta → lo mismo con la planilla de Ruta:
//     sus movimientos quedan con empresa "ruta", no crea eventos y "reemplazar" borra solo lo de Ruta.
//
// La planilla se descarga de Google Sheets (Archivo → Descargar → .xlsx) y se
// guarda en .planilla/ (carpeta ignorada por git: son datos reales).

import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

const EMPRESA = process.argv.includes("--ruta") ? "ruta" : "nero";
const MARCA = EMPRESA === "ruta" ? "IMPORTADO RUTA" : "IMPORTADO PLANILLA";
const MARCA_SIN_FECHA = `${MARCA} · sin fecha en la planilla`;
const ARCHIVO = process.argv.find((a) => a.endsWith(".xlsx")) ?? ".planilla/planilla.xlsx";
const MODO = process.argv[2] ?? "importar";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secreta = process.env.SUPABASE_SECRET_KEY;
if (!url || !secreta) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local");
  process.exit(1);
}
const supabase = createClient(url, secreta, { auth: { autoRefreshToken: false, persistSession: false } });

// ─── Mapeos ──────────────────────────────────────────────────────────────

/** Valores de la columna EVENTO que son eventos (el resto son cuentas/proveedores). */
const EVENTOS_NERO: Record<string, string> = {
  VALN: "Vino a la Nave",
  "VINO A LA NAVE": "Vino a la Nave",
  "VINO A": "Vino a la Nave",
  MELLINO: "Mellino",
  "ISIDRIS 19/9": "Isidris Sunset 19/9",
  ISIDRIS: "Isidris Sunset",
  GAUCHITO: "Gauchito",
  SCANIA: "Scania",
  "ELECTRONICA OCTUBRE": "Electrónica Octubre",
  ARISTIDES: "Aristides",
  KOINO: "Koino",
  "FUEGOS DE INVIERNO": "Fuegos de Invierno",
  "LABEL SOLUTIONS": "Label Solutions",
  "SHOPPING PRIMAVERA": "Shopping Primavera",
  KAMILO: "Kamilo",
  FDLH: "FDLH",
  "PASADO VERDE": "Pasado Verde",
  "C SHOPPING": "C Shopping",
  "DIA DEL AGUA": "Día del Agua",
  "PUESTO DEL INDIO": "Puesto del Indio",
  WINEROCK: "Winerock",
  PREBODA: "Preboda",
  INVIERNO: "Invierno",
};
// En la planilla de Ruta la columna EVENTO son cuentas (Sueldos, Fee, Shopping…): van como proveedor/cuenta.
const EVENTOS: Record<string, string> = EMPRESA === "ruta" ? {} : EVENTOS_NERO;

const CATEGORIAS: Record<string, string> = {
  EVENTOS: "Eventos",
  TECNICA: "Técnica",
  ARTISTICA: "Artística",
  SUELDOS: "Sueldos",
  IMPUESTOS: "Impuestos",
  LOGISTICA: "Logística",
  PROVEEDORES: "Proveedores",
  PRODUCCION: "Producción",
  "DEUDA FINANCIERA": "Deuda financiera",
  MARKETING: "Marketing",
  "OTROS GASTOS": "Otros gastos",
  STAFF: "Staff",
  ACTIVACIONES: "Activaciones",
  TICKETS: "Tickets",
  "OTROS INGRESOS": "Otros ingresos",
  SPONSOR: "Sponsor",
  "REVOLEO DE MERCADERIA": "Revoleo de mercadería",
  MERCADERIA: "Mercadería",
  SEGUROS: "Seguros",
  MOBILIARIO: "Mobiliario",
  SEGURIDAD: "Seguridad",
  // Planilla de Ruta.
  EQUIPO: "Equipo",
  FEE: "Fee",
  CONTENTS: "Contents",
  COBERTURAS: "Coberturas",
  SOCIEDAD: "Sociedad",
  ADMINISTRACION: "Administración",
};

const MEDIOS: Record<string, string> = {
  TRANSFERENCIA: "transferencia",
  EFECTIVO: "efectivo",
  TARJETA: "tarjeta",
  "CHEQUE EMITIDO": "cheque_emitido",
  "CHEQUE A EMITIR": "cheque_a_emitir",
  "CHEQUE A COBRAR": "cheque_a_cobrar",
  // Cheque recibido que se endosó para pagar.
  ENDOSADO: "cheque",
};

const ESTADOS: Record<string, string> = {
  REAL: "real",
  PENDIENTE: "pendiente",
  // Cheque emitido que todavía no se debitó: dinero comprometido.
  EMITIDO: "pendiente",
  PROYECTADO: "proyectado",
};

// ─── Utilidades ──────────────────────────────────────────────────────────

const clave = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ");

const tituloCaso = (texto: string) =>
  texto
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/(^|\s)\S/g, (l) => l.toUpperCase());

function monto(valor: unknown): number {
  if (typeof valor === "number") return Math.round(valor * 100) / 100;
  const limpio = String(valor ?? "").replace(/[$\s,]/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

const iso = (a: number, m: number, d: number) =>
  `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function esValida(a: number, m: number, d: number) {
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** Semana del año como la calcula la planilla (WEEKNUM, semanas que empiezan el domingo). */
function semana(a: number, m: number, d: number) {
  const inicio = Date.UTC(a, 0, 1);
  const diaInicio = new Date(inicio).getUTCDay();
  const dias = (Date.UTC(a, m - 1, d) - inicio) / 86_400_000;
  return Math.floor((dias + diaInicio) / 7) + 1;
}

type ResultadoFecha = { fecha: string | null; dudosa: boolean };

/**
 * Las fechas de la planilla vienen mezcladas: números de Excel, "17/4/2026"
 * (día/mes), "4/16/26" (mes/día) y "10/10" (sin año). Si es ambigua, se elige
 * la interpretación que coincide con la columna SEMANA.
 */
function parsearFecha(valor: unknown, semanaPlanilla: number): ResultadoFecha {
  if (typeof valor === "number") {
    const p = XLSX.SSF.parse_date_code(valor);
    return { fecha: p ? iso(p.y, p.m, p.d) : null, dudosa: false };
  }
  const partes = String(valor ?? "").trim().split("/").map(Number);
  if (partes.length < 2 || partes.some((n) => !Number.isInteger(n))) return { fecha: null, dudosa: false };

  const [x, y, anioCrudo] = partes;
  const anio = anioCrudo === undefined ? 2026 : anioCrudo < 100 ? 2000 + anioCrudo : anioCrudo;
  const opciones: [number, number][] = [];
  if (esValida(anio, y, x)) opciones.push([y, x]); // día/mes
  if (x !== y && esValida(anio, x, y)) opciones.push([x, y]); // mes/día
  if (opciones.length === 0) return { fecha: null, dudosa: false };
  if (opciones.length === 1) return { fecha: iso(anio, ...opciones[0]), dudosa: false };

  const distancia = ([m, d]: [number, number]) => Math.abs(semana(anio, m, d) - semanaPlanilla);
  const ordenadas = [...opciones].sort((a, b) => distancia(a) - distancia(b));
  const elegida = ordenadas[0];
  return { fecha: iso(anio, ...elegida), dudosa: !semanaPlanilla || distancia(elegida) > 1 };
}

// ─── Acciones ────────────────────────────────────────────────────────────

async function borrar() {
  const t = await supabase.from("transacciones").delete().like("notas", `${MARCA}%`).select("id");
  const e = EMPRESA === "ruta" ? { data: [], error: null } : await supabase.from("eventos").delete().eq("notas", MARCA).select("id");
  if (t.error || e.error) throw new Error((t.error ?? e.error)!.message);
  console.log(`Borrados: ${t.data.length} movimientos y ${e.data.length} eventos importados.`);
}

async function importar() {
  const { data: previos } = await supabase.from("transacciones").select("id").like("notas", `${MARCA}%`).limit(1);
  if (MODO !== "prueba" && previos?.length) {
    console.log("Ya hay datos importados. Corré `npm run importar -- borrar` primero.");
    return;
  }

  const libro = XLSX.readFile(ARCHIVO);
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets["BASE"], { defval: "" });

  // Algunas filas sin fecha en BASE la tienen en CASHFLOW COMPLETO (mismo detalle y monto).
  const claveFila = (f: Record<string, unknown>) => `${clave(f["DETALLE"])}|${Math.round(monto(f["MONTO"]))}`;
  const fechasCashflow = new Map<string, unknown>();
  for (const f of XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets["CASHFLOW COMPLETO"], { defval: "" })) {
    if (String(f["FECHA"]).trim()) fechasCashflow.set(claveFila(f), f["FECHA"]);
  }

  const { data: categorias, error: errorCat } = await supabase.from("categorias").select("id, nombre, tipo");
  if (errorCat || !categorias) throw new Error(errorCat?.message ?? "Sin categorías");
  // Categorías de la planilla que todavía no existen en la app: se crean (en prueba solo se listan).
  const faltan = new Map<string, { nombre: string; tipo: string }>();
  for (const f of filas) {
    const tipo = clave(f["TIPO"]) === "INGRESO" ? "ingreso" : clave(f["TIPO"]) === "EGRESO" ? "egreso" : null;
    const nombre = CATEGORIAS[clave(f["CATEGORIA"])];
    if (tipo && nombre && !categorias.some((c) => c.nombre === nombre && c.tipo === tipo)) faltan.set(`${nombre}|${tipo}`, { nombre, tipo });
  }
  if (faltan.size) {
    console.log(`Categorías nuevas: ${[...faltan.values()].map((c) => `${c.nombre} (${c.tipo})`).join(", ")}`);
    if (MODO === "prueba") for (const c of faltan.values()) categorias.push({ id: `nueva-${c.nombre}-${c.tipo}`, ...c });
    else {
      const { data: creadas, error } = await supabase.from("categorias").insert([...faltan.values()]).select("id, nombre, tipo");
      if (error || !creadas) throw new Error(error?.message ?? "No se crearon las categorías");
      categorias.push(...creadas);
    }
  }
  const idCategoria = (nombre: string, tipo: string) => categorias.find((c) => c.nombre === nombre && c.tipo === tipo)?.id;

  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const omitidas: string[] = [];
  const dudosas: string[] = [];

  type Mov = Record<string, unknown> & { _evento: string | null; fecha: string | null; tipo: string; _estimada: boolean };
  const movimientos: Mov[] = [];

  for (const [i, f] of filas.entries()) {
    const nroFila = i + 2;
    const tipo = clave(f["TIPO"]) === "INGRESO" ? "ingreso" : clave(f["TIPO"]) === "EGRESO" ? "egreso" : null;
    const importe = monto(f["MONTO"]);
    if (!tipo) continue; // filas vacías
    if (importe <= 0) {
      omitidas.push(`fila ${nroFila}: monto ${String(f["MONTO"])}`);
      continue;
    }

    const sinFecha = String(f["FECHA"] ?? "").trim() === "";
    const origenFecha = sinFecha ? fechasCashflow.get(claveFila(f)) : f["FECHA"];
    const { fecha: leida, dudosa } = parsearFecha(origenFecha, sinFecha ? 0 : Number(f["SEMANA"]) || 0);
    if (!sinFecha && !leida) {
      omitidas.push(`fila ${nroFila}: fecha "${String(f["FECHA"])}"`);
      continue;
    }
    // Sin fecha en BASE ni en CASHFLOW COMPLETO: se carga sin fecha (no entra al cashflow).
    const estimada = !leida;
    const fecha = leida;
    if (dudosa && !sinFecha) dudosas.push(`fila ${nroFila}: "${String(f["FECHA"])}" → ${fecha} (${String(f["DETALLE"]).trim()})`);

    const nombreCategoria =
      CATEGORIAS[clave(f["CATEGORIA"])] ?? (tipo === "ingreso" ? "Otros ingresos" : "Otros gastos");
    const categoriaId = idCategoria(nombreCategoria, tipo);
    if (!categoriaId) {
      omitidas.push(`fila ${nroFila}: categoría ${nombreCategoria} (${tipo}) no existe`);
      continue;
    }

    const valorEvento = clave(f["EVENTO"]);
    const evento = EVENTOS[valorEvento] ?? null;
    const detalle = String(f["DETALLE"] ?? "").trim();

    movimientos.push({
      _evento: evento,
      empresa: EMPRESA,
      tipo,
      monto: importe,
      fecha,
      descripcion: detalle || nombreCategoria,
      categoria_id: categoriaId,
      // Lo que no es evento (Ctas Ctes, Vidal, Sueldos…) queda como cuenta/proveedor.
      contraparte: !evento && valorEvento ? tituloCaso(valorEvento) : null,
      // ESTADO "EMITIDO" en la planilla = se pagó con cheque emitido (todavía sin debitar).
      medio_pago: clave(f["ESTADO"]) === "EMITIDO" ? "cheque_emitido" : (MEDIOS[clave(f["METODO DE PAGO"])] ?? "otro"),
      estado: ESTADOS[clave(f["ESTADO"])] ?? "real",
      facturado: f["FACTURADO"] === true || clave(f["FACTURADO"]) === "TRUE",
      iva: monto(f["IVA"]) || null,
      iibb: monto(f["IIBB"]) || null,
      notas: estimada ? MARCA_SIN_FECHA : MARCA,
      _estimada: estimada,
    });
  }

  // Eventos: fecha = la del último ingreso (o último movimiento) del evento.
  const nombres = [...new Set(movimientos.map((m) => m._evento).filter((n): n is string => !!n))];
  const filasEventos = nombres.map((nombre) => {
    const todos = movimientos.filter((m) => m._evento === nombre);
    const conFecha = todos.filter((m): m is Mov & { fecha: string } => m.fecha !== null);
    const ingresos = conFecha.filter((m) => m.tipo === "ingreso");
    // Sin ningún movimiento con fecha, el evento queda con la de hoy (se corrige en la app).
    const fecha = (ingresos.length ? ingresos : conFecha).map((m) => m.fecha).sort().at(-1) ?? hoy;
    return { nombre, fecha, estado: fecha <= hoy ? "cerrado" : "planificado", notas: MARCA };
  });

  // Los eventos que ya existen (con presupuestos, cheques o facturas vinculados) se reusan por nombre.
  const { data: existentes, error: errorEx } = await supabase.from("eventos").select("id, nombre");
  if (errorEx || !existentes) throw new Error(errorEx?.message ?? "No se leyeron los eventos");
  const idEvento = new Map(existentes.map((e) => [e.nombre, e.id]));
  const nuevos = filasEventos.filter((e) => !idEvento.has(e.nombre));
  if (MODO === "prueba") {
    resumen(movimientos, omitidas, dudosas, nuevos.map((e) => e.nombre));
    return;
  }
  if (nuevos.length) {
    const { data: creados, error: errorEv } = await supabase.from("eventos").insert(nuevos).select("id, nombre");
    if (errorEv || !creados) throw new Error(errorEv?.message ?? "No se crearon eventos");
    for (const e of creados) idEvento.set(e.nombre, e.id);
  }
  const eventos = filasEventos;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- se descarta el campo auxiliar
  const filasTransacciones = movimientos.map(({ _evento, _estimada, ...m }) => ({
    ...m,
    evento_id: _evento ? idEvento.get(_evento) : null,
  }));

  for (let i = 0; i < filasTransacciones.length; i += 200) {
    const { error } = await supabase.from("transacciones").insert(filasTransacciones.slice(i, i + 200));
    if (error) throw new Error(`Lote ${i / 200 + 1}: ${error.message}`);
  }

  const estimadas = movimientos.filter((m) => m._estimada).length;
  console.log(`Importados: ${eventos.length} eventos y ${filasTransacciones.length} movimientos (${estimadas} sin fecha).`);
  if (omitidas.length) console.log(`\nOmitidas (${omitidas.length}):\n  ${omitidas.join("\n  ")}`);
  if (dudosas.length) console.log(`\nFechas dudosas, revisar (${dudosas.length}):\n  ${dudosas.join("\n  ")}`);
}

/** Totales por tipo y estado de lo que se va a importar (para comparar con la planilla). */
function resumen(movimientos: Record<string, unknown>[], omitidas: string[], dudosas: string[], eventosNuevos: string[]) {
  const suma = (tipo: string, estado?: string) =>
    movimientos.filter((m) => m.tipo === tipo && (!estado || m.estado === estado)).reduce((s, m) => s + Number(m.monto), 0).toFixed(2);
  console.log(`Movimientos: ${movimientos.length} · ingresos ${suma("ingreso")} · egresos ${suma("egreso")}`);
  for (const e of ["real", "pendiente", "proyectado"]) console.log(`  ${e}: ingresos ${suma("ingreso", e)} · egresos ${suma("egreso", e)}`);
  console.log(`Eventos nuevos: ${eventosNuevos.join(", ") || "ninguno"}`);
  if (omitidas.length) console.log(`Omitidas (${omitidas.length}):\n  ${omitidas.join("\n  ")}`);
  if (dudosas.length) console.log(`Fechas dudosas (${dudosas.length}):\n  ${dudosas.join("\n  ")}`);
}

/** Respalda todo Financiero en .planilla/, desvincula las facturas emitidas y borra todos los movimientos. */
async function vaciarFinanciero() {
  if (EMPRESA === "ruta") return vaciarRuta();
  const [t, e, c, ce] = await Promise.all([
    supabase.from("transacciones").select("*").limit(20000),
    supabase.from("eventos").select("*"),
    supabase.from("categorias").select("*"),
    supabase.from("comprobantes_emitidos").select("id, transaccion_id").not("transaccion_id", "is", null),
  ]);
  if (t.error || e.error || c.error || ce.error) throw new Error("No se pudo leer para el respaldo");
  const archivo = `.planilla/respaldo-financiero-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(archivo, JSON.stringify({ transacciones: t.data, eventos: e.data, categorias: c.data, comprobantes: ce.data }, null, 1));
  console.log(`Respaldo: ${archivo} (${t.data.length} movimientos)`);

  const desv = await supabase.from("comprobantes_emitidos").update({ transaccion_id: null }).not("transaccion_id", "is", null).select("id");
  if (desv.error) throw new Error(desv.error.message);
  const borr = await supabase.from("transacciones").delete().not("id", "is", null).select("id");
  if (borr.error) throw new Error(borr.error.message);
  console.log(`Desvinculadas ${desv.data.length} facturas emitidas · borrados ${borr.data.length} movimientos`);
}

/** Respalda y borra solo los movimientos de Ruta (los de Nero no se tocan). */
async function vaciarRuta() {
  const t = await supabase.from("transacciones").select("*").eq("empresa", "ruta").limit(20000);
  if (t.error) throw new Error("No se pudo leer para el respaldo");
  const archivo = `.planilla/respaldo-ruta-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(archivo, JSON.stringify({ transacciones: t.data }, null, 1));
  console.log(`Respaldo: ${archivo} (${t.data.length} movimientos de Ruta)`);
  const ids = t.data.map((x) => x.id);
  const desv = ids.length ? await supabase.from("comprobantes_emitidos").update({ transaccion_id: null }).in("transaccion_id", ids).select("id") : { data: [], error: null };
  if (desv.error) throw new Error(desv.error.message);
  const borr = await supabase.from("transacciones").delete().eq("empresa", "ruta").select("id");
  if (borr.error) throw new Error(borr.error.message);
  console.log(`Borrados ${borr.data.length} movimientos de Ruta`);
}

const acciones: Record<string, () => Promise<void>> = {
  borrar,
  prueba: importar,
  importar,
  reemplazar: async () => {
    await vaciarFinanciero();
    await importar();
  },
};
(acciones[MODO] ?? importar)().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
