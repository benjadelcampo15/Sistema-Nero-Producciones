import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { eventosParaPropuesta, obtenerPropuesta } from "@/lib/propuestas/consultas";
import { pdfPropuesta } from "@/lib/propuestas/pdf";
import { nombreArchivoPropuesta } from "@/lib/propuestas/excel";
import { formatoFechaHora } from "@/lib/formato";

/** PDF de la propuesta de pagos (lo guardado). Solo lee: no genera movimientos. */
export async function GET(_request: Request, { params }: RouteContext<"/propuestas-pago/[id]/pdf">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return new Response("Sin acceso", { status: 403 });
  const { id } = await params;
  const propuesta = await obtenerPropuesta(id);
  if (!propuesta) return new Response("Propuesta no encontrada", { status: 404 });
  const eventos = await eventosParaPropuesta(propuesta.empresa);
  const archivo = await pdfPropuesta(propuesta, new Map(eventos.map((e) => [e.id, e.nombre])), formatoFechaHora(new Date().toISOString()));
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombreArchivoPropuesta(propuesta, "pdf")}"`,
      "Cache-Control": "no-store",
    },
  });
}
