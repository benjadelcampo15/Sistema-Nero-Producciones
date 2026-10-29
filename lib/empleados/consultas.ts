import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import type { DatosPersona, EstadoSeguro, Persona, Puesto } from "./tipos";

const CAMPOS = "id, nombre, apellido, dni, cuil, fecha_nacimiento, telefono, email, domicilio, contacto_emergencia, alias_cbu, notas";

export async function listarPersonal() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("personal").select(CAMPOS).order("apellido").order("nombre").limit(3000);
  if (error) throw new Error(`No se pudo leer el personal: ${error.message}`);
  return (data ?? []) as Persona[];
}

/** Lo enviado por el formulario por personas que ya estaban cargadas: para revisar. */
export async function enviosParaRevisar() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("personal_envios")
    .select("id, datos, creado_en, persona:personal(" + CAMPOS + ")")
    .eq("estado", "cambios")
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron leer los envíos: ${error.message}`);
  return (data ?? []) as unknown as { id: string; datos: DatosPersona; creado_en: string; persona: Persona | null }[];
}

export async function obtenerFormulario() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("formulario_personal").select("token, abierto").eq("unico", true).maybeSingle();
  return data;
}

/** El formulario público, buscado por token con la clave secreta (sin sesión). */
export async function formularioPublico(token: string) {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  const { data } = await crearClienteAdmin().from("formulario_personal").select("token, abierto").eq("token", token).maybeSingle();
  return data;
}

export type Convocado = { id: string; puesto_id: string | null; seguro: EstadoSeguro; poliza_id: string | null; persona: Persona };
export type Poliza = {
  id: string;
  aseguradora: string;
  numero: string | null;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
  archivo_path: string | null;
};

export async function eventosConSeguros() {
  const supabase = await crearClienteServidor();
  const [{ data: eventos }, { data: convocados }] = await Promise.all([
    supabase.from("eventos").select("id, nombre, fecha").neq("estado", "cancelado").order("fecha", { ascending: false }).limit(300),
    supabase.from("convocados").select("evento_id, seguro").limit(10000),
  ]);
  const cuenta = new Map<string, { total: number; cubiertos: number }>();
  for (const c of convocados ?? []) {
    const actual = cuenta.get(c.evento_id) ?? { total: 0, cubiertos: 0 };
    actual.total++;
    if (c.seguro === "cubierto") actual.cubiertos++;
    cuenta.set(c.evento_id, actual);
  }
  return (eventos ?? []).map((e) => ({ ...e, ...(cuenta.get(e.id) ?? { total: 0, cubiertos: 0 }) }));
}

export async function segurosDeEvento(eventoId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(eventoId)) return null;
  const supabase = await crearClienteServidor();
  const [{ data: evento }, { data: convocados }, { data: polizas }, { data: puestos }] = await Promise.all([
    supabase.from("eventos").select("id, nombre, fecha, lugar").eq("id", eventoId).maybeSingle(),
    supabase.from("convocados").select(`id, puesto_id, seguro, poliza_id, persona:personal(${CAMPOS})`).eq("evento_id", eventoId),
    supabase.from("polizas").select("id, aseguradora, numero, vigencia_desde, vigencia_hasta, archivo_path").eq("evento_id", eventoId).order("creado_en"),
    supabase.from("puestos_evento").select("id, nombre, color, orden").eq("evento_id", eventoId).order("orden").order("creado_en"),
  ]);
  if (!evento) return null;
  const lista = ((convocados ?? []) as unknown as Convocado[]).sort((a, b) =>
    `${a.persona.apellido} ${a.persona.nombre}`.localeCompare(`${b.persona.apellido} ${b.persona.nombre}`, "es"),
  );
  return { evento, convocados: lista, polizas: (polizas ?? []) as Poliza[], puestos: (puestos ?? []) as Puesto[] };
}

/** Link temporal (10 minutos) al archivo de una póliza. */
export async function urlPoliza(path: string) {
  const { data } = await crearClienteAdmin().storage.from("seguros").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
