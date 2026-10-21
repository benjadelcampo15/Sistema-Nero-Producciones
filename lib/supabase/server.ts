import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

/** Cliente con la sesión del usuario (respeta RLS). Para Server Components y Server Actions. */
export async function crearClienteServidor() {
  // Todo lo que usa la sesión es por request: nunca se prerenderiza
  // (Supabase consulta la hora para validar el token).
  await connection();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Desde un Server Component no se pueden escribir cookies;
            // el proxy ya refresca la sesión en cada request.
          }
        },
      },
    },
  );
}
