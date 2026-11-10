import "server-only";
import { utils, write, type CellObject, type WorkSheet } from "xlsx";
import { NOMBRE_EMPRESA } from "@/lib/empresas";
import type { ResumenTarjeta } from "./consultas";
import { calcularTotales, NOMBRE_MES, type MovimientoTarjeta } from "./tipos";

type Mes = { resumen: ResumenTarjeta; movimientos: MovimientoTarjeta[] };

const NERO = NOMBRE_EMPRESA.nero.toUpperCase();
const RUTA = NOMBRE_EMPRESA.ruta.toUpperCase();
const PESOS = "#,##0.00";
const FECHA = "dd/mm/yyyy";

/** Hoja de cálculo armada celda por celda (con fórmulas, para que siga funcionando al editarla). */
class Hoja {
  hoja: WorkSheet = {};
  private maxFila = 0;
  private maxCol = 0;
  set(fila: number, col: number, valor: string | number | null, opciones: { f?: string; z?: string } = {}) {
    if (valor === null && !opciones.f) return;
    const celda: CellObject =
      typeof valor === "number" || opciones.f ? { t: "n", v: typeof valor === "number" ? valor : 0 } : { t: "s", v: String(valor) };
    if (opciones.f) celda.f = opciones.f;
    if (opciones.z) celda.z = opciones.z;
    this.hoja[utils.encode_cell({ r: fila, c: col })] = celda;
    this.maxFila = Math.max(this.maxFila, fila);
    this.maxCol = Math.max(this.maxCol, col);
  }
  fecha(fila: number, col: number, iso: string | null) {
    if (!iso) return;
    const [a, m, d] = iso.split("-").map(Number);
    // Número de serie de Excel (días desde 30/12/1899).
    const serie = Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
    this.set(fila, col, serie, { z: FECHA });
  }
  cerrar(anchos: number[]) {
    this.hoja["!ref"] = utils.encode_range({ s: { r: 0, c: 0 }, e: { r: this.maxFila, c: this.maxCol } });
    this.hoja["!cols"] = anchos.map((wch) => ({ wch }));
    return this.hoja;
  }
}

const col = (c: number) => utils.encode_col(c);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Nombre de la hoja de cada mes ("SEPTIEMBRE"; con el año si hay meses de varios años o dos resúmenes del mismo mes). */
function nombresDeHojas(meses: Mes[]) {
  const base = meses.map((m) => NOMBRE_MES[Number(m.resumen.fecha_cierre.slice(5, 7)) - 1].toUpperCase());
  const anios = new Set(meses.map((m) => m.resumen.fecha_cierre.slice(0, 4)));
  const tarjetas = new Set(meses.map((m) => m.resumen.tarjeta));
  const usados = new Map<string, number>();
  return meses.map((m, i) => {
    let nombre = base[i];
    if (anios.size > 1) nombre += ` ${m.resumen.fecha_cierre.slice(2, 4)}`;
    if (tarjetas.size > 1) nombre += ` ${m.resumen.tarjeta}`;
    nombre = nombre.replace(/[\\/?*[\]:]/g, " ").slice(0, 28);
    const n = (usados.get(nombre) ?? 0) + 1;
    usados.set(nombre, n);
    return n > 1 ? `${nombre} ${n}` : nombre;
  });
}

/** Celdas clave de cada hoja de mes, para armar el RESUMEN con referencias. */
type Referencias = {
  hoja: string;
  cotizacion: string;
  neroPesos: string;
  neroDolares: string;
  rutaPesos: string;
  rutaDolares: string;
  sinPesos: string;
  sinDolares: string;
  cargosNero: string;
  cargosRuta: string;
  totalNero: string;
  totalRuta: string;
  cargos: { descripcion: string; nero: string; ruta: string; valorNero: number; valorRuta: number }[];
};

