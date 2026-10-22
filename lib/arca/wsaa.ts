import "server-only";
import forge from "node-forge";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { configuracionArca, type Entorno } from "./config";
import { ErrorArca, enviarSoap, interpretarXml } from "./soap";

export type Acceso = { token: string; sign: string };

/** Margen para no usar un acceso que está por vencer. */
const MARGEN_MS = 10 * 60 * 1000;

/**
 * Acceso (token + sign) al servicio de ARCA, válido ~12 h. Se guarda en la base:
 * ARCA no entrega uno nuevo mientras el anterior siga vigente.
 */
export async function obtenerAcceso(servicio: string, entorno: Entorno): Promise<Acceso> {
  const admin = crearClienteAdmin();

  const { data: guardado } = await admin
    .from("arca_accesos")
    .select("token, sign, expira")
    .eq("servicio", servicio)
    .eq("entorno", entorno)
    .maybeSingle();
  if (guardado && new Date(guardado.expira).getTime() - Date.now() > MARGEN_MS) {
    return { token: guardado.token, sign: guardado.sign };
  }

  const nuevo = await pedirAcceso(servicio, entorno);
  const { error } = await admin
    .from("arca_accesos")
    .upsert({ servicio, entorno, token: nuevo.token, sign: nuevo.sign, expira: nuevo.expira });
  if (error) throw new Error(`No se pudo guardar el acceso de ARCA: ${error.message}`);
  return { token: nuevo.token, sign: nuevo.sign };
}

/** Ticket de pedido de acceso (TRA) firmado en formato CMS, como pide el WSAA. */
function firmarPedido(servicio: string, certificadoPem: string, clavePem: string) {
  const ahora = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  const tra = `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(ahora / 1000)}</uniqueId><generationTime>${iso(ahora - 10 * 60 * 1000)}</generationTime><expirationTime>${iso(ahora + 10 * 60 * 1000)}</expirationTime></header><service>${servicio}</service></loginTicketRequest>`;

  const certificado = forge.pki.certificateFromPem(certificadoPem);
  const clave = forge.pki.privateKeyFromPem(clavePem);
  const cms = forge.pkcs7.createSignedData();
  cms.content = forge.util.createBuffer(tra, "utf8");
  cms.addCertificate(certificado);
  cms.addSigner({
    key: clave,
    certificate: certificado,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date(ahora) as unknown as string },
    ],
  });
  cms.sign();
  return forge.util.encode64(forge.asn1.toDer(cms.toAsn1()).getBytes());
}

async function pedirAcceso(servicio: string, entorno: Entorno) {
  const config = configuracionArca(entorno);
  const cms = firmarPedido(servicio, config.certificado(), config.clave());

  const body = await enviarSoap(
    config.urls.wsaa,
    "",
    `<wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms>`,
    ' xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"',
  ).catch((e) => {
    if (e instanceof ErrorArca && e.message.includes("ya posee un TA valido")) {
      throw new ErrorArca(
        "ARCA ya entregó un acceso que sigue vigente y no se guardó. Hay que esperar a que venza (hasta 12 h) o pedirlo desde otro certificado.",
      );
    }
    throw e;
  });

  const respuesta = (body.loginCmsResponse as { loginCmsReturn?: string } | undefined)?.loginCmsReturn;
  if (!respuesta) throw new ErrorArca("ARCA no devolvió el acceso");
  const ticket = interpretarXml(respuesta).loginTicketResponse as {
    header: { expirationTime: string };
    credentials: { token: string; sign: string };
  };
  return { token: ticket.credentials.token, sign: ticket.credentials.sign, expira: ticket.header.expirationTime };
}
