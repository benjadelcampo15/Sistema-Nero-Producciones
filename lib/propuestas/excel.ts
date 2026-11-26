import "server-only";
import ExcelJS from "exceljs";
import { NOMBRE_EMPRESA } from "@/lib/empresas";
import { formatoFecha, formatoFechaHora } from "@/lib/formato";
import { NOMBRE_PRIORIDAD_PAGO } from "@/lib/pagos/tipos";
import { NOMBRE_ESTADO_PROPUESTA, calcularPropuesta, type Propuesta } from "./tipos";

const PESOS = '"$ "#,##0.00;[Red]-"$ "#,##0.00';
const OSCURO = "FF1C1917";
const f = (formula: string, result: number) => ({ formula, result }) as ExcelJS.CellFormulaValue;

/** Nombre del archivo: PROPUESTA_PAGOS_NERO_PAGOS SEMANALES_2026-11-25.xlsx (sin caracteres raros). */
export function nombreArchivoPropuesta(p: Propuesta, extension: "pdf" | "xlsx") {
  const limpio = p.nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w .-]/g, "").trim().toUpperCase().slice(0, 60);
  return `PROPUESTA_PAGOS_${NOMBRE_EMPRESA[p.empresa].toUpperCase()}_${limpio || p.numero}_${p.fecha}.${extension}`;
}

/**
 * Excel de una propuesta de pagos: disponible, pagos en orden con el acumulado
 * y el saldo (con fórmulas: si se cambia un importe, se recalcula). Solo lee.
 */
export async function excelPropuesta(p: Propuesta, eventos: Map<string, string>) {
  const c = calcularPropuesta(p.disponible, p.items);
  const libro = new ExcelJS.Workbook();
  libro.creator = "Planix";
  libro.calcProperties = { fullCalcOnLoad: true };
  const hoja = libro.addWorksheet("Propuesta de pagos", { views: [{ state: "frozen", ySplit: 8 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  [7, 30, 34, 24, 16, 16, 16, 16, 30, 13, 30].forEach((w, i) => (hoja.getColumn(i + 1).width = w));

  hoja.getCell("A1").value = `Propuesta de pagos · ${p.nombre}`;
  hoja.getCell("A1").font = { bold: true, size: 14 };
  hoja.getCell("A2").value = `${NOMBRE_EMPRESA[p.empresa]} · ${formatoFecha(p.fecha)} · Propuesta #${p.numero} · ${NOMBRE_ESTADO_PROPUESTA[p.estado]}`;
  hoja.getCell("A2").font = { color: { argb: "FF78716C" } };
  hoja.getCell("A3").value = `Exportado de Planix el ${formatoFechaHora(new Date().toISOString())}. Es una planificación: no son pagos realizados.`;
  hoja.getCell("A3").font = { color: { argb: "FFA8A29E" }, size: 9 };
  if (p.observaciones) {
    hoja.getCell("E2").value = `Observaciones: ${p.observaciones}`;
    hoja.getCell("E2").font = { italic: true, color: { argb: "FF57534E" } };
  }

  // Resumen (filas 5-6): disponible, total propuesto (fórmula) y saldo restante (fórmula).
  const primera = 9;
  const ultima = primera + p.items.length - 1;
  hoja.getRow(5).values = ["", "Dinero disponible", "Total de pagos propuestos", "Saldo restante"];
  hoja.getRow(5).eachCell((x) => (x.font = { color: { argb: "FF78716C" }, size: 9 }));
  hoja.getCell("B6").value = p.disponible;
  hoja.getCell("C6").value = p.items.length ? f(`SUM(F${primera}:F${ultima})`, c.total) : 0;
  hoja.getCell("D6").value = f("B6-C6", c.saldo);
  for (const x of ["B6", "C6", "D6"]) {
    hoja.getCell(x).numFmt = PESOS;
    hoja.getCell(x).font = { bold: true, size: 13 };
  }
  hoja.getCell("D6").font = { bold: true, size: 13, color: { argb: c.excedido ? "FFB91C1C" : "FF15803D" } };
  if (c.excedido) {
    hoja.getCell("E6").value = "Se supera el dinero disponible";
    hoja.getCell("E6").font = { bold: true, color: { argb: "FFB91C1C" } };
  }

  hoja.getRow(8).values = ["Orden", "Proveedor", "Detalle", "Evento", "Adeudado", "A pagar", "Acumulado", "Saldo restante", "Alias / CBU", "Prioridad", "Observaciones"];
  hoja.getRow(8).eachCell((x) => {
    x.font = { bold: true, color: { argb: "FFFFFFFF" } };
    x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: OSCURO } };
    x.alignment = { vertical: "middle", wrapText: true };
  });
  hoja.getRow(8).height = 24;

  c.filas.forEach((fila, i) => {
    const n = primera + i;
    const x = fila.pago;
    const r = hoja.getRow(n);
    r.values = [
      i + 1,
      x.proveedor,
      [x.detalle, x.solicitud_id ? `(Solicitud de pagos${x.solicitante ? `, pidió ${x.solicitante}` : ""})` : ""].filter(Boolean).join(" "),
      x.evento_id ? (eventos.get(x.evento_id) ?? "") : "",
      x.adeudado,
      x.importe,
      f(i === 0 ? `F${n}` : `G${n - 1}+F${n}`, fila.acumulado),
      f(`$B$6-G${n}`, fila.saldoDespues),
      x.alias_cbu,
      NOMBRE_PRIORIDAD_PAGO[x.prioridad],
      x.observaciones,
    ];
    for (const col of [5, 6, 7, 8]) r.getCell(col).numFmt = PESOS;
    r.getCell(6).font = { bold: true };
    r.getCell(3).alignment = { wrapText: true, vertical: "top" };
    if (x.prioridad === "muy_urgente") r.getCell(10).font = { bold: true, color: { argb: "FFB91C1C" } };
    if (x.prioridad === "urgente") r.getCell(10).font = { bold: true, color: { argb: "FFB45309" } };
    if (fila.noAlcanza) r.getCell(8).font = { bold: true, color: { argb: "FFB91C1C" } };
  });

  const t = hoja.getRow(ultima + 1 < primera ? primera : ultima + 1);
  const hay = p.items.length > 0;
  t.values = [
    "",
    `TOTAL (${p.items.length} pago${p.items.length === 1 ? "" : "s"})`,
    "",
    "",
    hay ? f(`SUM(E${primera}:E${ultima})`, c.adeudado) : 0,
    hay ? f(`SUM(F${primera}:F${ultima})`, c.total) : 0,
    "",
    f(`B6-F${t.number}`, c.saldo),
  ];
  t.eachCell({ includeEmpty: true }, (x) => {
    x.font = { bold: true };
    x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F4" } };
    x.border = { top: { style: "thin", color: { argb: "FF78716C" } } };
  });
  for (const col of [5, 6, 8]) t.getCell(col).numFmt = PESOS;
  if (hay) hoja.autoFilter = { from: `A8`, to: `K${ultima}` };

  return Buffer.from(await libro.xlsx.writeBuffer());
}
