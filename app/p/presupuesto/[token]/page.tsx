import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { obtenerPresupuestoPublico } from "@/lib/presupuestos/consultas";
import { estadoVisible, numeroPresupuesto } from "@/lib/presupuestos/tipos";
import { formatoFecha, hoy } from "@/lib/formato";
import { PresupuestoVista } from "@/components/presupuesto-vista";
import { AccionesCliente } from "./acciones-cliente";
import { NOMBRE_CLIENTE } from "@/lib/cliente";

export const metadata: Metadata = {
  title: `Presupuesto · ${NOMBRE_CLIENTE}`,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Vista pública del presupuesto para el cliente: solo este presupuesto, sin usuario. */
export default function PaginaPresupuestoPublico({ params }: PageProps<"/p/presupuesto/[token]">) {
  return (
    <main className="min-h-screen bg-stone-100 py-6 print:bg-white print:py-0">
      <Suspense fallback={<p className="text-center text-sm text-stone-500">Cargando presupuesto…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const p = await obtenerPresupuestoPublico(token);
  if (!p) notFound();

  // Primera vez que el cliente lo abre: queda registrado para la productora.
  if (!p.visto_en) {
    await crearClienteAdmin().from("presupuestos").update({ visto_en: new Date().toISOString() }).eq("id", p.id);
  }

  const estado = estadoVisible(p, hoy());

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 print:px-0">
      <div className="shadow-sm print:shadow-none">
        <PresupuestoVista p={p} />
      </div>

      {estado === "aceptado" && (
        <p className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 print:hidden">
          Presupuesto aceptado{p.respondido_por ? ` por ${p.respondido_por}` : ""}
          {p.respondido_en ? ` el ${formatoFecha(p.respondido_en.slice(0, 10))}` : ""}. ¡Gracias!
        </p>
      )}
      {estado === "rechazado" && (
        <p className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600 print:hidden">Este presupuesto fue rechazado.</p>
      )}
      {estado === "vencido" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
          Este presupuesto venció. Escribinos y te mandamos uno actualizado.
        </p>
      )}

      <AccionesCliente token={token} puedeResponder={estado === "enviado"} titulo={`Presupuesto ${numeroPresupuesto(p.numero)}`} />
    </div>
  );
}
