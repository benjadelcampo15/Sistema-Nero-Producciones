import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { segurosDeEvento } from "@/lib/empleados/consultas";
import { pdfPuestos } from "@/lib/empleados/pdf";

/** PDF del personal del evento separado por puestos (con sus colores). */
export async function GET(_request: Request, { params }: RouteContext<"/empleados/seguros/[eventoId]/puestos">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "operativa", "ver")) return new Response("Sin acceso", { status: 403 });
  const { eventoId } = await params;
  const datos = await segurosDeEvento(eventoId);
  if (!datos) return new Response("Evento no encontrado", { status: 404 });

  const archivo = await pdfPuestos(datos);
  const nombre = `Puestos - ${datos.evento.nombre} ${datos.evento.fecha}.pdf`.replace(/[\\/:*?"<>|]/g, "");
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre.replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
