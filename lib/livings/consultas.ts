import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { esquemaDocumento, type Plano } from "./tipos";

/** El plano del jardín (hay uno solo: el jardín es siempre el mismo). */
export async function obtenerPlano(): Promise<Plano> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("planos_livings")
    .select("imagen_path, imagen_ancho, imagen_alto, tamano_living, zonas, referencia, mozos, livings")
    .eq("unico", true)
    .maybeSingle();
  if (!data) {
    return { imagen_url: null, imagen_ancho: null, imagen_alto: null, tamano_living: 0.04, zonas: [], referencia: null, mozos: [], livings: [] };
  }
  const documento = esquemaDocumento.parse({ ...data, tamano_living: Number(data.tamano_living) });
  return {
    ...documento,
    imagen_url: data.imagen_path ? await urlImagen(data.imagen_path) : null,
    imagen_ancho: data.imagen_ancho,
    imagen_alto: data.imagen_alto,
  };
}

/** Link temporal (2 horas) a la imagen del plano: alcanza para una sesión de armado. */
export async function urlImagen(path: string) {
  const { data } = await crearClienteAdmin().storage.from("planos").createSignedUrl(path, 7200);
  return data?.signedUrl ?? null;
}
