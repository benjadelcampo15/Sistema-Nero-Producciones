import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { enviarMail, escaparHtml, mailConfigurado } from "@/lib/mail";

/**
 * Manda por correo las notificaciones pendientes (las marca la base según las
 * preferencias de cada usuario). Cada notificación se manda una sola vez: se
 * marca antes de enviar, así dos ejecuciones al mismo tiempo no la repiten.
 */
export async function enviarCorreosPendientes(limite = 40, urlBase?: string) {
  if (!mailConfigurado()) return { enviados: 0, motivo: "sin SMTP" };
  const admin = crearClienteAdmin();
  const { data: pendientes } = await admin
    .from("notificaciones")
    .select("id, usuario_id, titulo, detalle, href")
    .eq("correo_pendiente", true)
    .order("creado_en")
    .limit(limite);
  if (!pendientes?.length) return { enviados: 0 };
  // Se toman (si otra ejecución ya las tomó, no vuelven).
  const { data: tomadas } = await admin
    .from("notificaciones")
    .update({ correo_pendiente: false, correo_enviado_en: new Date().toISOString() })
    .in("id", pendientes.map((p) => p.id))
    .eq("correo_pendiente", true)
    .select("id");
  const ids = new Set((tomadas ?? []).map((t) => t.id));
  const { data: perfiles } = await admin.from("perfiles").select("id, email, activo").in("id", [...new Set(pendientes.map((p) => p.usuario_id))]);
  const correo = new Map((perfiles ?? []).filter((p) => p.activo).map((p) => [p.id, p.email as string]));
  const base = (urlBase ?? process.env.APP_URL ?? "").replace(/\/$/, "");
  let enviados = 0;
  for (const n of pendientes) {
    const para = correo.get(n.usuario_id);
    if (!ids.has(n.id) || !para) continue;
    const link = n.href && base ? `${base}${n.href}` : null;
    try {
      await enviarMail({
        para,
        asunto: `Planix · ${n.titulo}`,
        texto: [n.titulo, n.detalle, link].filter(Boolean).join("\n\n"),
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c1917">
          <p style="font-size:16px;font-weight:bold">${escaparHtml(n.titulo)}</p>
          ${n.detalle ? `<p>${escaparHtml(n.detalle)}</p>` : ""}
          ${link ? `<p><a href="${escaparHtml(link)}" style="background:#1c1917;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Abrir en Planix</a></p>` : ""}
          <p style="color:#78716c;font-size:12px">Podés elegir qué avisos te llegan por correo en Planix → Notificaciones.</p>
        </div>`,
      });
      enviados++;
    } catch {
      // Si falla el envío, queda para el próximo intento.
      await admin.from("notificaciones").update({ correo_pendiente: true, correo_enviado_en: null }).eq("id", n.id);
    }
  }
  return { enviados };
}
