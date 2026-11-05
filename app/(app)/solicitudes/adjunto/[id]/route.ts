import { obtenerUsuario } from "@/lib/auth/sesion";
import { centralConfigurada } from "@/lib/solicitudes/central";
import { urlAdjunto } from "@/lib/solicitudes/consultas";

/** Abre un adjunto (link temporal), si el usuario lo puede ver: de su empresa y no interno, o del equipo. */
export async function GET(_request: Request, { params }: RouteContext<"/solicitudes/adjunto/[id]">) {
  if (!centralConfigurada()) return new Response("No configurado", { status: 404 });
  const usuario = await obtenerUsuario();
  const url = await urlAdjunto(usuario, (await params).id);
  if (!url) return new Response("Adjunto no encontrado", { status: 404 });
  return Response.redirect(url, 302);
}
