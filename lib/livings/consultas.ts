import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { PLANO_VACIO, esquemaDocumento, type DocumentoPlano } from "./tipos";

/** El plano del jardín (hay uno solo: el jardín es siempre el mismo). */
export async function obtenerPlano(): Promise<DocumentoPlano> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("planos_livings")
    .select("tamano_living, proporcion, elementos, zonas, referencia, mozos, livings")
    .eq("unico", true)
    .maybeSingle();
  if (!data) return PLANO_VACIO;
  return esquemaDocumento.parse({ ...data, tamano_living: Number(data.tamano_living), proporcion: Number(data.proporcion) });
}
