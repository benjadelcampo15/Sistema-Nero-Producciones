// Importa la hoja BASE de la planilla de Nero.
//   npm run importar                → importa .planilla/planilla.xlsx
//   npm run importar -- borrar      → borra lo importado (marcado en notas)
//
// La planilla se descarga de Google Sheets (Archivo → Descargar → .xlsx) y se
// guarda en .planilla/ (carpeta ignorada por git: son datos reales).

import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

const MARCA = "IMPORTADO PLANILLA";
const MARCA_FECHA_ESTIMADA = `${MARCA} · fecha estimada (sin fecha en la planilla)`;
const ARCHIVO = ".planilla/planilla.xlsx";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secreta = process.env.SUPABASE_SECRET_KEY;
if (!url || !secreta) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local");
  process.exit(1);
}
const supabase = createClient(url, secreta, { auth: { autoRefreshToken: false, persistSession: false } });

// ─── Mapeos ──────────────────────────────────────────────────────────────

/** Valores de la columna EVENTO que son eventos (el resto son cuentas/proveedores). */
const EVENTOS: Record<string, string> = {
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
};

const MEDIOS: Record<string, string> = {
  TRANSFERENCIA: "transferencia",
  EFECTIVO: "efectivo",
  TARJETA: "tarjeta",
  "CHEQUE EMITIDO": "cheque_emitido",
  "CHEQUE A EMITIR": "cheque_a_emitir",
  "CHEQUE A COBRAR": "cheque_a_cobrar",
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
  const e = await supabase.from("eventos").delete().eq("notas", MARCA).select("id");
  if (t.error || e.error) throw new Error((t.error ?? e.error)!.message);
  console.log(`Borrados: ${t.data.length} movimientos y ${e.data.length} eventos importados.`);
}

async function importar() {
  const { data: previos } = await supabase.from("transacciones").select("id").like("notas", `${MARCA}%`).limit(1);
  if (previos?.length) {
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
  const idCategoria = (nombre: string, tipo: string) => categorias.find((c) => c.nombre === nombre && c.tipo === tipo)?.id;

  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const omitidas: string[] = [];
  const dudosas: string[] = [];

  type Mov = Record<string, unknown> & { _evento: string | null; fecha: string; tipo: string; _estimada: boolean };
  const movimientos: Mov[] = [];
  let ultimaFecha: string | null = null;

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
    if (leida && !sinFecha) ultimaFecha = leida;
    // Sin fecha en ningún lado: fila anterior por ahora; si es de un evento, se corrige abajo.
    const estimada = !leida;
    // Una fecha estimada nunca es futura (la fila anterior puede ser un cheque a fecha).
    const fecha = leida ?? [ultimaFecha ?? "2026-04-01", hoy].sort()[0];
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
      tipo,
      monto: importe,
      fecha,
      descripcion: detalle || nombreCategoria,
      categoria_id: categoriaId,
      // Lo que no es evento (Ctas Ctes, Vidal, Sueldos…) queda como cuenta/proveedor.
      contraparte: !evento && valorEvento ? tituloCaso(valorEvento) : null,
      medio_pago: MEDIOS[clave(f["METODO DE PAGO"])] ?? "otro",
      estado: ESTADOS[clave(f["ESTADO"])] ?? "real",
      facturado: f["FACTURADO"] === true || clave(f["FACTURADO"]) === "TRUE",
      iva: monto(f["IVA"]) || null,
      iibb: monto(f["IIBB"]) || null,
      notas: estimada ? MARCA_FECHA_ESTIMADA : MARCA,
      _estimada: estimada,
    });
  }

  // Fecha estimada de movimientos de eventos: la última fecha real del evento.
  for (const m of movimientos.filter((m) => m._estimada && m._evento)) {
    const fechas = movimientos.filter((o) => o._evento === m._evento && !o._estimada).map((o) => o.fecha).sort();
    if (fechas.length) m.fecha = [fechas.at(-1)!, hoy].sort()[0];
  }

  // Eventos: fecha = la del último ingreso (o último movimiento) del evento.
  const nombres = [...new Set(movimientos.map((m) => m._evento).filter((n): n is string => !!n))];
  const filasEventos = nombres.map((nombre) => {
    const todos = movimientos.filter((m) => m._evento === nombre);
    // Solo fechas que vienen de la planilla; las estimadas no sirven para fechar el evento.
    const conFecha = todos.filter((m) => !m._estimada);
    const suyos = conFecha.length ? conFecha : todos;
    const ingresos = suyos.filter((m) => m.tipo === "ingreso");
    const fecha = (ingresos.length ? ingresos : suyos).map((m) => m.fecha).sort().at(-1)!;
    return { nombre, fecha, estado: fecha <= hoy ? "cerrado" : "planificado", notas: MARCA };
  });

  const { data: eventos, error: errorEv } = await supabase.from("eventos").insert(filasEventos).select("id, nombre");
  if (errorEv || !eventos) throw new Error(errorEv?.message ?? "No se crearon eventos");
  const idEvento = new Map(eventos.map((e) => [e.nombre, e.id]));

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
  console.log(`Importados: ${eventos.length} eventos y ${filasTransacciones.length} movimientos (${estimadas} con fecha estimada).`);
  if (omitidas.length) console.log(`\nOmitidas (${omitidas.length}):\n  ${omitidas.join("\n  ")}`);
  if (dudosas.length) console.log(`\nFechas dudosas, revisar (${dudosas.length}):\n  ${dudosas.join("\n  ")}`);
}

(process.argv[2] === "borrar" ? borrar : importar)().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
