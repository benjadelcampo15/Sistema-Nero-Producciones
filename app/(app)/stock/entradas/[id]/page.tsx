import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerEntrada } from "@/lib/stock/consultas";
import { formatoCantidad } from "@/lib/stock/tipos";
import { formatoFecha, formatoFechaHora, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../../../sin-acceso";
import { BotonEliminarMovimiento } from "../../boton-eliminar-movimiento";
import { EtiquetaEliminado, NotaEliminado } from "../../nota-eliminado";

export default async function PaginaEntrada({ params }: PageProps<"/stock/entradas/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;
  const { id } = await params;
  const entrada = await obtenerEntrada(id);
  if (!entrada) notFound();
  const editable = puede(usuario, "stock", "editar") && !entrada.eliminado_en;
  const vigentes = entrada.lineas.filter((l) => !l.eliminado_en).length;
  const confirmarLinea = (nombre: string) =>
    `¿Eliminar ${nombre} de esta entrada?${vigentes === 1 ? " Es el único producto que queda: se elimina la entrada completa." : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/stock/movimientos" className="text-sm text-stone-500 hover:text-stone-900">← Movimientos de stock</Link>
          <h1 className="mt-1 text-2xl font-semibold">
            Entrada · {entrada.deposito.nombre}
            {entrada.eliminado_en && <EtiquetaEliminado />}
          </h1>
          <p className="text-sm text-stone-500">
            {formatoFecha(entrada.fecha)}
            {entrada.evento && (
              <>
                {" · "}
                <Link href={`/eventos/${entrada.evento.id}`} className="underline">{entrada.evento.nombre}</Link>
              </>
            )}
            {entrada.motivo && ` · ${entrada.motivo}`}
          </p>
        </div>
        {editable && (
          <BotonEliminarMovimiento
            que="entrada"
            id={entrada.id}
            texto="Eliminar entrada"
            confirmacion={`¿Eliminar la entrada completa (${entrada.productos} ${entrada.productos === 1 ? "producto" : "productos"})?`}
            className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          />
        )}
      </div>

      {entrada.eliminado_en && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-semibold">Entrada eliminada el {formatoFechaHora(entrada.eliminado_en)}</span>
          {entrada.motivo_eliminacion && `: ${entrada.motivo_eliminacion}`}. No cuenta para el stock.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="tarjeta p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">Productos</p>
          <p className="mt-1 font-mono text-xl font-semibold">{entrada.productos}</p>
        </div>
        <div className="tarjeta p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">Costo de la entrada</p>
          <p className={`mt-1 font-mono text-xl font-semibold ${entrada.eliminado_en ? "text-stone-400 line-through" : ""}`}>{formatoPesos(entrada.costoTotal)}</p>
          {entrada.sinCosto > 0 && <p className="text-xs text-amber-700">{entrada.sinCosto} productos sin costo cargado no suman</p>}
        </div>
      </div>

      {/* Celular: una fila compacta por producto. */}
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white md:hidden">
        {entrada.lineas.map((l) => (
          <li key={l.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${l.eliminado_en && !entrada.eliminado_en ? "bg-stone-50 text-stone-400" : ""}`}>
            <div className="min-w-0">
              <p className="font-medium leading-tight">{l.producto.nombre}</p>
              {l.costo_unitario !== null && <p className="text-xs text-stone-500">{formatoPesos(l.costo_unitario)} c/u</p>}
              {l.eliminado_en && !entrada.eliminado_en && <NotaEliminado en={l.eliminado_en} motivo={l.motivo_eliminacion} />}
            </div>
            <div className="shrink-0 text-right">
              <p className={`font-mono font-semibold ${l.eliminado_en ? "text-stone-400 line-through" : "text-green-700"}`}>
                +{formatoCantidad(l.cantidad)} <span className="text-xs font-normal text-stone-400">{l.producto.unidad}</span>
              </p>
              <p className="font-mono text-xs text-stone-500">{l.costo_unitario !== null ? formatoPesos(l.costo_unitario * l.cantidad) : "sin costo"}</p>
              {editable && !l.eliminado_en && <BotonEliminarMovimiento que="movimiento" id={l.id} confirmacion={confirmarLinea(l.producto.nombre)} />}
            </div>
          </li>
        ))}
        <li className="flex justify-between px-4 py-3 font-semibold">
          <span>Total</span>
          <span className="font-mono">{formatoPesos(entrada.costoTotal)}</span>
        </li>
      </ul>

      <section className="tarjeta hidden overflow-x-auto p-0 md:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3 text-right">Entró</th>
              <th className="px-4 py-3 text-right">Costo unit.</th>
              <th className="px-4 py-3 text-right">Costo</th>
              {editable && <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {entrada.lineas.map((l) => (
              <tr key={l.id} className={l.eliminado_en && !entrada.eliminado_en ? "bg-stone-50 text-stone-400" : ""}>
                <td className="px-4 py-2 font-medium">
                  {l.producto.nombre}
                  {l.eliminado_en && !entrada.eliminado_en && <NotaEliminado en={l.eliminado_en} motivo={l.motivo_eliminacion} />}
                </td>
                <td className={`whitespace-nowrap px-4 py-2 text-right font-mono font-medium ${l.eliminado_en ? "text-stone-400 line-through" : "text-green-700"}`}>
                  +{formatoCantidad(l.cantidad)} <span className="text-xs text-stone-400">{l.producto.unidad}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-stone-600">{l.costo_unitario !== null ? formatoPesos(l.costo_unitario) : "—"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{l.costo_unitario !== null ? formatoPesos(l.costo_unitario * l.cantidad) : "sin costo"}</td>
                {editable && (
                  <td className="px-4 py-2 text-right">
                    {!l.eliminado_en && <BotonEliminarMovimiento que="movimiento" id={l.id} confirmacion={confirmarLinea(l.producto.nombre)} />}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-300 font-semibold">
            <tr>
              <td className="px-4 py-3" colSpan={3}>Total</td>
              <td className="px-4 py-3 text-right font-mono">{formatoPesos(entrada.costoTotal)}</td>
              {editable && <td />}
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
