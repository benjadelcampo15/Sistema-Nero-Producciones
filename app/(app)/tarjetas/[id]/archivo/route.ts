import { NextResponse } from "next/server";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

/** Abre el archivo original del resumen de la tarjeta: verifica permisos y redirige a un link temporal (10 min). */
export async function GET(_request: Request, { params }: RouteContext<"/tarjetas/[id]/archivo">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return new Response("Sin acceso", { status: 403 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Resumen no encontrado", { status: 404 });
  // La lectura pasa por RLS: si no puede verlo, no existe para él.
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("tarjeta_resumenes").select("archivo_path").eq("id", id).maybeSingle();
  if (!data?.archivo_path) return new Response("Resumen no encontrado", { status: 404 });

  const { data: firmado } = await crearClienteAdmin().storage.from("tarjetas").createSignedUrl(data.archivo_path, 600);
  if (!firmado?.signedUrl) return new Response("No se pudo abrir el archivo", { status: 502 });
  return NextResponse.redirect(firmado.signedUrl);
}
