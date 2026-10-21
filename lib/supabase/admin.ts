import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con la clave secreta: saltea RLS y administra usuarios.
 * Usar SOLO en Server Actions después de verificar permisos.
 */
export function crearClienteAdmin() {
  const secreta = process.env.SUPABASE_SECRET_KEY;
  if (!secreta) {
    throw new Error("Falta SUPABASE_SECRET_KEY en las variables de entorno");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secreta, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
