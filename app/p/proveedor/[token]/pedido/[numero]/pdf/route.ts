import { portalProveedor } from "@/lib/pedidos/consultas";
import { nombrePdfPedido, pdfPedido } from "@/lib/pedidos/pdf";

/** El PDF del pedido como archivo, por el link del proveedor (sin usuario). */
export async function GET(_request: Request, { params }: RouteContext<"/p/proveedor/[token]/pedido/[numero]/pdf">) {
  const { token, numero } = await params;
  const datos = await portalProveedor(token);
  const pedido = datos?.pedidos.find((p) => String(p.numero) === numero);
  if (!pedido) return new Response("Pedido no encontrado", { status: 404 });

  const archivo = await pdfPedido(pedido);
  const nombre = nombrePdfPedido(pedido);
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/pdf",
      // inline: en el celular se abre directo; con el nombre para cuando se guarda o comparte.
      "Content-Disposition": `inline; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
