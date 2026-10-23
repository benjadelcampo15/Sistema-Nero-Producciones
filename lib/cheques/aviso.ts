import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { enviarMail, escaparHtml, mailConfigurado } from "@/lib/mail";
import { formatoFecha, formatoPesos, hoy } from "@/lib/formato";
import { urlBase } from "@/lib/url";
import { DIAS_AVISO, diasEntre, sumarDias, type TipoCheque } from "./tipos";

type ChequeAviso = { id: string; tipo: TipoCheque; monto: number; fecha_pago: string; contraparte: string; banco: string | null; numero: string | null };

/**
 * A quién avisar: CHEQUES_AVISO_PARA (emails separados por coma) si está
 * configurado; si no, los usuarios activos que pueden ver la sección (los admin siempre).
 */
async function destinatarios() {
  const fijos = (process.env.CHEQUES_AVISO_PARA ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  if (fijos.length) return fijos;
  const admin = crearClienteAdmin();
  const [{ data: perfiles }, { data: permisos }] = await Promise.all([
    admin.from("perfiles").select("id, email, es_admin").eq("activo", true),
    admin.from("permisos").select("usuario_id").eq("seccion", "cheques").neq("nivel", "ninguno"),
  ]);
  const conPermiso = new Set((permisos ?? []).map((p) => p.usuario_id));
  return (perfiles ?? []).filter((p) => p.es_admin || conPermiso.has(p.id)).map((p) => p.email);
}

function cuandoVence(dias: number) {
  if (dias < 0) return `venció hace ${-dias} día${dias === -1 ? "" : "s"}`;
  if (dias === 0) return "vence hoy";
  if (dias === 1) return "vence mañana";
  return `vence en ${dias} días`;
}

/**
 * Manda un mail con los cheques pendientes que vencen en DIAS_AVISO días o menos
 * y todavía no se avisaron. Lo corre el cron diario.
 */
export async function avisarChequesPorVencer() {
  if (!mailConfigurado()) throw new Error("El envío por mail no está configurado");
  const admin = crearClienteAdmin();
  const fechaHoy = hoy();
  const { data, error } = await admin
    .from("cheques")
    .select("id, tipo, monto, fecha_pago, contraparte, banco, numero")
    .eq("estado", "pendiente")
    .is("aviso_enviado_en", null)
    .lte("fecha_pago", sumarDias(fechaHoy, DIAS_AVISO))
    .order("fecha_pago");
  if (error) throw new Error(`No se pudieron leer los cheques: ${error.message}`);
  const cheques = (data ?? []) as ChequeAviso[];
  if (!cheques.length) return { cheques: 0, para: [] as string[] };

  const para = await destinatarios();
  if (!para.length) return { cheques: cheques.length, para };

  const base = await urlBase();
  const bloque = (tipo: TipoCheque, titulo: string, explicacion: string) => {
    const lista = cheques.filter((c) => c.tipo === tipo);
    if (!lista.length) return { html: "", texto: "" };
    const filas = lista
      .map((c) => {
        const detalle = [c.banco, c.numero ? `N° ${c.numero}` : null].filter(Boolean).join(" · ");
        return `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e7e5e4">${formatoFecha(c.fecha_pago)}<br><span style="font-size:12px;color:#b91c1c">${cuandoVence(diasEntre(fechaHoy, c.fecha_pago))}</span></td>
          <td style="padding:6px 8px;border-bottom:1px solid #e7e5e4">${escaparHtml(c.contraparte)}${detalle ? `<br><span style="font-size:12px;color:#78716c">${escaparHtml(detalle)}</span>` : ""}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e7e5e4;text-align:right;white-space:nowrap"><b>${formatoPesos(Number(c.monto))}</b></td>
        </tr>`;
      })
      .join("");
    return {
      html: `<h3 style="margin:24px 0 4px">${titulo}</h3>
        <p style="margin:0 0 8px;font-size:13px;color:#57534e">${explicacion}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${filas}</table>
        <p style="margin:12px 0"><a href="${base}/cheques/${tipo}s" style="color:#1c1917">Ver cheques ${tipo}s</a></p>`,
      texto: `${titulo}:\n${lista.map((c) => `- ${formatoFecha(c.fecha_pago)} (${cuandoVence(diasEntre(fechaHoy, c.fecha_pago))}) · ${c.contraparte} · ${formatoPesos(Number(c.monto))}`).join("\n")}\n`,
    };
  };
  const emitidos = bloque("emitido", "Cheques emitidos por debitarse", "Tiene que haber fondos en la cuenta.");
  const recibidos = bloque("recibido", "Cheques recibidos para depositar", "Ya se pueden depositar o están por vencer.");

  await enviarMail({
    para: para.join(", "),
    asunto: `Cheques por vencer: ${cheques.length}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1c1917">
      <p style="font-size:20px;font-weight:900;letter-spacing:6px;margin:0">NERO</p>
      <p style="font-size:11px;letter-spacing:3px;color:#78716c;margin:0 0 16px">PRODUCCIONES</p>
      <p>Hay ${cheques.length} cheque${cheques.length === 1 ? "" : "s"} pendiente${cheques.length === 1 ? "" : "s"} que vence${cheques.length === 1 ? "" : "n"} en los próximos ${DIAS_AVISO} días.</p>
      ${emitidos.html}${recibidos.html}
    </div>`,
    texto: `Cheques por vencer en los próximos ${DIAS_AVISO} días.\n\n${emitidos.texto}\n${recibidos.texto}`,
  });

  await admin
    .from("cheques")
    .update({ aviso_enviado_en: new Date().toISOString() })
    .in("id", cheques.map((c) => c.id));
  return { cheques: cheques.length, para };
}
