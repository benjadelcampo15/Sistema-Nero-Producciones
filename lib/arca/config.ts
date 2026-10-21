import "server-only";
import { readFileSync } from "node:fs";

export type Entorno = "homologacion" | "produccion";

const URLS: Record<Entorno, { wsaa: string; wsfe: string }> = {
  homologacion: {
    wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  },
  produccion: {
    wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
  },
};

/** Lee un PEM del entorno: contenido directo (ARCA_CERT) o ruta a archivo (ARCA_CERT_PATH). */
function leerPem(variable: "ARCA_CERT" | "ARCA_KEY") {
  const directo = process.env[variable];
  if (directo) return directo.replace(/\\n/g, "\n");
  const ruta = process.env[`${variable}_PATH`];
  if (!ruta) throw new Error(`Falta ${variable} o ${variable}_PATH en las variables de entorno`);
  return readFileSync(ruta, "utf8");
}

export function configuracionArca() {
  const entorno = (process.env.ARCA_ENTORNO ?? "homologacion") as Entorno;
  if (!(entorno in URLS)) throw new Error(`ARCA_ENTORNO inválido: ${entorno}`);
  const cuit = (process.env.ARCA_CUIT ?? "").replace(/\D/g, "");
  if (cuit.length !== 11) throw new Error("Falta ARCA_CUIT (11 dígitos) en las variables de entorno");
  return { entorno, cuit, urls: URLS[entorno], certificado: () => leerPem("ARCA_CERT"), clave: () => leerPem("ARCA_KEY") };
}
