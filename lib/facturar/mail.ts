import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { enviarMail, escaparHtml } from "@/lib/mail";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { urlBase } from "@/lib/url";
import { datosEmisor } from "./emisor";
import { nombreTipoCbte, numeroComprobante } from "./tipos";
import { NOMBRE_CLIENTE } from "@/lib/cliente";

/** Manda al cliente el link a su factura y deja registrado a quién y cuándo. Tira error si no se pudo. */
export async function mandarFacturaPorMail(id: string, para: string) {
  const supabase = await crearClienteServidor();
  const { data: c } = await supabase
    .from("comprobantes_emitidos")
    .select("entorno, estado, tipo_cbte, punto_venta, numero, fecha, receptor_nombre, total, token")
    .eq("id", id)
    .maybeSingle();
  if (!c || c.estado !== "emitido" || !c.token) throw new Error("La factura no está emitida");

  const emisor = datosEmisor(c.entorno);
  const url = `${await urlBase()}/p/factura/${c.token}`;
  const titulo = `${nombreTipoCbte(c.tipo_cbte)} ${numeroComprobante(c)}`;
  const prueba = c.entorno === "homologacion";
  const remitente = prueba ? (emisor.nombreFantasia ?? NOMBRE_CLIENTE) : emisor.razonSocial;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1c1917">
  <p style="font-size:20px;font-weight:900;letter-spacing:6px;margin:0">NERO</p>
  <p style="font-size:11px;letter-spacing:3px;color:#78716c;margin:0 0 24px">PRODUCCIONES</p>
  ${prueba ? `<p style="background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px;font-size:13px">Comprobante de PRUEBA, sin validez fiscal.</p>` : ""}
  <p>Hola${c.receptor_nombre ? ` ${escaparHtml(c.receptor_nombre)}` : ""},</p>
  <p>Te enviamos la <b>${escaparHtml(titulo)}</b> del ${formatoFecha(c.fecha)} emitida por ${escaparHtml(remitente)}.</p>
  <p style="font-size:14px;color:#57534e">Total: <b>${formatoPesos(Number(c.total))}</b></p>
  <p style="margin:28px 0"><a href="${url}" style="background:#1c1917;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Ver y descargar la factura</a></p>
  <p style="font-size:12px;color:#a8a29e">Si el botón no funciona, copiá este link: ${url}</p>
</div>`;

  await enviarMail({
    para,
    asunto: `${prueba ? "[PRUEBA] " : ""}${titulo} – ${emisor.nombreFantasia ?? remitente}`,
    html,
    texto: `Te enviamos la ${titulo} del ${formatoFecha(c.fecha)}.\nTotal: ${formatoPesos(Number(c.total))}\nVer y descargar: ${url}`,
  });
  await supabase.from("comprobantes_emitidos").update({ mail_enviado_a: para, mail_enviado_en: new Date().toISOString() }).eq("id", id);
}
