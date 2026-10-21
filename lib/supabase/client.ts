import { createBrowserClient } from "@supabase/ssr";

/** Cliente para el navegador (login y 2FA). Usa solo la clave pública. */
export function crearClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
