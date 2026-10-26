"use server";

import { randomUUID } from "node:crypto";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { urlImagen } from "./consultas";
import { esquemaDocumento } from "./tipos";

const TAMANO_MAXIMO = 10 * 1024 * 1024;

/** Tipo real de la imagen por sus primeros bytes (no se confía en la extensión). */
function tipoImagen(d: Buffer): { tipo: string; extension: string } | null {
  if (d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff) return { tipo: "image/jpeg", extension: "jpg" };
  if (d.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { tipo: "image/png", extension: "png" };
  if (d.subarray(0, 4).toString("latin1") === "RIFF" && d.subarray(8, 12).toString("latin1") === "WEBP") return { tipo: "image/webp", extension: "webp" };
  return null;
}

/** Sube (o reemplaza) la imagen del jardín. Devuelve el link para mostrarla. */
export async function subirImagenPlano(formData: FormData): Promise<{ url?: string; error?: string }> {
  await exigirPermiso("livings", "editar");
  const archivo = formData.get("imagen");
  const ancho = Number(formData.get("ancho"));
  const alto = Number(formData.get("alto"));
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elegí una imagen" };
  if (archivo.size > TAMANO_MAXIMO) return { error: "La imagen supera los 10 MB" };
  if (!Number.isInteger(ancho) || !Number.isInteger(alto) || ancho < 1 || alto < 1 || ancho > 20000 || alto > 20000) {
    return { error: "No se pudo leer el tamaño de la imagen" };
  }
  const datos = Buffer.from(await archivo.arrayBuffer());
  const tipo = tipoImagen(datos);
  if (!tipo) return { error: "Formato no soportado: subí una imagen JPG, PNG o WEBP" };

  const supabase = await crearClienteServidor();
  const { data: anterior } = await supabase.from("planos_livings").select("id, imagen_path").eq("unico", true).maybeSingle();

  const path = `jardin/${randomUUID()}.${tipo.extension}`;
  const admin = crearClienteAdmin();
  const { error: errorSubida } = await admin.storage.from("planos").upload(path, datos, { contentType: tipo.tipo });
  if (errorSubida) return { error: "No se pudo guardar la imagen" };

  const cambios = { imagen_path: path, imagen_ancho: ancho, imagen_alto: alto };
  const { error } = anterior
    ? await supabase.from("planos_livings").update(cambios).eq("id", anterior.id)
    : await supabase.from("planos_livings").insert(cambios);
  if (error) {
    await admin.storage.from("planos").remove([path]);
    return { error: "No se pudo guardar el plano" };
  }
  if (anterior?.imagen_path) await admin.storage.from("planos").remove([anterior.imagen_path]);
  return { url: (await urlImagen(path)) ?? undefined };
}

/** Guarda zonas, referencia, mozos y livings (el plano entero). */
export async function guardarPlano(documento: unknown): Promise<{ error?: string }> {
  await exigirPermiso("livings", "editar");
  const datos = esquemaDocumento.safeParse(documento);
  if (!datos.success) return { error: "Datos del plano inválidos" };

  const supabase = await crearClienteServidor();
  const { data: existente } = await supabase.from("planos_livings").select("id").eq("unico", true).maybeSingle();
  const { error } = existente
    ? await supabase.from("planos_livings").update(datos.data).eq("id", existente.id)
    : await supabase.from("planos_livings").insert(datos.data);
  return error ? { error: "No se pudo guardar el plano" } : {};
}
