import "server-only";
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

  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${accion}"` },
      body: sobre,
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new ErrorArca("No se pudo conectar con ARCA (o tardó demasiado). Probá de nuevo en unos minutos.");
  }

  const texto = await respuesta.text();
  const doc = lector.parse(texto);
  const body = doc?.Envelope?.Body;
  if (body?.Fault) {
    throw new ErrorArca(`ARCA: ${body.Fault.faultstring ?? "error desconocido"}`);
  }
  if (!respuesta.ok || !body) {
    throw new ErrorArca(`ARCA respondió ${respuesta.status}`);
  }
  return body as Record<string, unknown>;
}

export function interpretarXml(texto: string) {
  return lector.parse(texto) as Record<string, unknown>;
}

/** Asegura un array (el parser devuelve objeto suelto cuando hay un solo elemento). */
export function lista<T>(valor: T | T[] | undefined | null): T[] {
  if (valor === undefined || valor === null || valor === "") return [];
  return Array.isArray(valor) ? valor : [valor];
}
