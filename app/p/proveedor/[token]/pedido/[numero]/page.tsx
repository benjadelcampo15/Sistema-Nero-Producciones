import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { portalProveedor } from "@/lib/pedidos/consultas";
import { BotonImprimir } from "@/components/boton-imprimir";
import { NotaPedido } from "@/components/nota-pedido";

export const metadata: Metadata = { title: "Pedido · Nero Producciones", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** PDF de un pedido para el proveedor (por su link, sin usuario). */
export default function PaginaPdfProveedor({ params }: PageProps<"/p/proveedor/[token]/pedido/[numero]">) {
  return (
    <main className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <Suspense fallback={<p className="text-center text-sm text-stone-500">Cargando pedido…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string; numero: string }> }) {
  await connection();
  const { token, numero } = await params;
  const datos = await portalProveedor(token);
  const p = datos?.pedidos.find((x) => String(x.numero) === numero);
  if (!p) notFound();
  const nombreArchivo = `Pedido ${p.numero} - Nero Producciones`;

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
