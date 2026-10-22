import "server-only";
import { configuracionArca, type Entorno } from "./config";
import { ErrorArca, enviarSoap, lista, xml } from "./soap";
import { obtenerAcceso } from "./wsaa";

const ESPACIO = "http://ar.gov.afip.dif.FEV1/";

type Mensaje = { Code: string; Msg: string };
export type MensajeArca = { codigo: string; mensaje: string };

const aMensajes = (valor: unknown): MensajeArca[] =>
  lista(valor as Mensaje | Mensaje[]).map((m) => ({ codigo: String(m.Code), mensaje: String(m.Msg) }));

/** Llama un método del WSFEv1 con la autenticación incluida. */
async function llamar(entorno: Entorno, metodo: string, parametros = "") {
  const { cuit, urls } = configuracionArca(entorno);
  const { token, sign } = await obtenerAcceso("wsfe", entorno);
  const body = await enviarSoap(
    urls.wsfe,
    `${ESPACIO}${metodo}`,
    `<ar:${metodo}><ar:Auth><ar:Token>${xml(token)}</ar:Token><ar:Sign>${xml(sign)}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>${parametros}</ar:${metodo}>`,
    ` xmlns:ar="${ESPACIO}"`,
  );
  const resultado = (body[`${metodo}Response`] as Record<string, unknown> | undefined)?.[`${metodo}Result`] as
    | Record<string, unknown>
    | undefined;
  if (!resultado) throw new ErrorArca(`ARCA no devolvió respuesta para ${metodo}`);
  return resultado;
}

function exigirSinErrores(resultado: Record<string, unknown>) {
  const errores = aMensajes((resultado.Errors as { Err?: unknown } | undefined)?.Err);
  if (errores.length) throw new ErrorArca(errores.map((e) => `${e.codigo}: ${e.mensaje}`).join(" · "));
}

/** Prueba de conexión sin autenticación. */
export async function estadoServidores(entorno: Entorno) {
  const { urls } = configuracionArca(entorno);
  const body = await enviarSoap(urls.wsfe, `${ESPACIO}FEDummy`, "<ar:FEDummy/>", ` xmlns:ar="${ESPACIO}"`);
  return (body.FEDummyResponse as { FEDummyResult: Record<string, string> }).FEDummyResult;
}

export async function ultimoAutorizado(entorno: Entorno, puntoVenta: number, tipoCbte: number) {
  const r = await llamar(entorno, "FECompUltimoAutorizado", `<ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${tipoCbte}</ar:CbteTipo>`);
  exigirSinErrores(r);
  return Number(r.CbteNro ?? 0);
}

export async function condicionesIvaReceptor(entorno: Entorno, claseCmp?: "A" | "B" | "C") {
  const r = await llamar(entorno, "FEParamGetCondicionIvaReceptor", claseCmp ? `<ar:ClaseCmp>${claseCmp}</ar:ClaseCmp>` : "");
  exigirSinErrores(r);
  type Cond = { Id: string; Desc: string; Cmp_Clase: string };
  return lista((r.ResultGet as { CondicionIvaReceptor?: Cond | Cond[] } | undefined)?.CondicionIvaReceptor).map((c) => ({
    id: Number(c.Id),
    descripcion: c.Desc,
    clases: c.Cmp_Clase,
  }));
}

export async function puntosDeVenta(entorno: Entorno) {
  const r = await llamar(entorno, "FEParamGetPtosVenta");
  type Pto = { Nro: string; EmisionTipo: string; Bloqueado: string; FchBaja: string };
  // En homologación suele no haber puntos de venta dados de alta: ARCA lo informa como error 602.
  const errores = aMensajes((r.Errors as { Err?: unknown } | undefined)?.Err);
  if (errores.some((e) => e.codigo !== "602")) exigirSinErrores(r);
  return lista((r.ResultGet as { PtoVenta?: Pto | Pto[] } | undefined)?.PtoVenta).map((p) => ({
    numero: Number(p.Nro),
    tipo: p.EmisionTipo,
    bloqueado: p.Bloqueado === "S",
    baja: p.FchBaja && p.FchBaja !== "NULL" ? p.FchBaja : null,
  }));
}

export type Alicuota = { id: number; base: number; importe: number };

