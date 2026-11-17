import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Solicitud } from "./solicitudes";

/** Solicitudes Quilmes de un evento, en su orden. */
export async function solicitudesEvento(eventoId: string): Promise<Solicitud[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("quilmes_solicitudes").select("id, detalle, neto, tipo_iva, iva").eq("evento_id", eventoId).order("orden");
  return (data ?? []).map((s) => ({ id: s.id, detalle: s.detalle, neto: Number(s.neto), tipo_iva: s.tipo_iva as Solicitud["tipo_iva"], iva: Number(s.iva) }));
}
