import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { obtenerComprobantePublico } from "@/lib/facturar/consultas";
import { datosEmisor } from "@/lib/facturar/emisor";
import { qrSvg, urlQrArca } from "@/lib/facturar/qr";
import { nombreTipoCbte, numeroComprobante } from "@/lib/facturar/tipos";
import { ComprobanteVista } from "@/components/comprobante-vista";
import { BotonImprimir } from "@/components/boton-imprimir";
import { NOMBRE_CLIENTE } from "@/lib/cliente";

export const metadata: Metadata = {
  title: `Factura · ${NOMBRE_CLIENTE}`,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Vista pública de la factura para el cliente: solo esta factura, sin usuario. */
export default function PaginaFacturaPublica({ params }: PageProps<"/p/factura/[token]">) {
  return (
    <main className="min-h-screen bg-stone-100 py-6 print:bg-white print:py-0">
      <Suspense fallback={<p className="text-center text-sm text-stone-500">Cargando factura…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const c = await obtenerComprobantePublico(token);
  if (!c) notFound();

  const emisor = datosEmisor(c.entorno);
  const svg = await qrSvg(urlQrArca(c, emisor.cuit));
  const titulo = `${nombreTipoCbte(c.tipo_cbte)} ${numeroComprobante(c)}`;

  return (
    <div className="mx-auto max-w-[210mm] space-y-4 px-4 print:px-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-stone-600">{titulo}</p>
        <BotonImprimir titulo={titulo} />
      </div>
      <div className="overflow-x-auto shadow print:overflow-visible print:shadow-none">
        <div className="min-w-[640px]">
          <ComprobanteVista c={c} emisor={emisor} qrSvg={svg} />
        </div>
      </div>
    </div>
  );
}