export type PedidoCae = {
  puntoVenta: number;
  tipoCbte: number;
  numero: number;
  concepto: 1 | 2 | 3;
  docTipo: number;
  docNro: string;
  fecha: string; // YYYY-MM-DD
  neto: number;
  iva: number;
  total: number;
  alicuotas: Alicuota[];
  condicionIvaReceptor: number;
  fechaServicioDesde?: string;
  fechaServicioHasta?: string;
  fechaVtoPago?: string;
};

export type RespuestaCae = {
  aprobado: boolean;
  cae: string | null;
  caeVto: string | null;
  observaciones: MensajeArca[];
  errores: MensajeArca[];
};

const aFechaArca = (iso: string) => iso.replace(/-/g, "");
const deFechaArca = (f: string) => (/^\d{8}$/.test(f) ? `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}` : null);
const importe = (n: number) => n.toFixed(2);

/** Pide el CAE de un comprobante. El orden de los campos es el del WSDL (obligatorio). */
export async function solicitarCae(entorno: Entorno, p: PedidoCae): Promise<RespuestaCae> {
  const servicios = p.concepto !== 1;
  const iva = p.alicuotas.length
    ? `<ar:Iva>${p.alicuotas
        .map((a) => `<ar:AlicIva><ar:Id>${a.id}</ar:Id><ar:BaseImp>${importe(a.base)}</ar:BaseImp><ar:Importe>${importe(a.importe)}</ar:Importe></ar:AlicIva>`)
        .join("")}</ar:Iva>`
    : "";

  const detalle =
    `<ar:Concepto>${p.concepto}</ar:Concepto>` +
    `<ar:DocTipo>${p.docTipo}</ar:DocTipo>` +
    `<ar:DocNro>${xml(p.docNro)}</ar:DocNro>` +
    `<ar:CbteDesde>${p.numero}</ar:CbteDesde>` +
    `<ar:CbteHasta>${p.numero}</ar:CbteHasta>` +
    `<ar:CbteFch>${aFechaArca(p.fecha)}</ar:CbteFch>` +
    `<ar:ImpTotal>${importe(p.total)}</ar:ImpTotal>` +
    `<ar:ImpTotConc>0.00</ar:ImpTotConc>` +
    `<ar:ImpNeto>${importe(p.neto)}</ar:ImpNeto>` +
    `<ar:ImpOpEx>0.00</ar:ImpOpEx>` +
    `<ar:ImpTrib>0.00</ar:ImpTrib>` +
    `<ar:ImpIVA>${importe(p.iva)}</ar:ImpIVA>` +
    (servicios
      ? `<ar:FchServDesde>${aFechaArca(p.fechaServicioDesde!)}</ar:FchServDesde>` +
        `<ar:FchServHasta>${aFechaArca(p.fechaServicioHasta!)}</ar:FchServHasta>` +
        `<ar:FchVtoPago>${aFechaArca(p.fechaVtoPago!)}</ar:FchVtoPago>`
      : "") +
    `<ar:MonId>PES</ar:MonId>` +
    `<ar:MonCotiz>1</ar:MonCotiz>` +
    `<ar:CondicionIVAReceptorId>${p.condicionIvaReceptor}</ar:CondicionIVAReceptorId>` +
    iva;

  const r = await llamar(
    entorno,
    "FECAESolicitar",
    `<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${p.puntoVenta}</ar:PtoVta><ar:CbteTipo>${p.tipoCbte}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest>${detalle}</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`,
  );

  const errores = aMensajes((r.Errors as { Err?: unknown } | undefined)?.Err);
  type Det = { Resultado: string; CAE?: string; CAEFchVto?: string; Observaciones?: { Obs?: unknown } };
  const det = lista((r.FeDetResp as { FECAEDetResponse?: Det | Det[] } | undefined)?.FECAEDetResponse)[0];
  const aprobado = det?.Resultado === "A";
  return {
    aprobado,
    cae: aprobado && det?.CAE ? String(det.CAE) : null,
    caeVto: aprobado && det?.CAEFchVto ? deFechaArca(String(det.CAEFchVto)) : null,
    observaciones: aMensajes(det?.Observaciones?.Obs),
    errores,
  };
}
