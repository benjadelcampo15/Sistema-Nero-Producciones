import "server-only";
import { obtenerUsuario, puede, type UsuarioActual } from "@/lib/auth/sesion";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import type { NivelPermiso, Seccion } from "@/lib/permisos";
import type { TipoEvento } from "./tipos";

/**
 * Qué permiso pide cada parte de un evento según su tipo:
 *   evento → el proyecto (datos, estado del listado, Solicitudes en Quilmes)
 *   costos → planilla, gastos, rentabilidad, movimientos y cierre (sincroniza Financiero)
 * En un evento común las dos son "eventos"; en Quilmes, "quilmes" y "quilmes_costos".
 * La base exige lo mismo (permiso_evento), esto da mensajes claros antes.
 */
export function seccionDe(tipo: TipoEvento, parte: "evento" | "costos"): Seccion {
  if (tipo !== "quilmes") return "eventos";
  return parte === "costos" ? "quilmes_costos" : "quilmes";
}

export function puedeEnEvento(usuario: UsuarioActual, tipo: TipoEvento, parte: "evento" | "costos", nivel: NivelPermiso) {
  return puede(usuario, seccionDe(tipo, parte), nivel);
}

/** El tipo de un evento (aunque el usuario no pueda verlo: solo para decidir qué permiso pedir). */
export async function tipoDeEvento(id: string): Promise<TipoEvento | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await crearClienteAdmin().from("eventos").select("tipo").eq("id", id).maybeSingle();
  return (data?.tipo as TipoEvento | undefined) ?? null;
}

/** Para Server Actions: corta si el usuario no tiene el permiso que corresponde al evento. */
export async function exigirPermisoEvento(id: string, parte: "evento" | "costos", nivel: NivelPermiso) {
  const [usuario, tipo] = await Promise.all([obtenerUsuario(), tipoDeEvento(id)]);
  if (!tipo) throw new Error("El evento no existe");
  if (!puedeEnEvento(usuario, tipo, parte, nivel)) throw new Error("No tenés permiso para esta acción");
  return { usuario, tipo };
}
