import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerComprobante } from "@/lib/facturar/consultas";
import { datosEmisor } from "@/lib/facturar/emisor";
import { qrSvg, urlQrArca } from "@/lib/facturar/qr";
import { nombreTipoCbte, numeroComprobante } from "@/lib/facturar/tipos";
import { ComprobanteVista } from "@/components/comprobante-vista";
import { BotonImprimir } from "@/components/boton-imprimir";

export const metadata: Metadata = { title: "Factura", robots: { index: false, follow: false } };

/** Factura lista para imprimir o guardar como PDF (sin el menú de la app). */
export default function PaginaImprimirFactura({ params }: PageProps<"/imprimir/factura/[id]">) {
  return (
    <main className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <Suspense fallback={<p className="text-center text-sm text-stone-500">Cargando factura…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturar", "ver")) notFound();

  const { id } = await params;
  const c = await obtenerComprobante(id);
  if (!c || c.estado !== "emitido" || !c.cae) notFound();

  const emisor = datosEmisor(c.entorno);
  const svg = await qrSvg(urlQrArca(c, emisor.cuit));
  const nombreArchivo = `${nombreTipoCbte(c.tipo_cbte)} ${numeroComprobante(c)}${c.receptor_nombre ? ` - ${c.receptor_nombre}` : ""}`;

  return (
    <div className="mx-auto max-w-[210mm] space-y-4 px-4 print:px-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-stone-600">{nombreArchivo}</p>
        <BotonImprimir titulo={nombreArchivo} />
      </div>
      <div className="shadow print:shadow-none">
        <ComprobanteVista c={c} emisor={emisor} qrSvg={svg} />
      </div>
    </div>
  );
}
