import { crearClienteAdmin } from "@/lib/supabase/admin";
import { enviarCorreosPendientes } from "@/lib/notificaciones/correo";

/**
 * Cron diario de Vercel (vercel.json): genera los avisos de vencimiento de
 * Tareas (sin repetir) y manda los correos pendientes. Durante el día los avisos
 * se generan también al abrir los tableros y la campana.
 */
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { data: avisos, error } = await crearClienteAdmin().rpc("tareas_procesar_programadas");
    if (error) throw new Error(error.message);
    let enviados = 0;
    // Hasta 5 tandas de correos por ejecución.
    for (let i = 0; i < 5; i++) {
      const r = await enviarCorreosPendientes(40);
      enviados += r.enviados;
      if (r.enviados < 40) break;
    }
    return Response.json({ avisos, correos: enviados });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
