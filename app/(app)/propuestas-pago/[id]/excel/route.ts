import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { eventosParaPropuesta, obtenerPropuesta } from "@/lib/propuestas/consultas";
import { excelPropuesta, nombreArchivoPropuesta } from "@/lib/propuestas/excel";

/** Excel de la propuesta de pagos (lo guardado), con fórmulas. Solo lee: no genera movimientos. */
export async function GET(_request: Request, { params }: RouteContext<"/propuestas-pago/[id]/excel">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return new Response("Sin acceso", { status: 403 });
  const { id } = await params;
  const propuesta = await obtenerPropuesta(id);
  if (!propuesta) return new Response("Propuesta no encontrada", { status: 404 });
  const eventos = await eventosParaPropuesta(propuesta.empresa);
  const archivo = await excelPropuesta(propuesta, new Map(eventos.map((e) => [e.id, e.nombre])));
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoPropuesta(propuesta, "xlsx")}"`,
      "Cache-Control": "no-store",
    },
  });
}
