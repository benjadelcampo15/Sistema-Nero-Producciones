import "server-only";
import QRCode from "qrcode";
import type { Comprobante } from "./tipos";

/**
 * QR obligatorio de las facturas electrónicas (RG 4892): un link a ARCA con
 * los datos del comprobante en JSON codificado en base64.
 */
export function urlQrArca(c: Comprobante, cuitEmisor: string) {
  const datos = {
    ver: 1,
    fecha: c.fecha,
    cuit: Number(cuitEmisor),
    ptoVta: c.punto_venta,
    tipoCmp: c.tipo_cbte,
    nroCmp: c.numero,
    importe: c.total,
    moneda: "PES",
    ctz: 1,
    tipoDocRec: c.doc_tipo,
    nroDocRec: Number(c.doc_nro) || 0,
    tipoCodAut: "E",
    codAut: Number(c.cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(datos)).toString("base64")}`;
}

export async function qrSvg(url: string) {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 0 });
}
