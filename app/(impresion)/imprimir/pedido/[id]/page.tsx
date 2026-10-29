import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerPedido } from "@/lib/pedidos/consultas";
import { BotonImprimir } from "@/components/boton-imprimir";
import { NotaPedido } from "@/components/nota-pedido";

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

  const nombreArchivo = `Pedido ${p.numero} - ${p.proveedor.razon_social}`;

  return (
    <div className="mx-auto max-w-[210mm] space-y-4 px-4 print:px-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-stone-600">{nombreArchivo}</p>
        <BotonImprimir titulo={nombreArchivo} automatico />
      </div>

      <NotaPedido p={p} />
    </div>
  );
}
