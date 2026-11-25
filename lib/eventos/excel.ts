import "server-only";
import ExcelJS from "exceljs";
import { NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";
import { formatoFecha, formatoFechaHora } from "@/lib/formato";
import { TIPOS_FACTURA, calcularPlanilla, diferenciaGasto, iibbIngreso, totalGasto, type Planilla } from "./planilla";
import { NOMBRE_ESTADO_EVENTO, type EstadoEvento } from "./tipos";
import { NOMBRE_SECCION, calcularEntrada, resumir, type Categoria, type Liquidacion } from "./liquidacion";

type EventoExcel = { nombre: string; fecha: string; lugar: string | null; empresa: Empresa; estado: EstadoEvento };

// ─── Estilos comunes ────────────────────────────────────────────────────
const PESOS = '"$ "#,##0.00;[Red]-"$ "#,##0.00';
const CANTIDAD = "#,##0.###";
const PORCENTAJE = '0.##"%"';
const OSCURO = "FF1C1917";
const GRIS = "FFF5F5F4";
const BORDE = { style: "thin" as const, color: { argb: "FFD6D3D1" } };

function encabezado(fila: ExcelJS.Row) {
  fila.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: OSCURO } };
    c.alignment = { vertical: "middle", wrapText: true };
    c.border = { bottom: BORDE };
  });
  fila.height = 30;
}
function total(fila: ExcelJS.Row, color = GRIS) {
  fila.eachCell({ includeEmpty: true }, (c) => {
    c.font = { ...(c.font ?? {}), bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    c.border = { top: { style: "thin", color: { argb: "FF78716C" } } };
  });
}
function titulo(hoja: ExcelJS.Worksheet, texto: string, sub: string) {
  hoja.getCell("A1").value = texto;
  hoja.getCell("A1").font = { bold: true, size: 14 };
  hoja.getCell("A2").value = sub;
  hoja.getCell("A2").font = { color: { argb: "FF78716C" } };
}
/** Celda con fórmula y su resultado ya calculado (se ve bien aunque el programa no recalcule). */
const f = (formula: string, result: number | string | null) => ({ formula, result: result ?? undefined }) as ExcelJS.CellFormulaValue;
/** Verde si es positivo, rojo si es negativo (se reevalúa si cambian los números). */
function colorSigno(hoja: ExcelJS.Worksheet, ref: string) {
  hoja.addConditionalFormatting({
    ref,
    rules: [
      { type: "cellIs", operator: "greaterThan", formulae: ["0"], priority: 1, style: { font: { color: { argb: "FF15803D" }, bold: true } } },
      { type: "cellIs", operator: "lessThan", formulae: ["0"], priority: 2, style: { font: { color: { argb: "FFB91C1C" }, bold: true } } },
    ],
  });
}
const nombreFactura = (id: string) => TIPOS_FACTURA.find((t) => t.id === id)?.nombre ?? id;
const siNo = (b: boolean) => (b ? "Sí" : "No");

function nuevoLibro() {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Planix";
  libro.created = new Date();
  // Excel y Google Sheets recalculan las fórmulas al abrir.
  libro.calcProperties = { fullCalcOnLoad: true };
  return libro;
}

/** Nombre de archivo: MAYÚSCULAS, sin acentos ni símbolos. */
export const nombreArchivo = (...partes: string[]) =>
  partes
    .join("_")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") + ".xlsx";

// ─── A. Planilla completa del evento ────────────────────────────────────

/**
 * Excel de la planilla del evento (Resumen, Ingresos y Gastos por sector),
 * con los mismos valores que Planix y fórmulas para los totales. Es una foto: no modifica nada.
 */
export async function excelPlanilla(evento: EventoExcel, p: Planilla, proveedores: Map<string, string>, conBancarios: boolean) {
  const c = calcularPlanilla(p);
  const libro = nuevoLibro();
  const resumen = libro.addWorksheet("Resumen evento");
  const ingresos = libro.addWorksheet("Ingresos", { views: [{ state: "frozen", ySplit: 1 }] });
  const gastos = libro.addWorksheet("Gastos", { views: [{ state: "frozen", ySplit: 1 }] });

  // Alícuota de IIBB en el Resumen (B9): las fórmulas de IIBB la usan.
  const ALICUOTA = "'Resumen evento'!$B$9";

  // ── Ingresos ──
  ingresos.columns = [
    { header: "Detalle", key: "detalle", width: 38 },
    { header: "Neto", key: "neto", width: 16, style: { numFmt: PESOS } },
    { header: "IVA débito", key: "iva", width: 16, style: { numFmt: PESOS } },
    { header: "Bruto", key: "bruto", width: 16, style: { numFmt: PESOS } },
    { header: "IIBB", key: "iibb", width: 14, style: { numFmt: PESOS } },
    { header: "Factura", key: "factura", width: 10 },
    { header: "Cobrado", key: "cobrado", width: 10 },
  ];
  encabezado(ingresos.getRow(1));
  p.ingresos.forEach((i, k) => {
    const r = k + 2;
    ingresos.addRow({
      detalle: i.detalle || "(sin detalle)",
      neto: i.neto,
      iva: i.iva,
      bruto: i.bruto,
      iibb: f(`IF(F${r}="Sí",ROUND(B${r}*${ALICUOTA}/100,2),0)`, iibbIngreso(i, p.alicuota_iibb)),
      factura: siNo(i.factura),
      cobrado: siNo(i.pagado),
    });
  });
  const finIng = p.ingresos.length + 1;
  const totIng = finIng + 1;
  const sumaIng = (col: string, v: number) => (p.ingresos.length ? f(`SUM(${col}2:${col}${finIng})`, v) : 0);
  total(
    ingresos.addRow({
      detalle: "TOTAL INGRESOS",
      neto: sumaIng("B", c.ingresos.neto),
      iva: sumaIng("C", c.ingresos.iva),
      bruto: sumaIng("D", c.ingresos.bruto),
      iibb: sumaIng("E", c.ingresos.iibb),
    }),
  );
  if (p.ingresos.length) ingresos.autoFilter = { from: "A1", to: `G${finIng}` };

  // ── Gastos por sector ──
  const columnasGastos: Partial<ExcelJS.Column>[] = [
    { header: "Sector", key: "sector", width: 22 },
    { header: "Detalle", key: "detalle", width: 34 },
    { header: "Neto", key: "neto", width: 15, style: { numFmt: PESOS } },
    { header: "Tipo de factura", key: "factura", width: 14 },
    { header: "IVA crédito", key: "iva", width: 15, style: { numFmt: PESOS } },
    { header: "Total", key: "total", width: 16, style: { numFmt: PESOS } },
    { header: "Urgente", key: "urgente", width: 9 },
    { header: "Seña / Pagado", key: "sena", width: 16, style: { numFmt: PESOS } },
    { header: "Diferencia", key: "diferencia", width: 16, style: { numFmt: PESOS } },
    { header: "Proveedor vinculado", key: "proveedor", width: 26 },
  ];
  if (conBancarios) columnasGastos.push({ header: "Datos bancarios", key: "bancarios", width: 30 });
  gastos.columns = columnasGastos;
  encabezado(gastos.getRow(1));
  const subtotales: number[] = [];
  for (const s of c.sectores) {
    const titular = gastos.addRow({ sector: s.nombre.toUpperCase() });
    titular.eachCell({ includeEmpty: true }, (celda) => {
      celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
      celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF57534E" } };
    });
    gastos.mergeCells(titular.number, 1, titular.number, columnasGastos.length);
    const desde = titular.number + 1;
    for (const g of s.gastos) {
      const r = gastos.rowCount + 1;
      gastos.addRow({
        sector: s.nombre,
        detalle: g.detalle || "(sin detalle)",
        neto: g.neto,
        factura: nombreFactura(g.tipo_factura),
        iva: g.iva,
        total: f(`C${r}+E${r}`, totalGasto(g)),
        urgente: siNo(g.urgente),
        sena: g.sena,
        diferencia: f(`F${r}-H${r}`, diferenciaGasto(g)),
        proveedor: g.proveedor_id ? (proveedores.get(g.proveedor_id) ?? "") : "",
        ...(conBancarios ? { bancarios: g.datos_bancarios } : {}),
      });
    }
    const hasta = gastos.rowCount;
    const suma = (col: string, v: number) => (s.gastos.length ? f(`SUM(${col}${desde}:${col}${hasta})`, v) : 0);
    const fila = gastos.addRow({
      sector: `Subtotal ${s.nombre}`,
      neto: suma("C", s.totales.neto),
      iva: suma("E", s.totales.iva),
      total: suma("F", s.totales.total),
      sena: suma("H", s.totales.sena),
      diferencia: suma("I", s.totales.diferencia),
    });
    total(fila);
    subtotales.push(fila.number);
    gastos.addRow({});
  }
  const sumaSub = (col: string, v: number) => (subtotales.length ? f(subtotales.map((n) => `${col}${n}`).join("+"), v) : 0);
  const filaTotalGastos = gastos.addRow({
    sector: "TOTAL GASTOS",
    neto: sumaSub("C", c.gastos.neto),
    iva: sumaSub("E", c.gastos.iva),
    total: sumaSub("F", c.gastos.total),
    sena: sumaSub("H", c.gastos.sena),
    diferencia: sumaSub("I", c.gastos.diferencia),
  });
  total(filaTotalGastos, "FFE7E5E4");
  const TG = filaTotalGastos.number;

  // ── Resumen ──
  titulo(resumen, evento.nombre, `${NOMBRE_EMPRESA[evento.empresa]} · ${formatoFecha(evento.fecha)}${evento.lugar ? ` · ${evento.lugar}` : ""}`);
  resumen.getColumn(1).width = 30;
  resumen.getColumn(2).width = 20;
  resumen.getColumn(3).width = 46;
  const filas: [string, ExcelJS.CellValue, string?, string?][] = [
    ["Evento", evento.nombre],
    ["Fecha", formatoFecha(evento.fecha)],
    ["Empresa", NOMBRE_EMPRESA[evento.empresa]],
    ["Estado", NOMBRE_ESTADO_EVENTO[evento.estado]],
    ["Alícuota IIBB (% sobre neto facturado)", p.alicuota_iibb, PORCENTAJE, "Si la cambiás, se recalcula el IIBB de cada ingreso."],
    ["Total ingresos", f(`Ingresos!D${totIng}`, c.ingresos.bruto), PESOS],
    ["Total gastos", f(`Gastos!F${TG}`, c.gastos.total), PESOS],
    ["IVA débito", f(`Ingresos!C${totIng}`, c.ingresos.iva), PESOS],
    ["IVA crédito", f(`Gastos!E${TG}`, c.gastos.iva), PESOS],
    ["IVA a pagar", f("B12-B13", c.ivaAPagar), PESOS, "Débito − crédito"],
    ["IIBB", f(`Ingresos!E${totIng}`, c.iibb), PESOS],
    ["Rentabilidad real", f("B10-B11-B14-B15", c.rentabilidad), PESOS, "Ingresos − gastos − IVA a pagar − IIBB"],
    ["Margen sobre ingresos", f('IF(B10=0,"",B16/B10)', c.margen === null ? "" : c.margen), "0.0%"],
    ["Total pagado (señas)", f(`Gastos!H${TG}`, c.gastos.sena), PESOS],
    ["Falta pagar", f(`Gastos!I${TG}`, c.gastos.diferencia), PESOS],
  ];
  // Filas: 5 Evento · 9 alícuota · 10 ingresos · 11 gastos · 12/13 IVA débito/crédito · 14 IVA a pagar · 15 IIBB · 16 rentabilidad.
  resumen.getRow(4).values = ["Concepto", "Importe", "Cómo se calcula"];
  encabezado(resumen.getRow(4));
  filas.forEach(([concepto, valor, formato, nota], k) => {
    const fila = resumen.getRow(5 + k);
    fila.values = [concepto, valor, nota ?? ""];
    if (formato) fila.getCell(2).numFmt = formato;
    fila.getCell(3).font = { color: { argb: "FF78716C" }, italic: true };
  });
  total(resumen.getRow(16), "FFDCFCE7");
  colorSigno(resumen, "B16");
  resumen.getCell("A21").value = `Exportado de Planix el ${formatoFechaHora(new Date().toISOString())}. Es una foto de la planilla guardada: editar el Excel no cambia Planix.`;
  resumen.getCell("A21").font = { color: { argb: "FFA8A29E" }, size: 9 };

  return Buffer.from(await libro.xlsx.writeBuffer());
}

// ─── B. Entradas y liquidación Isidris ──────────────────────────────────

/**
 * Excel de la sección Entradas y liquidación Isidris (solo esa sección), con
 * los porcentajes del evento y fórmulas que repiten el cálculo de Planix: la
 * parte de Isidris por entrada se redondea al centavo y Nero se queda con el resto.
 */
export async function excelLiquidacion(evento: EventoExcel, l: Liquidacion) {
  const r = resumir(l);
  const libro = nuevoLibro();
  const entradas = libro.addWorksheet("Entradas");
  const extras = libro.addWorksheet("Comida y parking");
  const resumen = libro.addWorksheet("Resumen liquidación");

  // ── Entradas ── (porcentajes arriba: todas las fórmulas los usan)
  titulo(entradas, `Entradas · ${evento.nombre}`, `${NOMBRE_EMPRESA[evento.empresa]} · ${formatoFecha(evento.fecha)}`);
  entradas.getCell("A3").value = "Porcentaje Nero";
  entradas.getCell("B3").value = l.pctNero;
  entradas.getCell("B3").numFmt = PORCENTAJE;
  entradas.getCell("C3").value = "Porcentaje Isidris";
  entradas.getCell("D3").value = f("100-B3", 100 - l.pctNero);
  entradas.getCell("D3").numFmt = PORCENTAJE;
  for (const ref of ["A3", "C3"]) entradas.getCell(ref).font = { bold: true };
  const PCT = "$B$3";
  const cab = 5;
  const columnas: [string, number, string?][] = [
    ["Tipo de entrada", 28],
    ["Valor unitario", 14, PESOS],
    ["Stock", 9, CANTIDAD],
    ["Paquetes vendidos", 11, CANTIDAD],
    ["Entradas por paquete", 11, CANTIDAD],
    ["Cantidad de entradas", 11, CANTIDAD],
    ["Total vendido", 16, PESOS],
    ["Proyección", 16, PESOS],
    ["Corona", 12, PESOS],
    ["Degustación", 12, PESOS],
    ["Gastronomía", 12, PESOS],
    ["Entrada sin costos", 14, PESOS],
    [`Nero ${l.pctNero}%`, 13, PESOS],
    [`Isidris ${100 - l.pctNero}%`, 13, PESOS],
    ["Nero final unitario", 14, PESOS],
    ["Isidris final unitario", 14, PESOS],
    ["Total a liquidar Nero", 17, PESOS],
    ["Total a liquidar Isidris", 17, PESOS],
  ];
  entradas.getRow(cab).values = columnas.map((c) => c[0]);
  columnas.forEach(([, ancho, formato], i) => {
    entradas.getColumn(i + 1).width = ancho;
    if (formato) entradas.getColumn(i + 1).numFmt = formato;
  });
  entradas.getCell("B3").numFmt = PORCENTAJE;
  entradas.getCell("D3").numFmt = PORCENTAJE;
  encabezado(entradas.getRow(cab));
  entradas.views = [{ state: "frozen", ySplit: cab, xSplit: 1 }];
  const listaEntradas = l.categorias.filter((c) => c.seccion === "entradas");
  listaEntradas.forEach((c, k) => {
    const n = cab + 1 + k;
    const x = calcularEntrada(c, l.pctNero);
    entradas.getRow(n).values = [
      c.activa ? c.nombre : `${c.nombre} (desactivada)`,
      c.valor,
      c.stock ?? "",
      c.cantidad,
      c.multiplicador,
      f(`D${n}*E${n}`, x.vendidas),
      f(`B${n}*F${n}`, x.vendido),
      f(`IF(C${n}="","",B${n}*C${n})`, x.proyeccion ?? ""),
      c.corona,
      c.degus,
      c.gastro,
      f(`B${n}-I${n}-J${n}-K${n}`, x.base),
      f(`L${n}-N${n}`, x.nero),
      f(`ROUND(L${n}*(100-${PCT})/100,2)`, x.isidris),
      f(`M${n}+I${n}+J${n}`, x.neroFinal),
      f(`N${n}+K${n}`, x.isidrisFinal),
      f(`O${n}*F${n}`, x.liquidarNero),
      f(`P${n}*F${n}`, x.liquidarIsidris),
    ];
    if (x.costosExcedidos) entradas.getRow(n).getCell(12).font = { color: { argb: "FFB91C1C" }, bold: true };
  });
  const finE = cab + listaEntradas.length;
  const totE = finE + 1;
  const sumaE = (col: string, v: number | null) => (listaEntradas.length ? f(`SUM(${col}${cab + 1}:${col}${finE})`, v) : 0);
  entradas.getRow(totE).values = [
    "TOTAL ENTRADAS",
    null,
    r.entradas.stock === null ? "" : sumaE("C", r.entradas.stock),
    null,
    null,
    sumaE("F", r.entradas.vendidas),
    sumaE("G", r.entradas.vendido),
    sumaE("H", r.entradas.proyeccion),
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    sumaE("Q", r.entradas.liquidarNero),
    sumaE("R", r.entradas.liquidarIsidris),
  ];
  total(entradas.getRow(totE));
  if (listaEntradas.length) entradas.autoFilter = { from: `A${cab}`, to: `R${finE}` };

  // ── Comida y parking ──
  titulo(extras, `Comida y parking · ${evento.nombre}`, "Preventas que se suman a lo de Isidris");
  [28, 14, 10, 14, 16, 16].forEach((w, i) => (extras.getColumn(i + 1).width = w));
  const totalesExtras: Partial<Record<"comida" | "parking", number>> = {};
  let fila = 4;
  for (const s of ["comida", "parking"] as const) {
    const habilitada = s === "comida" ? l.comida : l.parking;
    const t = extras.getRow(fila);
    t.getCell(1).value = NOMBRE_SECCION[s].toUpperCase();
    t.getCell(1).font = { bold: true, size: 12 };
    fila++;
    if (!habilitada) {
      extras.getCell(`A${fila}`).value = "No está habilitada en este evento.";
      extras.getCell(`A${fila}`).font = { italic: true, color: { argb: "FF78716C" } };
      fila += 2;
      continue;
    }
    extras.getRow(fila).values = ["Concepto", "Precio", "Stock", "Cantidad vendida", "Total vendido", "Proyección"];
    encabezado(extras.getRow(fila));
    const desde = fila + 1;
    const lista = l.categorias.filter((c: Categoria) => c.seccion === s);
    for (const c of lista) {
      fila++;
      const vendidas = c.cantidad * c.multiplicador;
      const x = extras.getRow(fila);
      x.values = [
        c.activa ? c.nombre : `${c.nombre} (desactivada)`,
        c.valor,
        c.stock ?? "",
        vendidas,
        f(`B${fila}*D${fila}`, Math.round(c.valor * vendidas * 100) / 100),
        f(`IF(C${fila}="","",B${fila}*C${fila})`, c.stock === null ? "" : Math.round(c.valor * c.stock * 100) / 100),
      ];
      x.getCell(2).numFmt = PESOS;
      x.getCell(5).numFmt = PESOS;
      x.getCell(6).numFmt = PESOS;
    }
    fila++;
    const tot = r[s];
    const hasta = fila - 1;
    const suma = (col: string, v: number | null) => (lista.length ? f(`SUM(${col}${desde}:${col}${hasta})`, v) : 0);
    const st = extras.getRow(fila);
    st.values = [`Total ${NOMBRE_SECCION[s].toLowerCase()}`, null, tot.stock === null ? "" : suma("C", tot.stock), suma("D", tot.vendidas), suma("E", tot.vendido), suma("F", tot.proyeccion)];
    st.getCell(5).numFmt = PESOS;
    st.getCell(6).numFmt = PESOS;
    total(st);
    totalesExtras[s] = fila;
    fila += 3;
  }

  // ── Resumen ──
  titulo(resumen, `Liquidación Isidris · ${evento.nombre}`, `${NOMBRE_EMPRESA[evento.empresa]} · ${formatoFecha(evento.fecha)}`);
  resumen.getColumn(1).width = 44;
  resumen.getColumn(2).width = 20;
  resumen.getColumn(3).width = 50;
  const ref = (s: "comida" | "parking") => (totalesExtras[s] ? `'Comida y parking'!E${totalesExtras[s]}` : "0");
  const filas: [string, ExcelJS.CellValue, string?, string?][] = [
    ["Evento", evento.nombre],
    ["Fecha", formatoFecha(evento.fecha)],
    ["Porcentaje Nero", f("Entradas!B3", l.pctNero), PORCENTAJE],
    ["Porcentaje Isidris", f("Entradas!D3", 100 - l.pctNero), PORCENTAJE],
    ["Cantidad total de entradas vendidas", f(`Entradas!F${totE}`, r.entradas.vendidas), CANTIDAD],
    ["Importe total vendido en entradas", f(`Entradas!G${totE}`, r.entradas.vendido), PESOS],
    ["Total a liquidar a Nero", f(`Entradas!Q${totE}`, r.entradas.liquidarNero), PESOS],
    ["Total de Isidris por entradas", f(`Entradas!R${totE}`, r.entradas.liquidarIsidris), PESOS],
    ["Total de parking", f(ref("parking"), r.parking.vendido), PESOS],
    ["Total de comida", f(ref("comida"), r.comida.vendido), PESOS],
    ["TOTAL GENERAL ISIDRIS", f("B12+B13+B14", r.totalIsidris), PESOS, "Isidris por entradas + parking + comida"],
    ["TOTAL NETO ISIDRIS", f("ROUND(B15/1.21,2)", r.netoIsidris), PESOS, "Total Isidris ÷ 1,21 (sin IVA 21%). Es un cálculo, no un cobro."],
    ["Control: vendido − (Nero + Isidris)", f("B10-B11-B12", r.diferencia), PESOS, "Tiene que dar $ 0,00"],
  ];
  resumen.getRow(4).values = ["Concepto", "Importe", "Detalle"];
  encabezado(resumen.getRow(4));
  filas.forEach(([concepto, valor, formato, nota], k) => {
    const x = resumen.getRow(5 + k);
    x.values = [concepto, valor, nota ?? ""];
    if (formato) x.getCell(2).numFmt = formato;
    x.getCell(3).font = { color: { argb: "FF78716C" }, italic: true };
  });
  total(resumen.getRow(15), "FFE0F2FE");
  total(resumen.getRow(16), "FFE0F2FE");
  resumen.addConditionalFormatting({
    ref: "B17",
    rules: [
      { type: "cellIs", operator: "equal", formulae: ["0"], priority: 1, style: { font: { color: { argb: "FF15803D" }, bold: true } } },
      { type: "expression", formulae: ["B17<>0"], priority: 2, style: { font: { color: { argb: "FFB91C1C" }, bold: true } } },
    ],
  });
  resumen.getCell("A20").value = "Exportado de Planix: es una foto de la liquidación guardada. Editar el Excel no cambia Planix.";
  resumen.getCell("A20").font = { color: { argb: "FFA8A29E" }, size: 9 };
  libro.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 2, visibility: "visible" }];

  return Buffer.from(await libro.xlsx.writeBuffer());
}
