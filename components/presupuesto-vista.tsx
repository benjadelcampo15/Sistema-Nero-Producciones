import { agruparPorRubro, calcularTotales, numeroPresupuesto, venceEl, type Presupuesto } from "@/lib/presupuestos/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";

/**
 * El presupuesto tal como lo ve el cliente (sin costos internos ni márgenes).
 * Se usa en el link público y en la vista previa interna. Pensado también para imprimir.
 */
export function PresupuestoVista({ p }: { p: Presupuesto }) {
  const totales = calcularTotales(p.items, p.modo_iva, p.descuento_pct);
  const grupos = agruparPorRubro(p.items);
  const precioUnitario = (precio: number) => formatoPesos(precio);

  return (
    <article className="mx-auto max-w-3xl space-y-8 bg-white p-6 text-stone-900 sm:p-10 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-6">
        <div>
          <p className="text-2xl font-black tracking-[0.3em]">NERO</p>
          <p className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Producciones</p>
        </div>
        <div className="text-right text-sm">
          <p className="text-lg font-semibold">Presupuesto {numeroPresupuesto(p.numero)}</p>
          <p className="text-stone-500">Fecha: {formatoFecha(p.fecha)}</p>
          <p className="text-stone-500">Válido hasta: {formatoFecha(venceEl(p))}</p>
        </div>
      </header>

      <section className="grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-stone-500">Cliente</p>
          <p className="font-semibold">{p.cliente_nombre}</p>
          {p.cliente_cuit && <p>CUIT {p.cliente_cuit}</p>}
          {p.cliente_contacto && <p>Atención: {p.cliente_contacto}</p>}
          {p.cliente_email && <p>{p.cliente_email}</p>}
          {p.cliente_telefono && <p>{p.cliente_telefono}</p>}
        </div>
        {(p.evento_nombre || p.evento_fecha || p.evento_lugar || p.invitados) && (
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-stone-500">Evento</p>
            {p.evento_nombre && <p className="font-semibold">{p.evento_nombre}</p>}
            {p.evento_fecha && <p>Fecha: {formatoFecha(p.evento_fecha)}</p>}
            {p.evento_lugar && <p>Lugar: {p.evento_lugar}</p>}
            {p.invitados ? <p>Invitados: {p.invitados}</p> : null}
          </div>
        )}
      </section>

      <section className="space-y-5">
        {grupos.map((g) => (
          <div key={g.rubro} className="break-inside-avoid">
            <div className="mb-2 flex items-baseline justify-between border-b border-stone-900 pb-1">
              <h3 className="text-sm font-semibold uppercase tracking-wide">{g.rubro}</h3>
              <span className="font-mono text-sm">{formatoPesos(g.subtotal)}</span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {g.items.map((it, i) => (
                  <tr key={i} className="border-b border-stone-100 align-top">
                    <td className="py-1.5 pr-3">{it.descripcion}</td>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-right text-stone-500">
                      {it.cantidad !== 1 && `${it.cantidad} × ${precioUnitario(it.precio)}`}
                    </td>
                    <td className="whitespace-nowrap py-1.5 text-right font-mono">{formatoPesos(it.cantidad * it.precio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section className="ml-auto max-w-xs space-y-1 text-sm">
        <Fila nombre="Subtotal" valor={totales.subtotal} />
        {totales.descuento > 0 && <Fila nombre={`Descuento ${p.descuento_pct}%`} valor={-totales.descuento} />}
        {p.modo_iva === "mas_iva" && (
          <>
            <Fila nombre="Neto" valor={totales.neto} />
            <Fila nombre="IVA 21%" valor={totales.iva} />
          </>
        )}
        <div className="flex justify-between border-t border-stone-900 pt-2 text-lg font-semibold">
          <span>Total</span>
          <span className="font-mono">{formatoPesos(totales.total)}</span>
        </div>
        <p className="text-right text-xs text-stone-500">
          {p.modo_iva === "mas_iva" ? "Precios más IVA" : p.modo_iva === "iva_incluido" ? "IVA incluido" : "Precios sin IVA"}
        </p>
      </section>

      {(p.forma_pago || p.incluye || p.observaciones) && (
        <section className="space-y-4 border-t border-stone-200 pt-6 text-sm">
          {p.forma_pago && <Bloque titulo="Forma de pago" texto={p.forma_pago} />}
          {p.incluye && <Bloque titulo="Incluye / no incluye" texto={p.incluye} />}
          {p.observaciones && <Bloque titulo="Observaciones" texto={p.observaciones} />}
        </section>
      )}
    </article>
  );
}

function Fila({ nombre, valor }: { nombre: string; valor: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-stone-500">{nombre}</span>
      <span className="font-mono">{formatoPesos(valor)}</span>
    </div>
  );
}

function Bloque({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="break-inside-avoid">
      <p className="mb-1 text-xs uppercase tracking-wide text-stone-500">{titulo}</p>
      <p className="whitespace-pre-line">{texto}</p>
    </div>
  );
}
