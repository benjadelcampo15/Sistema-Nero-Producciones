import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { PLANO_VACIO, esquemaDocumento, type DocumentoPlano } from "./tipos";

/** Versión del plano guardado (para no pisar lo que guardó otra persona). */
export async function versionPlano(): Promise<string | null> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("planos_livings").select("actualizado_en").eq("unico", true).maybeSingle();
  return (data?.actualizado_en as string | undefined) ?? null;
}

/** El plano del jardín (hay uno solo: el jardín es siempre el mismo). */
export async function obtenerPlano(): Promise<DocumentoPlano> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("planos_livings")
    .select("tamano_living, proporcion, proporcion_salon, escenarios, medidas, elementos, zonas, referencia, mozos, livings")
    .eq("unico", true)
    .maybeSingle();
  if (!data) return PLANO_VACIO;
  return esquemaDocumento.parse({ ...data, tamano_living: Number(data.tamano_living), proporcion: Number(data.proporcion), proporcion_salon: Number(data.proporcion_salon) });
}
