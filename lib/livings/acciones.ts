"use server";

import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esquemaDocumento } from "./tipos";

/** Guarda el plano entero: dibujo del jardín, zonas, mozos y livings. */
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
