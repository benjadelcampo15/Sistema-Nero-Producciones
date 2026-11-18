import "server-only";
import type { crearClienteServidor } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof crearClienteServidor>>;

/** Versión de un documento: su fecha de última modificación (null si todavía no existe). */
export type Version = string | null;

export const MENSAJE_CONFLICTO =
  "Otra persona guardó cambios acá mientras editabas. Tocá «Ver su versión» para traer los datos nuevos (tus cambios sin guardar se pierden) o «Guardar igual» para reemplazarlos con los tuyos.";

/**
 * Guarda un documento entero (planilla, plano, mes de objetivos…) solo si nadie
 * lo cambió desde que se abrió (`version`). Si otro lo guardó antes, devuelve
 * `conflicto` en lugar de pisarlo en silencio. Con `forzar`, reemplaza igual
 * (el usuario lo pidió). Sin `version` (undefined) guarda como siempre.
 */
export async function guardarConVersion(
  supabase: Supabase,
  tabla: string,
  claves: Record<string, string | number | boolean>,
  datos: Record<string, unknown>,
  version: Version | undefined,
  forzar = false,
): Promise<{ error?: string; conflicto?: boolean; version?: Version }> {
  const fila = { ...claves, ...datos };
  if (version === undefined || forzar) {
    const { data, error } = await supabase.from(tabla).upsert(fila, { onConflict: Object.keys(claves).join(",") }).select("actualizado_en");
    return error ? { error: error.message } : { version: (data?.[0]?.actualizado_en as string | undefined) ?? null };
  }
  if (version === null) {
    const { data, error } = await supabase.from(tabla).insert(fila).select("actualizado_en");
    if (error) return error.code === "23505" ? { conflicto: true } : { error: error.message };
    return { version: (data?.[0]?.actualizado_en as string | undefined) ?? null };
  }
  const { data, error } = await supabase.from(tabla).update(datos).match(claves).eq("actualizado_en", version).select("actualizado_en");
  if (error) return { error: error.message };
  if (data?.length) return { version: data[0].actualizado_en as string };
  // No se actualizó: o cambió la versión (conflicto) o la fila ya no existe.
  const { data: actual } = await supabase.from(tabla).select("actualizado_en").match(claves).maybeSingle();
  if (actual) return { conflicto: true };
  const { data: nueva, error: errorAlta } = await supabase.from(tabla).insert(fila).select("actualizado_en");
  return errorAlta ? { error: errorAlta.message } : { version: (nueva?.[0]?.actualizado_en as string | undefined) ?? null };
}

/** La versión actual de un documento (para mandarla a la pantalla junto con los datos). */
export async function versionDe(supabase: Supabase, tabla: string, claves: Record<string, string | number | boolean>): Promise<Version> {
  const { data } = await supabase.from(tabla).select("actualizado_en").match(claves).maybeSingle();
  return (data?.actualizado_en as string | undefined) ?? null;
}
