import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { portalProveedor } from "@/lib/pedidos/consultas";
import type { Pedido } from "@/lib/pedidos/tipos";
import { PedidoProveedor } from "./pedido-proveedor";

export const metadata: Metadata = {
  title: "Pedidos · Nero Producciones",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Página del proveedor: sus pedidos, para verlos, bajar el PDF y confirmarlos. Sin usuario, por link. */
export default function PaginaProveedor({ params }: PageProps<"/p/proveedor/[token]">) {
  return (
    <main className="min-h-screen bg-stone-100 px-4 py-6">
      <Suspense fallback={<p className="text-center text-sm text-stone-500">Cargando pedidos…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const datos = await portalProveedor(token);
  if (!datos) notFound();
  const { proveedor, pedidos } = datos;
  const grupos: { titulo: string; lista: Pedido[] }[] = [
    { titulo: "Para confirmar", lista: pedidos.filter((p) => p.estado === "enviado") },
    { titulo: "Confirmados", lista: pedidos.filter((p) => p.estado === "confirmado") },
    { titulo: "Entregados", lista: pedidos.filter((p) => p.estado === "recibido").slice(0, 10) },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-stone-500">Nero Producciones</p>
        <h1 className="text-2xl font-semibold">Pedidos para {proveedor.razon_social}</h1>
        <p className="text-sm text-stone-500">Revisá cada pedido, bajá el PDF y confirmanos qué mandás y cuándo.</p>
      </header>

      {pedidos.length === 0 && <p className="rounded-xl border border-stone-200 bg-white p-6 text-center text-stone-500">No hay pedidos por ahora.</p>}

      {grupos
        .filter((g) => g.lista.length)
        .map((g) => (
          <section key={g.titulo} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
              {g.titulo} ({g.lista.length})
            </h2>
            {g.lista.map((p) => (
              <PedidoProveedor key={p.id} token={token} pedido={p} />
            ))}
          </section>
        ))}
    </div>
  );
}
