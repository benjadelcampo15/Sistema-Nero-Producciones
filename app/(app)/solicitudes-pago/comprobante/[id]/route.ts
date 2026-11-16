import { NextResponse } from "next/server";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

/** Abre el comprobante de un pago de una solicitud: verifica permisos y redirige a un link temporal (10 min). */
export async function GET(_request: Request, { params }: RouteContext<"/solicitudes-pago/comprobante/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "pagos", "ver")) return new Response("Sin acceso", { status: 403 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Comprobante no encontrado", { status: 404 });
  // La lectura pasa por RLS: solo Contabilidad o quien hizo la solicitud.
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("solicitudes_pago_pagos").select("comprobante_path").eq("id", id).maybeSingle();
  if (!data?.comprobante_path) return new Response("Comprobante no encontrado", { status: 404 });

  const { data: firmado } = await crearClienteAdmin().storage.from("solicitudes-pago").createSignedUrl(data.comprobante_path, 600);
  if (!firmado?.signedUrl) return new Response("No se pudo abrir el comprobante", { status: 502 });
  return NextResponse.redirect(firmado.signedUrl);
}
