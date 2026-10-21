import "server-only";
import nodemailer from "nodemailer";

/**
 * Envío de mails por SMTP (por ejemplo, Gmail con una contraseña de aplicación).
 * Variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM.
 */
export function mailConfigurado() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function enviarMail(mensaje: { para: string; asunto: string; html: string; texto: string; responderA?: string }) {
  if (!mailConfigurado()) throw new Error("El envío de mails no está configurado (faltan las variables SMTP_*)");
  const puerto = Number(process.env.SMTP_PORT ?? 465);
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: puerto,
    secure: puerto === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporte.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: mensaje.para,
    replyTo: mensaje.responderA,
    subject: mensaje.asunto,
    html: mensaje.html,
    text: mensaje.texto,
  });
}

export function escaparHtml(texto: string) {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
