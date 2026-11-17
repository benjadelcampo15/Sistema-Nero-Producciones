"use client";

import { CampoMonto } from "@/components/campo-monto";
import { formatoPesos } from "@/lib/formato";
import { TIPOS_IVA_VENTA, ivaSugerido, totalSolicitud, totalesSolicitudes, type Solicitud, type TipoIvaVenta } from "@/lib/quilmes/solicitudes";

const celda =
  "w-full min-w-28 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none disabled:hover:border-transparent";

export const nuevaSolicitud = (): Solicitud => ({ id: crypto.randomUUID(), detalle: "", neto: 0, tipo_iva: "A21", iva: 0 });

/**
 * SOLICITUDES QUILMES: los precios de venta que se le presupuestan a Quilmes.
 * Solo precios comerciales: acá no hay costos, proveedores, pagos ni márgenes.
 */
export function TablaSolicitudes({
  lista,
  editable,
  alCambiar,
  alQuitar,
}: {
  lista: Solicitud[];
  editable: boolean;
  alCambiar: (lista: Solicitud[]) => void;
  /** Quitar una solicitud (quien llama decide qué pasa con sus gastos reales). */
  alQuitar: (id: string) => void;
}) {
  const t = totalesSolicitudes(lista);
  const editar = (i: number, cambio: Partial<Solicitud>) =>
    alCambiar(
      lista.map((s, j) => {
        if (j !== i) return s;
        const nuevo = { ...s, ...cambio };
        nuevo.iva = ivaSugerido(nuevo.neto, nuevo.tipo_iva);
        return nuevo;
      }),
    );
  const mover = (i: number, d: -1 | 1) => {
    const otra = [...lista];
    [otra[i], otra[i + d]] = [otra[i + d], otra[i]];
    alCambiar(otra);
  };
  return (
    <div className="tarjeta overflow-x-auto p-0">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="border-b border-stone-200 bg-sky-50 text-left text-xs uppercase tracking-wide text-sky-900">
          <tr>
            <th className="w-8 px-2 py-2">#</th>
            <th className="px-2 py-2">Detalle del servicio</th>
            <th className="px-2 py-2 text-right">Precio neto</th>
            <th className="px-2 py-2">Factura / IVA</th>
            <th className="px-2 py-2 text-right">IVA débito</th>
            <th className="px-2 py-2 text-right">Total con IVA</th>
            {editable && <th className="w-20" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {lista.length === 0 && (
            <tr>
              <td colSpan={editable ? 7 : 6} className="px-3 py-4 text-center text-stone-500">
                Todavía no hay solicitudes. {editable && "Agregá cada servicio que se le presupuesta a Quilmes."}
              </td>
            </tr>
          )}
          {lista.map((s, i) => (
            <tr key={s.id}>
              <td className="px-2 py-0.5 text-xs text-stone-500">{i + 1}</td>
              <td className="px-1 py-0.5">
                <input value={s.detalle} disabled={!editable} maxLength={300} placeholder="Ej.: Técnica, Escenario, Personal…" aria-label="Detalle del servicio" onChange={(e) => editar(i, { detalle: e.target.value })} className={`${celda} min-w-60`} />
              </td>
              <td className="px-1 py-0.5"><CampoMonto valor={s.neto} disabled={!editable} etiqueta="Precio neto" alCambiar={(neto) => editar(i, { neto })} /></td>
              <td className="px-1 py-0.5">
                <select value={s.tipo_iva} disabled={!editable} aria-label="Tipo de factura / IVA" onChange={(e) => editar(i, { tipo_iva: e.target.value as TipoIvaVenta })} className="rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-stone-200">
                  {TIPOS_IVA_VENTA.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </td>
              <td className="px-2 py-0.5 text-right font-mono text-stone-600">{formatoPesos(s.iva)}</td>
              <td className="px-2 py-0.5 text-right font-mono font-semibold">{formatoPesos(totalSolicitud(s))}</td>
              {editable && (
                <td className="whitespace-nowrap px-1 text-right">
                  <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} className="px-1 text-stone-400 hover:text-stone-900 disabled:opacity-30" aria-label="Subir">↑</button>
                  <button type="button" disabled={i === lista.length - 1} onClick={() => mover(i, 1)} className="px-1 text-stone-400 hover:text-stone-900 disabled:opacity-30" aria-label="Bajar">↓</button>
                  <button type="button" onClick={() => alQuitar(s.id)} className="px-1 text-stone-400 hover:text-red-700" aria-label="Quitar solicitud">×</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-stone-200 bg-stone-50">
          <tr>
            <td colSpan={2} className="px-2 py-1.5">
              {editable && (
                <button type="button" onClick={() => alCambiar([...lista, nuevaSolicitud()])} className="text-xs text-stone-600 hover:text-stone-900">
                  + Agregar solicitud
                </button>
              )}
            </td>
            <td className="px-2 py-1.5 text-right font-mono text-xs text-stone-600">Subtotal neto<br /><span className="text-sm font-semibold text-stone-900">{formatoPesos(t.neto)}</span></td>
            <td />
            <td className="px-2 py-1.5 text-right font-mono text-xs text-stone-600">IVA<br /><span className="text-sm font-semibold text-stone-900">{formatoPesos(t.iva)}</span></td>
            <td className="px-2 py-1.5 text-right font-mono text-xs text-sky-900">TOTAL PRESUPUESTADO<br /><span className="text-base font-bold">{formatoPesos(t.total)}</span></td>
            {editable && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
