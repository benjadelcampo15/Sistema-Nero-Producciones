import "server-only";
import { existsSync, readFileSync } from "node:fs";

/** homologacion: pruebas sin validez fiscal · produccion: facturas reales. */
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

/**
 * Variables por entorno (cada uno con su CUIT y su certificado):
 *   pruebas:     ARCA_CUIT,       ARCA_CERT(_PATH),       ARCA_KEY(_PATH)
 *   producción:  ARCA_PROD_CUIT,  ARCA_PROD_CERT(_PATH),  ARCA_PROD_KEY(_PATH),  ARCA_PROD_PUNTO_VENTA
 * El PEM puede venir directo (con saltos de línea como \n) o como ruta a un archivo.
 */
const PREFIJO: Record<Entorno, string> = { homologacion: "ARCA", produccion: "ARCA_PROD" };

function leerPem(nombre: string) {
  const directo = process.env[nombre];
  if (directo) return directo.replace(/\\n/g, "\n");
  const ruta = process.env[`${nombre}_PATH`];
  if (!ruta) throw new Error(`Falta ${nombre} o ${nombre}_PATH en las variables de entorno`);
  return readFileSync(ruta, "utf8");
}

export function entornoConfigurado(entorno: Entorno) {
  const p = PREFIJO[entorno];
  const cuit = (process.env[`${p}_CUIT`] ?? "").replace(/\D/g, "");
  // Contenido directo, o una ruta a un archivo que exista.
  const tiene = (n: string) => {
    if (process.env[n]) return true;
    const ruta = process.env[`${n}_PATH`];
    return Boolean(ruta && existsSync(ruta));
  };
  return cuit.length === 11 && tiene(`${p}_CERT`) && tiene(`${p}_KEY`);
}

export function configuracionArca(entorno: Entorno) {
  const p = PREFIJO[entorno];
  const cuit = (process.env[`${p}_CUIT`] ?? "").replace(/\D/g, "");
  if (cuit.length !== 11) {
    throw new Error(
      entorno === "produccion"
        ? "La facturación real todavía no está configurada (falta el certificado de producción)"
        : "Falta ARCA_CUIT (11 dígitos) en las variables de entorno",
    );
  }
  return {
    entorno,
    cuit,
    urls: URLS[entorno],
    certificado: () => leerPem(`${p}_CERT`),
    clave: () => leerPem(`${p}_KEY`),
    puntoVentaSugerido: Number(process.env[`${p}_PUNTO_VENTA`] ?? (entorno === "produccion" ? 0 : 1)) || null,
  };
}
