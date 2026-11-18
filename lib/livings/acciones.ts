"use server";

import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esquemaDocumento } from "./tipos";
import { guardarConVersion, type Version } from "@/lib/version";

/** Guarda el plano entero: dibujo del jardín, zonas, mozos y livings. */
export async function guardarPlano(documento: unknown, version?: Version, forzar = false): Promise<{ error?: string; conflicto?: boolean; version?: Version }> {
  await exigirPermiso("livings", "editar");
  const datos = esquemaDocumento.safeParse(documento);
  if (!datos.success) return { error: "Datos del plano inválidos" };

  const supabase = await crearClienteServidor();
  // Si otra persona guardó el plano mientras se editaba, no se pisa: se avisa.
  const g = await guardarConVersion(supabase, "planos_livings", { unico: true }, datos.data, version, forzar);
  if (g.conflicto) return { conflicto: true, error: "Otra persona guardó cambios en el plano mientras editabas" };
  return g.error ? { error: "No se pudo guardar el plano" } : { version: g.version };
}
