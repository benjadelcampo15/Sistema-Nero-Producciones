import "server-only";
import { Agent, request } from "node:https";
import { XMLParser } from "fast-xml-parser";

const lector = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false, // los números quedan como texto (CUIT, CAE, etc.) y se convierten donde hace falta
  trimValues: true,
});

export class ErrorArca extends Error {}

/** Escapa texto para meterlo dentro de un XML. */
export function xml(texto: string | number) {
  return String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Envía un pedido SOAP 1.1 y devuelve el contenido de <Body> ya interpretado. */
export async function enviarSoap(url: string, accion: string, cuerpo: string, espacios = "") {
  const sobre = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"${espacios}><soap:Body>${cuerpo}</soap:Body></soap:Envelope>`;

  let respuesta: { estado: number; texto: string };
  try {
    respuesta = await postear(url, sobre, { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${accion}"` });
  } catch {
    throw new ErrorArca("No se pudo conectar con ARCA (o tardó demasiado). Probá de nuevo en unos minutos.");
  }

  const doc = lector.parse(respuesta.texto);
  const body = doc?.Envelope?.Body;
  if (body?.Fault) {
    throw new ErrorArca(`ARCA: ${body.Fault.faultstring ?? "error desconocido"}`);
  }
  if (respuesta.estado >= 400 || !body) {
    throw new ErrorArca(`ARCA respondió ${respuesta.estado}`);
  }
  return body as Record<string, unknown>;
}

/**
 * Conexión solo para ARCA: su servidor de facturación de producción
 * (servicios1.afip.gov.ar) usa una clave Diffie-Hellman de 1024 bits que
 * Node rechaza por defecto ("dh key too small"). Se baja el nivel de
 * seguridad de OpenSSL únicamente en estas conexiones; el resto de la app no
 * se ve afectado.
 */
const agenteArca = new Agent({ keepAlive: true, ciphers: "DEFAULT@SECLEVEL=1", minVersion: "TLSv1.2" });

function postear(url: string, cuerpo: string, encabezados: Record<string, string>) {
  return new Promise<{ estado: number; texto: string }>((resolver, rechazar) => {
    const pedido = request(
      url,
      { method: "POST", agent: agenteArca, headers: { ...encabezados, "Content-Length": Buffer.byteLength(cuerpo) }, timeout: 60_000 },
      (res) => {
        const partes: Buffer[] = [];
        res.on("data", (p: Buffer) => partes.push(p));
        res.on("end", () => resolver({ estado: res.statusCode ?? 0, texto: Buffer.concat(partes).toString("utf8") }));
        res.on("error", rechazar);
      },
    );
    pedido.on("timeout", () => pedido.destroy(new Error("Tiempo agotado")));
    pedido.on("error", rechazar);
    pedido.end(cuerpo);
  });
}

export function interpretarXml(texto: string) {
  return lector.parse(texto) as Record<string, unknown>;
}

/** Asegura un array (el parser devuelve objeto suelto cuando hay un solo elemento). */
export function lista<T>(valor: T | T[] | undefined | null): T[] {
  if (valor === undefined || valor === null || valor === "") return [];
  return Array.isArray(valor) ? valor : [valor];
}
