import "server-only";
import { configuracionArca, type Entorno } from "@/lib/arca/config";
import { NOMBRE_CLIENTE } from "@/lib/cliente";

export type DatosEmisor = {
  razonSocial: string;
  nombreFantasia: string | null;
  cuit: string;
  domicilio: string | null;
  condicionIva: string;
  ingresosBrutos: string | null;
  inicioActividades: string | null;
};

/**
 * Datos impresos en el encabezado de la factura. Producción: EMISOR_* (los
 * de la empresa que factura). Pruebas: se aclara que es un comprobante de prueba.
 */
export function datosEmisor(entorno: Entorno): DatosEmisor {
  const cuit = configuracionArca(entorno).cuit;
  if (entorno === "homologacion") {
    return {
      razonSocial: "COMPROBANTE DE PRUEBA",
      nombreFantasia: NOMBRE_CLIENTE,
      cuit,
      domicilio: null,
      condicionIva: "IVA Responsable Inscripto",
      ingresosBrutos: null,
      inicioActividades: null,
    };
  }
  return {
    razonSocial: process.env.EMISOR_RAZON_SOCIAL ?? "IDEAS CON DESTINO SRL",
    nombreFantasia: process.env.EMISOR_NOMBRE_FANTASIA ?? NOMBRE_CLIENTE,
    cuit,
    domicilio: process.env.EMISOR_DOMICILIO ?? null,
    condicionIva: process.env.EMISOR_CONDICION_IVA ?? "IVA Responsable Inscripto",
    ingresosBrutos: process.env.EMISOR_IIBB ?? null,
    inicioActividades: process.env.EMISOR_INICIO_ACTIVIDADES ?? null,
  };
}

export function formatoCuit(cuit: string) {
  const d = cuit.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : cuit;
}
