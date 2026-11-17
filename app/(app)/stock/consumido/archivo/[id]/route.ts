import { NextResponse } from "next/server";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

/** Descarga el Excel original de una importación de FUDO (link temporal de 10 minutos). */
export async function GET(_request: Request, { params }: RouteContext<"/stock/consumido/archivo/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return new Response("Sin acceso", { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("No encontrado", { status: 404 });
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("fudo_importaciones").select("archivo, nombre_archivo").eq("id", id).maybeSingle();
  if (!data?.archivo) return new Response("El archivo original no está guardado", { status: 404 });
  const { data: firmado } = await crearClienteAdmin().storage.from("fudo").createSignedUrl(data.archivo, 600, { download: data.nombre_archivo });
  if (!firmado?.signedUrl) return new Response("No se pudo abrir el archivo", { status: 502 });
  return NextResponse.redirect(firmado.signedUrl);
}
