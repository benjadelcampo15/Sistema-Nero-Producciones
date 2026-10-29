import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { formularioPublico } from "@/lib/empleados/consultas";
import { FormularioAlta } from "./formulario";
import { NOMBRE_CLIENTE } from "@/lib/cliente";

export const metadata: Metadata = {
  title: `Datos del personal · ${NOMBRE_CLIENTE}`,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Formulario público para que el personal de los eventos cargue sus datos (reemplaza al Google Form). */
export default function PaginaAlta({ params }: PageProps<"/p/alta/[token]">) {
  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <div className="text-center">
          <p className="text-lg font-black tracking-[0.3em]">NERO</p>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Producciones</p>
        </div>
        <Suspense fallback={<p className="text-center text-sm text-stone-500">Cargando…</p>}>
          <Contenido params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const formulario = await formularioPublico(token);
  if (!formulario) return <p className="tarjeta text-center text-sm text-stone-600">Este formulario no existe. Pedile el link actualizado a la productora.</p>;
  if (!formulario.abierto) return <p className="tarjeta text-center text-sm text-stone-600">El formulario está cerrado por ahora. Consultá con la productora.</p>;
  return <FormularioAlta token={token} />;
}
