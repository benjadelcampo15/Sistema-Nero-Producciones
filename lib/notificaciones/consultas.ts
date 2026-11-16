import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Notificacion = { id: string; tipo: string | null; titulo: string; detalle: string | null; href: string | null; leida: boolean; creado_en: string };
export type Preferencias = { asignaciones: boolean; menciones: boolean; comentarios: boolean; cambios: boolean; vencimientos: boolean; correo: boolean };

export const PREFERENCIAS_INICIALES: Preferencias = { asignaciones: true, menciones: true, comentarios: true, cambios: true, vencimientos: true, correo: true };

/** Cantidad de notificaciones sin leer del usuario actual (para la campana). */
export async function notificacionesPendientes(): Promise<number> {
  const supabase = await crearClienteServidor();
  const { count } = await supabase.from("notificaciones").select("id", { count: "exact", head: true }).eq("leida", false);
  return count ?? 0;
}

/** Las notificaciones del usuario: nuevas y anteriores (las últimas 150) y sus preferencias. */
export async function misNotificaciones(conTareas: boolean) {
  const supabase = await crearClienteServidor();
  // Avisos de vencimiento al día (idempotente).
  if (conTareas) await supabase.rpc("tareas_procesar_programadas");
  const [{ data }, { data: pref }] = await Promise.all([
    supabase.from("notificaciones").select("id, tipo, titulo, detalle, href, leida, creado_en").order("creado_en", { ascending: false }).limit(150),
    supabase.from("preferencias_notificaciones").select("asignaciones, menciones, comentarios, cambios, vencimientos, correo").maybeSingle(),
  ]);
  return { lista: (data ?? []) as Notificacion[], preferencias: (pref as Preferencias | null) ?? PREFERENCIAS_INICIALES };
}
