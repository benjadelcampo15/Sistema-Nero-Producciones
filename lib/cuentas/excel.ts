import "server-only";
import ExcelJS from "exceljs";
import { NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";
import { formatoFecha, formatoFechaHora } from "@/lib/formato";
import type { CuentaCorriente, TipoCuenta } from "./tipos";

const PESOS = '"$ "#,##0.00;[Red]-"$ "#,##0.00';
const OSCURO = "FF1C1917";
const r2 = (n: number) => Math.round(n * 100) / 100;
const f = (formula: string, result: number) => ({ formula, result }) as ExcelJS.CellFormulaValue;

function encabezado(fila: ExcelJS.Row) {
  fila.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: OSCURO } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  fila.height = 24;
}
function total(fila: ExcelJS.Row) {
  fila.eachCell({ includeEmpty: true }, (c) => {
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F4" } };
    c.border = { top: { style: "thin", color: { argb: "FF78716C" } } };
  });
}

/**
 * Excel de la cuenta corriente de un proveedor o cliente con una empresa: el
 * mismo extracto que se ve en la ficha (debe, haber y saldo) y los comprobantes
 * con lo pendiente. Es una foto: solo lee.
 */
export async function excelCuentaCorriente(tipo: TipoCuenta, quien: { nombre: string; documento: string }, empresa: Empresa, cuenta: CuentaCorriente) {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Planix";
  libro.calcProperties = { fullCalcOnLoad: true };
  const debeTexto = tipo === "pago" ? "Le debemos" : "Nos debe";
  const pagadoTexto = tipo === "pago" ? "Pagado" : "Cobrado";

  // ── Extracto ──
  const hoja = libro.addWorksheet("Cuenta corriente", { views: [{ state: "frozen", ySplit: 7 }] });
  hoja.getCell("A1").value = quien.nombre;
  hoja.getCell("A1").font = { bold: true, size: 14 };
  hoja.getCell("A2").value = `${quien.documento} · Cuenta corriente con ${NOMBRE_EMPRESA[empresa]} · ${tipo === "pago" ? "Proveedor" : "Cliente"}`;
  hoja.getCell("A2").font = { color: { argb: "FF78716C" } };
  hoja.getCell("A3").value = `Exportado de Planix el ${formatoFechaHora(new Date().toISOString())}`;
  hoja.getCell("A3").font = { color: { argb: "FFA8A29E" }, size: 9 };
  [13, 50, 30, 17, 17, 17].forEach((w, i) => (hoja.getColumn(i + 1).width = w));

  hoja.getRow(7).values = ["Fecha", "Detalle", "Evento", "Debe", "Haber", "Saldo"];
  encabezado(hoja.getRow(7));
  // El saldo es acumulado: si coincide con el de Planix fila por fila, se deja como fórmula.
  let corrido = 0;
  const acumulado = cuenta.extracto.every((r) => {
    corrido = r2(corrido + r.debe - r.haber);
    return Math.abs(corrido - r.saldo) < 0.005;
  });
  cuenta.extracto.forEach((r, i) => {
    const n = 8 + i;
    const fila = hoja.getRow(n);
    fila.values = [
      r.fecha ? formatoFecha(r.fecha) : "Sin fecha",
      r.detalle,
      r.eventos.join(", "),
      r.debe || null,
      r.haber || null,
      acumulado ? f(i === 0 ? `N(D${n})-N(E${n})` : `F${n - 1}+N(D${n})-N(E${n})`, r.saldo) : r.saldo,
    ];
    for (const c of [4, 5, 6]) fila.getCell(c).numFmt = PESOS;
    if (r.haber) fila.getCell(5).font = { color: { argb: "FF166534" } };
  });
  const fin = 7 + cuenta.extracto.length;
  const filaTotal = hoja.getRow(fin + 1);
  filaTotal.values = [
    "TOTALES",
    null,
    null,
    cuenta.extracto.length ? f(`SUM(D8:D${fin})`, r2(cuenta.extracto.reduce((s, r) => s + r.debe, 0))) : 0,
    cuenta.extracto.length ? f(`SUM(E8:E${fin})`, r2(cuenta.extracto.reduce((s, r) => s + r.haber, 0))) : 0,
    cuenta.saldo,
  ];
  for (const c of [4, 5, 6]) filaTotal.getCell(c).numFmt = PESOS;
  total(filaTotal);
  if (cuenta.extracto.length) hoja.autoFilter = { from: "A7", to: `F${fin}` };

  // Resumen arriba (filas 4 y 5), como las tarjetas de la ficha.
  hoja.getRow(5).values = [cuenta.saldo < 0 ? "Saldo a favor" : debeTexto, null, "Total (con y sin factura)", null, pagadoTexto];
  hoja.getRow(6).values = [cuenta.saldo, null, cuenta.facturado, null, cuenta.pagado];
  for (const c of [1, 3, 5]) {
    hoja.getRow(5).getCell(c).font = { color: { argb: "FF78716C" }, size: 9 };
    hoja.getRow(6).getCell(c).numFmt = PESOS;
    hoja.getRow(6).getCell(c).font = { bold: true, size: 12, color: { argb: c === 1 && cuenta.saldo < 0 ? "FF166534" : "FF1C1917" } };
  }

  // ── Pendientes ──
  const pend = libro.addWorksheet("Pendientes", { views: [{ state: "frozen", ySplit: 1 }] });
  pend.columns = [
    { header: "Fecha", key: "fecha", width: 13 },
    { header: "Comprobante", key: "nombre", width: 50 },
    { header: "Evento", key: "evento", width: 30 },
    { header: "Total", key: "total", width: 17, style: { numFmt: PESOS } },
    { header: "Pagado", key: "pagado", width: 17, style: { numFmt: PESOS } },
    { header: "Pendiente", key: "pendiente", width: 17, style: { numFmt: PESOS } },
  ];
  pend.getRow(1).getCell(5).value = pagadoTexto;
  encabezado(pend.getRow(1));
  const pendientes = cuenta.comprobantes.filter((c) => c.pendiente > 0);
  pendientes.forEach((c, i) => {
    const n = i + 2;
    pend.addRow({
      fecha: c.fecha ? formatoFecha(c.fecha) : "Sin fecha",
      nombre: c.nombre,
      evento: c.evento?.nombre ?? "",
      total: c.total,
      pagado: f(`D${n}-F${n}`, r2(c.total - c.pendiente)),
      pendiente: c.pendiente,
    });
  });
  const finP = pendientes.length + 1;
  total(
    pend.addRow({
      fecha: "TOTAL",
      total: pendientes.length ? f(`SUM(D2:D${finP})`, r2(pendientes.reduce((s, c) => s + c.total, 0))) : 0,
      pagado: pendientes.length ? f(`SUM(E2:E${finP})`, r2(pendientes.reduce((s, c) => s + c.total - c.pendiente, 0))) : 0,
      pendiente: pendientes.length ? f(`SUM(F2:F${finP})`, r2(pendientes.reduce((s, c) => s + c.pendiente, 0))) : 0,
    }),
  );
  if (!pendientes.length) pend.getCell("B2").value = "No hay comprobantes pendientes.";

  return Buffer.from(await libro.xlsx.writeBuffer());
}

/** CUENTA_CORRIENTE_NOMBRE_EMPRESA_FECHA.xlsx */
export function nombreArchivoCuenta(nombre: string, empresa: Empresa, fecha: string) {
  return (
    ["CUENTA_CORRIENTE", nombre, NOMBRE_EMPRESA[empresa], fecha]
      .join("_")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") + ".xlsx"
  );
}
