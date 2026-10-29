import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerPedido } from "@/lib/pedidos/consultas";
import { totalPedido } from "@/lib/pedidos/tipos";
import { formatoCantidad } from "@/lib/stock/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { BotonImprimir } from "../../factura/[id]/boton-imprimir";

export const metadata: Metadata = { title: "Pedido", robots: { index: false, follow: false } };

/** Pedido a un mayorista listo para guardar como PDF y mandarlo (sin el menú de la app). */
export default function PaginaImprimirPedido({ params }: PageProps<"/imprimir/pedido/[id]">) {
  return (
    <main className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <Suspense fallback={<p className="text-center text-sm text-stone-500">Cargando pedido…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) notFound();
  const { id } = await params;
  const p = await obtenerPedido(id);
  if (!p) notFound();

  const empresa = process.env.EMISOR_NOMBRE_FANTASIA ?? "Nero Producciones";
  const razonSocial = process.env.EMISOR_RAZON_SOCIAL ?? "IDEAS CON DESTINO SRL";
  const domicilio = process.env.EMISOR_DOMICILIO ?? null;
  // Los precios van solo si se cargaron (si no, es una lista de cantidades).
  const conPrecios = p.items.some((i) => i.precio_unitario !== null);
  const nombreArchivo = `Pedido ${p.numero} - ${p.proveedor.razon_social}`;

  return (
    <div className="mx-auto max-w-[210mm] space-y-4 px-4 print:px-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-stone-600">{nombreArchivo}</p>
        <BotonImprimir titulo={nombreArchivo} automatico />
      </div>

      <article className="min-h-[297mm] bg-white p-[14mm] text-sm text-stone-900 shadow print:min-h-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-stone-900 pb-4">
          <div>
            <p className="text-2xl font-bold tracking-tight">{empresa}</p>
            <p className="text-xs text-stone-600">{razonSocial}</p>
            {domicilio && <p className="text-xs text-stone-600">{domicilio}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-stone-500">Nota de pedido</p>
            <p className="text-2xl font-bold">N° {String(p.numero).padStart(5, "0")}</p>
            <p className="text-xs text-stone-600">Fecha: {formatoFecha(p.fecha)}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 border-b border-stone-300 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-500">Para</p>
            <p className="font-semibold">{p.proveedor.razon_social}</p>
            {p.proveedor.contacto && <p>{p.proveedor.contacto}</p>}
            {p.proveedor.telefono && <p>Tel.: {p.proveedor.telefono}</p>}
            {p.proveedor.email && <p>{p.proveedor.email}</p>}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-500">Entrega</p>
            <p className="font-semibold">{p.deposito.nombre}</p>
            {p.fecha_entrega && <p>Fecha: {formatoFecha(p.fecha_entrega)}</p>}
          </div>
        </section>

        <table className="mt-4 w-full">
          <thead className="border-b-2 border-stone-900 text-left text-xs uppercase tracking-wide">
            <tr>
              <th className="py-2 pr-2">Producto</th>
              <th className="py-2 pr-2 text-right">Cantidad</th>
              <th className="py-2 pr-2">Unidad</th>
              {conPrecios && <th className="py-2 pr-2 text-right">Precio unit.</th>}
              {conPrecios && <th className="py-2 text-right">Subtotal</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {p.items.map((i) => (
              <tr key={i.producto.id} className="break-inside-avoid">
                <td className="py-1.5 pr-2">
                  {i.producto.nombre}
                  {i.producto.codigo && <span className="ml-1 text-xs text-stone-500">({i.producto.codigo})</span>}
                </td>
                <td className="py-1.5 pr-2 text-right font-mono font-semibold">{formatoCantidad(i.cantidad)}</td>
                <td className="py-1.5 pr-2 text-stone-600">{i.producto.unidad}</td>
                {conPrecios && <td className="py-1.5 pr-2 text-right font-mono">{i.precio_unitario !== null ? formatoPesos(i.precio_unitario) : "—"}</td>}
                {conPrecios && <td className="py-1.5 text-right font-mono">{i.precio_unitario !== null ? formatoPesos(i.precio_unitario * i.cantidad) : "—"}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-900 font-semibold">
            <tr>
              <td className="py-2 pr-2">{p.items.length} {p.items.length === 1 ? "producto" : "productos"}</td>
              <td colSpan={conPrecios ? 3 : 2} />
              {conPrecios && <td className="py-2 text-right font-mono">{formatoPesos(totalPedido(p.items))}</td>}
            </tr>
          </tfoot>
        </table>

        {p.notas && (
          <section className="mt-6 rounded border border-stone-300 p-3">
            <p className="text-xs uppercase tracking-wide text-stone-500">Notas</p>
            <p className="whitespace-pre-line">{p.notas}</p>
          </section>
        )}
      </article>
    </div>
  );
}