function hojaDelMes(mes: Mes, nombre: string): { hoja: WorkSheet; ref: Referencias } {
  const h = new Hoja();
  const { resumen } = mes;
  const consumos = mes.movimientos.filter((m) => m.tipo === "consumo");
  const cargos = mes.movimientos.filter((m) => m.tipo === "cargo");
  const pagos = mes.movimientos.filter((m) => m.tipo === "pago");
  const titulos = ["FECHA", "DESCRIPCIÓN", "PESOS", "DÓLARES", "EMPRESA", "DETALLE", "TOTAL"];
  titulos.forEach((t, c) => h.set(0, c, t));

  // Consumos.
  let f = 1;
  for (const m of consumos) {
    h.fecha(f, 0, m.fecha);
    h.set(f, 1, m.descripcion);
    if (m.pesos) h.set(f, 2, m.pesos, { z: PESOS });
    if (m.dolares) h.set(f, 3, m.dolares, { z: PESOS });
    h.set(f, 4, m.empresa ? NOMBRE_EMPRESA[m.empresa].toUpperCase() : null);
    h.set(f, 5, m.detalle);
    // En cuotas: el total de la compra (cuota × cantidad de cuotas), como en la planilla.
    if (m.cuotas && m.cuotas > 1 && m.pesos) h.set(f, 6, r2(m.pesos * m.cuotas), { f: `C${f + 1}*${m.cuotas}`, z: PESOS });
    f++;
  }
  // Sin consumos queda una fila vacía (así las sumas no se incluyen a sí mismas).
  if (!consumos.length) f = 2;
  const finConsumos = f; // número de fila de Excel del último consumo
  const rango = (c: string) => `${c}2:${c}${finConsumos}`;
  // Cada fórmula lleva también su resultado (los visores que no recalculan muestran ese valor).
  const suma = (lista: MovimientoTarjeta[], campo: "pesos" | "dolares") => r2(lista.reduce((s, m) => s + m[campo], 0));
  const cotizacion = resumen.cotizacion_usd ?? 0;
  const filaTotal = f;
  h.set(filaTotal, 1, "TOTAL CONSUMOS");
  h.set(filaTotal, 2, suma(consumos, "pesos"), { f: `SUM(${rango("C")})`, z: PESOS });
  h.set(filaTotal, 3, suma(consumos, "dolares"), { f: `SUM(${rango("D")})`, z: PESOS });

  // Impuestos, cargos e intereses: cada uno repartido entre las empresas.
  f = filaTotal + 2;
  h.set(f, 1, "IMPUESTOS, CARGOS E INTERESES");
  f++;
  ["FECHA", "DESCRIPCIÓN", "PESOS", "DÓLARES", NERO, RUTA, `% ${NERO}`].forEach((t, c) => h.set(f, c, t));
  f++;
  const primeraCargo = f;
  const refsCargos: Referencias["cargos"] = [];
  // La cotización va debajo de los cargos; su fila se sabe de antemano para las fórmulas.
  const filaCotizacion = primeraCargo + cargos.length + 3;
  let cargosNero = 0;
  let cargosRuta = 0;
  for (const m of cargos) {
    const fila = f + 1;
    h.fecha(f, 0, m.fecha);
    h.set(f, 1, m.descripcion);
    if (m.pesos) h.set(f, 2, m.pesos, { z: PESOS });
    if (m.dolares) h.set(f, 3, m.dolares, { z: PESOS });
    h.set(f, 6, m.reparto_nero / 100, { z: "0%" });
    const enPesos = `(C${fila}+D${fila}*$C$${filaCotizacion + 1})`;
    const total = m.pesos + m.dolares * cotizacion;
    const nero = (total * m.reparto_nero) / 100;
    cargosNero += nero;
    cargosRuta += total - nero;
    h.set(f, 4, r2(nero), { f: `${enPesos}*G${fila}`, z: PESOS });
    h.set(f, 5, r2(total - nero), { f: `${enPesos}*(1-G${fila})`, z: PESOS });
    refsCargos.push({ descripcion: m.descripcion, nero: `E${fila}`, ruta: `F${fila}`, valorNero: r2(nero), valorRuta: r2(total - nero) });
    f++;
  }
  const filaTotalCargos = f;
  const rangoCargos = (c: string) => (cargos.length ? `SUM(${c}${primeraCargo + 1}:${c}${filaTotalCargos})` : "0");
  h.set(filaTotalCargos, 1, "TOTAL IMPUESTOS Y CARGOS");
  const totalesCargos = [suma(cargos, "pesos"), suma(cargos, "dolares"), r2(cargosNero), r2(cargosRuta)];
  for (const [i, [c, letra]] of ([[2, "C"], [3, "D"], [4, "E"], [5, "F"]] as const).entries()) {
    h.set(filaTotalCargos, c, totalesCargos[i], { f: rangoCargos(letra), z: PESOS });
  }

  // Cotización y totales por empresa.
  f = filaCotizacion;
  h.set(f, 1, "COTIZACIÓN DÓLAR");
  h.set(f, 2, cotizacion, { z: PESOS });
  const C = (fila: number) => `C${fila + 1}`;
  f += 2;
  ["", "", "PESOS", "DÓLARES", "CARGOS", "TOTAL EN PESOS"].forEach((t, c) => t && h.set(f, c, t));
  f++;
  const filas: Record<string, number> = {};
  for (const [clave, etiqueta, criterio] of [
    ["nero", NERO, `"${NERO}"`],
    ["ruta", RUTA, `"${RUTA}"`],
    ["sin", "SIN ASIGNAR", `""`],
  ] as const) {
    filas[clave] = f;
    const propios = consumos.filter((m) => (m.empresa ?? "sin") === clave);
    const pesos = suma(propios, "pesos");
    const dolares = suma(propios, "dolares");
    h.set(f, 1, etiqueta);
    h.set(f, 2, pesos, { f: `SUMIF(${rango("E")},${criterio},${rango("C")})`, z: PESOS });
    h.set(f, 3, dolares, { f: `SUMIF(${rango("E")},${criterio},${rango("D")})`, z: PESOS });
    if (clave !== "sin") {
      const susCargos = r2(clave === "nero" ? cargosNero : cargosRuta);
      h.set(f, 4, susCargos, { f: `${clave === "nero" ? "E" : "F"}${filaTotalCargos + 1}`, z: PESOS });
      h.set(f, 5, r2(pesos + dolares * cotizacion + susCargos), { f: `C${f + 1}+D${f + 1}*${C(filaCotizacion).replace("C", "$C$")}+E${f + 1}`, z: PESOS });
    }
    f++;
  }
  if (pagos.length) {
    f++;
    h.set(f, 1, "PAGOS Y CRÉDITOS DEL PERÍODO");
    f++;
    for (const m of pagos) {
      h.fecha(f, 0, m.fecha);
      h.set(f, 1, m.descripcion);
      if (m.pesos) h.set(f, 2, m.pesos, { z: PESOS });
      if (m.dolares) h.set(f, 3, m.dolares, { z: PESOS });
      f++;
    }
  }
  if (resumen.saldo_actual_ars !== null || resumen.saldo_actual_usd !== null) {
    f++;
    h.set(f, 1, "SALDO ACTUAL (según el resumen)");
    if (resumen.saldo_actual_ars !== null) h.set(f, 2, resumen.saldo_actual_ars, { z: PESOS });
    if (resumen.saldo_actual_usd !== null) h.set(f, 3, resumen.saldo_actual_usd, { z: PESOS });
  }

  const q = `'${nombre}'!`;
  const abs = (celda: string) => q + celda.replace(/^([A-Z]+)(\d+)$/, "$$$1$$$2");
  return {
    hoja: h.cerrar([12, 44, 16, 12, 16, 18, 14]),
    ref: {
      hoja: nombre,
      cotizacion: abs(C(filaCotizacion)),
      neroPesos: abs(`C${filas.nero + 1}`),
      neroDolares: abs(`D${filas.nero + 1}`),
      rutaPesos: abs(`C${filas.ruta + 1}`),
      rutaDolares: abs(`D${filas.ruta + 1}`),
      sinPesos: abs(`C${filas.sin + 1}`),
      sinDolares: abs(`D${filas.sin + 1}`),
      cargosNero: abs(`E${filaTotalCargos + 1}`),
      cargosRuta: abs(`F${filaTotalCargos + 1}`),
      totalNero: abs(`F${filas.nero + 1}`),
      totalRuta: abs(`F${filas.ruta + 1}`),
      cargos: refsCargos.map((c) => ({ ...c, nero: q + c.nero, ruta: q + c.ruta })),
    },
  };
}

