import { NextResponse } from "next/server";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerFactura, urlTemporalArchivo } from "@/lib/facturas/consultas";

/** Abre el archivo original de la factura: verifica permisos y redirige a un link temporal (10 min). */
export async function GET(_request: Request, { params }: RouteContext<"/facturas/[id]/archivo">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturas", "ver")) {
    return new Response("Sin acceso", { status: 403 });
  }

  const { id } = await params;
  // La lectura pasa por RLS: si no puede verla, no existe para él.
  const factura = await obtenerFactura(id);
  if (!factura) return new Response("Factura no encontrada", { status: 404 });

  const url = await urlTemporalArchivo(factura.archivo_path);
  if (!url) return new Response("No se pudo abrir el archivo", { status: 502 });
  return NextResponse.redirect(url);
}
