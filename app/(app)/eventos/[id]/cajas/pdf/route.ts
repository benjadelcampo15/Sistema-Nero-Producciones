import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { cajasDeEvento, obtenerEvento } from "@/lib/eventos/consultas";
import { pdfCierres } from "@/lib/eventos/pdf-cajas";

/** PDF con los cierres de caja del evento. */
export async function GET(_request: Request, { params }: RouteContext<"/eventos/[id]/cajas/pdf">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "eventos", "ver")) return new Response("Sin acceso", { status: 403 });
  const { id } = await params;
  const evento = await obtenerEvento(id);
  if (!evento) return new Response("Evento no encontrado", { status: 404 });

  const archivo = await pdfCierres({ evento, cajas: await cajasDeEvento(id) });
  const nombre = `Cierre de cajas - ${evento.nombre} ${evento.fecha}.pdf`.replace(/[\\/:*?"<>|]/g, "");
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre.replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
