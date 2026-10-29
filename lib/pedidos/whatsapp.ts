import { formatoFecha } from "@/lib/formato";
import type { Pedido } from "./tipos";

/** Link de la página del proveedor, abierto en ese pedido (para confirmarlo). */
export const linkProveedor = (urlBase: string, p: Pick<Pedido, "numero" | "proveedor">) => `${urlBase}/p/proveedor/${p.proveedor.token}#pedido-${p.numero}`;

/** Link directo al PDF del pedido (se abre sin usuario). */
export const linkPdf = (urlBase: string, p: Pick<Pedido, "numero" | "proveedor">) => `${urlBase}/p/proveedor/${p.proveedor.token}/pedido/${p.numero}/pdf`;

/** Mensaje corto que acompaña el pedido; con `pdf` (cuando no va el archivo adjunto) suma el link al PDF. */
export function textoPedido(p: Pedido, links: { pdf?: string } = {}) {
  const entrega = `${p.deposito.nombre}${p.fecha_entrega ? ` el ${formatoFecha(p.fecha_entrega)}` : ""}`;
  return [`Hola! Te paso el pedido N° ${p.numero} de Nero Producciones (entrega en ${entrega}).`, ...(links.pdf ? [`PDF: ${links.pdf}`] : [])].join("\n");
}
/** Cómo se carga el WhatsApp de un proveedor (se muestra en los formularios). */
export const AYUDA_WHATSAPP = "Código de área sin el 0 + número sin el 15, todo junto: 10 números. Ej.: 2615551234 (Mendoza) o 1155551234 (Buenos Aires).";

/**
 * Número argentino de 10 cifras (área sin 0 + número sin 15) a partir de lo que
 * se escribió; acepta también +54 / +54 9 adelante. null si no queda en 10 cifras.
 */
export function whatsappNacional(telefono: string | null | undefined) {
  let n = (telefono ?? "").replace(/\D/g, "");
  if (n.startsWith("549") && n.length === 13) n = n.slice(3);
  else if (n.startsWith("54") && n.length === 12) n = n.slice(2);
  if (n.startsWith("0")) n = n.slice(1);
  return /^\d{10}$/.test(n) ? n : null;
}

/** Link de WhatsApp al número del proveedor (+54 9 …) con el mensaje escrito (null si el número no es válido). */
export function urlWhatsApp(telefono: string | null, texto: string) {
  const numero = whatsappNacional(telefono);
  return numero ? `https://wa.me/549${numero}?text=${encodeURIComponent(texto)}` : null;
}
