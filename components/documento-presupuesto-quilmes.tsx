import { formatoFecha, formatoFechaHora, formatoPesos, hoy } from "@/lib/formato";
import type { DocumentoPresupuesto } from "@/lib/quilmes/presupuesto";

const alicuota = (n: number) => `${String(n).replace(".", ",")}%`;

/**
 * Vista previa A4 del presupuesto para Quilmes: el mismo contenido que el PDF.
 * Recibe SOLO los datos comerciales (lista blanca): no hay costos ni márgenes que mostrar.
 */
export function DocumentoPresupuestoQuilmes({ doc }: { doc: DocumentoPresupuesto }) {
  return (
    <article className="documento-quilmes mx-auto w-full max-w-[210mm] bg-white p-6 text-stone-900 shadow-sm ring-1 ring-stone-200 sm:p-10 print:max-w-none print:p-0 print:shadow-none print:ring-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-stone-900 pb-3">
        <div>
          <p className="text-xl font-bold">{doc.emisor}</p>
          {doc.razon_social && <p className="text-xs text-stone-600">{doc.razon_social}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-stone-500">Presupuesto Quilmes</p>
          <p className="text-lg font-bold">{doc.numero ? `N° ${String(doc.numero).padStart(4, "0")}` : "Vista previa"}</p>
          <p className="text-xs text-stone-600">
            {doc.version ? `Versión ${doc.version} · ` : ""}Emisión: {doc.emitido_en ? formatoFechaHora(doc.emitido_en).split(" ")[0] : formatoFecha(hoy())}
          </p>
        </div>
      </header>

      <section className="border-b border-stone-300 py-3">
        <p className="text-xs uppercase tracking-wide text-stone-500">Evento / proyecto</p>
        <p className="font-semibold">{doc.evento.nombre}</p>
        <p className="text-sm text-stone-700">
          {formatoFecha(doc.evento.fecha)}
          {doc.evento.lugar && ` · ${doc.evento.lugar}`}
        </p>
      </section>

      <table className="mt-4 w-full text-sm">
        <thead className="border-b-2 border-stone-900 text-left text-[11px] uppercase tracking-wide text-stone-600">
          <tr>
            <th className="py-1.5 pr-2">Servicio</th>
            <th className="py-1.5 pr-2 text-right">Precio neto</th>
            <th className="py-1.5 pr-2 text-right">IVA</th>
            <th className="py-1.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((i, k) => (
            <tr key={k} className="break-inside-avoid border-b border-stone-200 align-top">
              <td className="py-1.5 pr-2">
                {i.detalle}
                <span className="block text-[11px] text-stone-500">{i.tratamiento}</span>
              </td>
              <td className="whitespace-nowrap py-1.5 pr-2 text-right font-mono">{formatoPesos(i.neto)}</td>
              <td className="whitespace-nowrap py-1.5 pr-2 text-right font-mono">
                {formatoPesos(i.iva)}
                {i.alicuota > 0 && <span className="block text-[11px] text-stone-500">{alicuota(i.alicuota)}</span>}
              </td>
              <td className="whitespace-nowrap py-1.5 text-right font-mono font-semibold">{formatoPesos(i.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><dt>Subtotal neto</dt><dd className="font-mono">{formatoPesos(doc.totales.neto)}</dd></div>
        <div className="flex justify-between"><dt>IVA</dt><dd className="font-mono">{formatoPesos(doc.totales.iva)}</dd></div>
        <div className="flex justify-between border-t-2 border-stone-900 pt-1.5 text-base font-bold"><dt>TOTAL GENERAL PRESUPUESTADO</dt><dd className="font-mono">{formatoPesos(doc.totales.total)}</dd></div>
      </dl>
    </article>
  );
}
