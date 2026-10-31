import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerSalida } from "@/lib/stock/consultas";
import { formatoCantidad } from "@/lib/stock/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../../../sin-acceso";
import { BotonEliminarMovimiento } from "../../boton-eliminar-movimiento";

export default async function PaginaSalida({ params }: PageProps<"/stock/salidas/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "stock", "editar");
  const { id } = await params;
  const salida = await obtenerSalida(id);
  if (!salida) notFound();
  const conteo = salida.modo === "conteo";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/stock/movimientos" className="text-sm text-stone-500 hover:text-stone-900">← Movimientos de stock</Link>
          <h1 className="mt-1 text-2xl font-semibold">
            {conteo ? "Salida por conteo" : "Salida"} · {salida.deposito.nombre}
          </h1>
          <p className="text-sm text-stone-500">
            {formatoFecha(salida.fecha)}
            {salida.evento && (
              <>
                {" · "}
                <Link href={`/eventos/${salida.evento.id}`} className="underline">{salida.evento.nombre}</Link>
              </>
            )}
            {salida.motivo && ` · ${salida.motivo}`}
          </p>
        </div>
        {editable && (
          <BotonEliminarMovimiento
            que="salida"
            id={salida.id}
            volverA="/stock/movimientos"
            texto="Eliminar salida"
            confirmacion={`¿Eliminar la salida completa (${salida.productos} ${salida.productos === 1 ? "producto" : "productos"})?`}
            className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="tarjeta p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">Productos</p>
          <p className="mt-1 font-mono text-xl font-semibold">{salida.productos}</p>
        </div>
        <div className="tarjeta p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">Costo de la salida</p>
          <p className="mt-1 font-mono text-xl font-semibold">{formatoPesos(salida.costoTotal)}</p>
          {salida.sinCosto > 0 && <p className="text-xs text-amber-700">{salida.sinCosto} productos sin costo cargado no suman</p>}
        </div>
      </div>

      {/* Celular: una fila compacta por producto. */}
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white md:hidden">
        {salida.lineas.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium leading-tight">{l.producto.nombre}</p>
              {conteo && (
                <p className="text-xs text-stone-500">
                  Había {l.stock_inicial !== null ? formatoCantidad(l.stock_inicial) : "—"} · quedó {l.stock_contado !== null ? formatoCantidad(l.stock_contado) : "—"}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono font-semibold text-red-700">
                −{formatoCantidad(l.cantidad)} <span className="text-xs font-normal text-stone-400">{l.producto.unidad}</span>
              </p>
              <p className="font-mono text-xs text-stone-500">{l.costo_unitario !== null ? formatoPesos(l.costo_unitario * l.cantidad) : "sin costo"}</p>
              {editable && <BotonEliminarMovimiento que="movimiento" id={l.id} volverA={salida.lineas.length === 1 ? "/stock/movimientos" : undefined} confirmacion={`¿Eliminar ${l.producto.nombre} de esta salida?${salida.lineas.length === 1 ? " Es el único producto: se borra la salida completa." : ""}`} />}
            </div>
          </li>
        ))}
        <li className="flex justify-between px-4 py-3 font-semibold">
          <span>Total</span>
          <span className="font-mono">{formatoPesos(salida.costoTotal)}</span>
        </li>
      </ul>

      <section className="tarjeta hidden overflow-x-auto p-0 md:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Producto</th>
              {conteo && <th className="px-4 py-3 text-right">Había</th>}
              {conteo && <th className="px-4 py-3 text-right">Quedó</th>}
              <th className="px-4 py-3 text-right">Salió</th>
              <th className="px-4 py-3 text-right">Costo unit.</th>
              <th className="px-4 py-3 text-right">Costo</th>
              {editable && <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {salida.lineas.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2 font-medium">{l.producto.nombre}</td>
                {conteo && <td className="px-4 py-2 text-right font-mono text-stone-600">{l.stock_inicial !== null ? formatoCantidad(l.stock_inicial) : "—"}</td>}
                {conteo && <td className="px-4 py-2 text-right font-mono text-stone-600">{l.stock_contado !== null ? formatoCantidad(l.stock_contado) : "—"}</td>}
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono font-medium text-red-700">
                  −{formatoCantidad(l.cantidad)} <span className="text-xs text-stone-400">{l.producto.unidad}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-stone-600">{l.costo_unitario !== null ? formatoPesos(l.costo_unitario) : "—"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{l.costo_unitario !== null ? formatoPesos(l.costo_unitario * l.cantidad) : "sin costo"}</td>
                {editable && <td className="px-4 py-2 text-right"><BotonEliminarMovimiento que="movimiento" id={l.id} volverA={salida.lineas.length === 1 ? "/stock/movimientos" : undefined} confirmacion={`¿Eliminar ${l.producto.nombre} de esta salida?${salida.lineas.length === 1 ? " Es el único producto: se borra la salida completa." : ""}`} /></td>}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-300 font-semibold">
            <tr>
              <td className="px-4 py-3" colSpan={conteo ? 5 : 3}>Total</td>
              <td className="px-4 py-3 text-right font-mono">{formatoPesos(salida.costoTotal)}</td>
              {editable && <td />}
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
