import { crearClienteAdmin } from "@/lib/supabase/admin";
import { MODO_DEMO } from "@/lib/cliente";
import { cargarDemo } from "@/lib/demo/datos";

// Cargar la demo lleva unos segundos (borra y vuelve a cargar todo).
export const maxDuration = 60;

/**
 * Cron diario de Vercel (vercel.json): en la instalación demo vuelve a cargar
 * los datos ficticios (queda impecable aunque la hayan tocado) y la mantiene
 * activa para que Supabase no la pause. En cualquier otra instalación no hace nada.
 */
export async function GET(request: Request) {
  if (!MODO_DEMO) return Response.json({ error: "No es la demo" }, { status: 404 });
  // Con CRON_SECRET, como el resto de los crons; sin él, solo el cron de Vercel
  // (en la demo lo peor que puede pasar es que se reinicie antes de hora).
  const secreto = process.env.CRON_SECRET;
  const autorizado = secreto ? request.headers.get("authorization") === `Bearer ${secreto}` : (request.headers.get("user-agent") ?? "").includes("vercel-cron");
  if (!autorizado) return Response.json({ error: "No autorizado" }, { status: 401 });
  try {
    const resumen = await cargarDemo(crearClienteAdmin(), process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return Response.json({ ok: true, resumen });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
