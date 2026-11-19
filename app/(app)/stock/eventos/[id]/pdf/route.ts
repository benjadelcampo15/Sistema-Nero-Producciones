import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { stockDelEvento } from "@/lib/stock/por-evento";
import { pdfStockEvento } from "@/lib/stock/pdf-evento";

/** PDF con el stock actual de los productos que se usan en el evento. */
export async function GET(_request: Request, { params }: RouteContext<"/stock/eventos/[id]/pdf">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return new Response("Sin acceso", { status: 403 });
  const { id } = await params;
  const datos = await stockDelEvento(id);
  if (!datos) return new Response("Evento no encontrado", { status: 404 });

  const archivo = await pdfStockEvento(datos);
  const nombre = `Stock - ${datos.evento.nombre} ${datos.evento.fecha}.pdf`.replace(/[\\/:*?"<>|]/g, "");
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
