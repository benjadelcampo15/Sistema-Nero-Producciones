import { avisarChequesPorVencer } from "@/lib/cheques/aviso";

/** Cron diario de Vercel (vercel.json): avisa por mail los cheques por vencer. */
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const r = await avisarChequesPorVencer();
    return Response.json({ cheques: r.cheques, destinatarios: r.para.length });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
