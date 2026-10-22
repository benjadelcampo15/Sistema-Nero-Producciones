import "server-only";
import { headers } from "next/headers";

/** Dirección pública de la app (para links que se mandan a clientes). APP_URL o la del pedido actual. */
export async function urlBase() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}