/** RESUMEN: una fila por mes con los totales de cada empresa, y debajo los cargos de cada mes repartidos. */
function hojaResumen(meses: Mes[], refs: Referencias[]) {
  const h = new Hoja();
  const titulos = ["MES", `${NERO} $`, `${NERO} U$S`, `${RUTA} $`, `${RUTA} U$S`, "SIN ASIGNAR $", "SIN ASIGNAR U$S", "COTIZACIÓN", `CARGOS ${NERO}`, `CARGOS ${RUTA}`, `TOTAL ${NERO}`, `TOTAL ${RUTA}`];
  titulos.forEach((t, c) => h.set(0, c, t));
  refs.forEach((r, i) => {
    const f = i + 1;
    const t = calcularTotales(meses[i].movimientos, meses[i].resumen.cotizacion_usd);
    h.set(f, 0, r.hoja);
    const valores = [t.consumos.nero.pesos, t.consumos.nero.dolares, t.consumos.ruta.pesos, t.consumos.ruta.dolares, t.consumos.sin.pesos, t.consumos.sin.dolares, meses[i].resumen.cotizacion_usd ?? 0, t.cargos.nero, t.cargos.ruta, t.empresa.nero, t.empresa.ruta];
    [r.neroPesos, r.neroDolares, r.rutaPesos, r.rutaDolares, r.sinPesos, r.sinDolares, r.cotizacion, r.cargosNero, r.cargosRuta, r.totalNero, r.totalRuta].forEach((celda, c) =>
      h.set(f, c + 1, valores[c], { f: celda, z: PESOS }),
    );
  });
  const filaTotal = refs.length + 1;
  h.set(filaTotal, 0, "TOTAL");
  const totales = meses.map((m) => calcularTotales(m.movimientos, m.resumen.cotizacion_usd));
  const columnas: [number, (t: (typeof totales)[number]) => number][] = [
    [1, (t) => t.consumos.nero.pesos],
    [2, (t) => t.consumos.nero.dolares],
    [3, (t) => t.consumos.ruta.pesos],
    [4, (t) => t.consumos.ruta.dolares],
    [5, (t) => t.consumos.sin.pesos],
    [6, (t) => t.consumos.sin.dolares],
    [8, (t) => t.cargos.nero],
    [9, (t) => t.cargos.ruta],
    [10, (t) => t.empresa.nero],
    [11, (t) => t.empresa.ruta],
  ];
  for (const [c, valor] of columnas) {
    h.set(filaTotal, c, r2(totales.reduce((s, t) => s + valor(t), 0)), { f: `SUM(${col(c)}2:${col(c)}${filaTotal})`, z: PESOS });
  }

  // Detalle de los cargos de cada mes (como los cuadros de la planilla original).
  let f = filaTotal + 3;
  refs.forEach((r) => {
    if (!r.cargos.length) return;
    h.set(f, 0, r.hoja);
    f++;
    h.set(f, 0, "DETALLE");
    h.set(f, 1, `SUM de ${NERO}`);
    h.set(f, 2, `SUM de ${RUTA}`);
    f++;
    const desde = f + 1;
    for (const c of r.cargos) {
      h.set(f, 0, c.descripcion);
      h.set(f, 1, c.valorNero, { f: c.nero, z: PESOS });
      h.set(f, 2, c.valorRuta, { f: c.ruta, z: PESOS });
      f++;
    }
    h.set(f, 0, "Suma total");
    h.set(f, 1, r2(r.cargos.reduce((s, c) => s + c.valorNero, 0)), { f: `SUM(B${desde}:B${f})`, z: PESOS });
    h.set(f, 2, r2(r.cargos.reduce((s, c) => s + c.valorRuta, 0)), { f: `SUM(C${desde}:C${f})`, z: PESOS });
    f += 3;
  });
  return h.cerrar([44, 16, 12, 16, 12, 16, 14, 12, 16, 16, 18, 18]);
}

/** El libro: RESUMEN primero y una hoja por resumen mensual (del más viejo al más nuevo). */
export function armarExcel(meses: Mes[]) {
  const libro = utils.book_new();
  const nombres = nombresDeHojas(meses);
  const hojas = meses.map((m, i) => hojaDelMes(m, nombres[i]));
  utils.book_append_sheet(libro, hojaResumen(meses, hojas.map((h) => h.ref)), "RESUMEN");
  hojas.forEach((h) => utils.book_append_sheet(libro, h.hoja, h.ref.hoja));
  return write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
