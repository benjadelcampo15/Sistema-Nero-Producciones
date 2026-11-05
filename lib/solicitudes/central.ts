import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { UsuarioActual } from "@/lib/auth/sesion";

/**
 * Conexión con la base central de Planix (el Centro de Solicitudes de todos los
 * clientes). Solo desde el servidor: este sistema filtra por su empresa y solo
 * el equipo de Planix ve las demás.
 *   CENTRAL_SUPABASE_URL, CENTRAL_SUPABASE_SECRET_KEY: la base central.
 *   PLANIX_EMPRESA: qué cliente es este sistema ("nero", "finquita"…).
 *   PLANIX_EQUIPO: emails del equipo de Planix, separados por coma.
 */
export const EMPRESA = (process.env.PLANIX_EMPRESA ?? "").trim().toLowerCase();

export const centralConfigurada = () => Boolean(process.env.CENTRAL_SUPABASE_URL && process.env.CENTRAL_SUPABASE_SECRET_KEY && /^[a-z0-9_-]{2,40}$/.test(EMPRESA));

export function crearClienteCentral() {
  if (!centralConfigurada()) throw new Error("El Centro de Solicitudes no está configurado");
  return createClient(process.env.CENTRAL_SUPABASE_URL!, process.env.CENTRAL_SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const EQUIPO = (process.env.PLANIX_EQUIPO ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Si el usuario es del equipo de Planix: ve todas las empresas y administra las solicitudes. */
export const esEquipoPlanix = (usuario: Pick<UsuarioActual, "email">) => EQUIPO.includes(usuario.email.trim().toLowerCase());
