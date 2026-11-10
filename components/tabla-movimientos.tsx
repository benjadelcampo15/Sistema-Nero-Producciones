import Link from "next/link";
import { NOMBRE_ESTADO_MOVIMIENTO, NOMBRE_MEDIO_PAGO, type Categoria, type EventoResumido, type Transaccion } from "@/lib/financiero/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { BotonEliminar } from "./boton-eliminar-transaccion";
import { SelectorEstado } from "./selector-estado";
import { RegistrarPago } from "./registrar-pago";
import { CeldaCategoria, CeldaEvento, CeldaFecha } from "./celdas-movimiento";

export function TablaMovimientos({
  transacciones,
  editable,
  volverA,
  mostrarEvento = true,
  categorias,
  eventos,
}: {
  transacciones: Transaccion[];
  editable: boolean;
  /** Pantalla a la que se vuelve después de editar. */
  volverA: string;
  mostrarEvento?: boolean;
  /** Con categorías y eventos, la fecha, la categoría y el evento se editan en la misma lista. */
  categorias?: Categoria[];
  eventos?: EventoResumido[];
}) {
  const columnas = 5 + (mostrarEvento ? 1 : 0) + (editable ? 1 : 0);
  const rapida = editable && categorias !== undefined && eventos !== undefined;

  return (
    <>
    {/* Celular: una tarjeta por movimiento. */}
    <div className="space-y-2 md:hidden">
      {transacciones.length === 0 && <p className="tarjeta p-6 text-center text-sm text-stone-500">No hay movimientos.</p>}
      {transacciones.map((t) => (
        <article key={t.id} className="tarjeta space-y-2 p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 font-medium">{t.descripcion}</p>
            <p className={`shrink-0 font-mono font-semibold ${t.tipo === "ingreso" ? "text-green-700" : "text-red-700"}`}>
              {t.tipo === "ingreso" ? "+" : "−"} {formatoPesos(t.monto)}
            </p>
          </div>
          {rapida ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-stone-500">
              <CeldaFecha t={t} />
              <CeldaCategoria t={t} categorias={categorias} />
              {mostrarEvento && (
                <div className="col-span-2">
                  <CeldaEvento t={t} eventos={eventos} />
                </div>
              )}
              <p className="col-span-2">
                {NOMBRE_MEDIO_PAGO[t.medio_pago]}
                {t.contraparte && ` · ${t.contraparte}`}
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-stone-500">
                {t.fecha ? formatoFecha(t.fecha) : <span className="text-amber-700">Sin fecha</span>}
                {" · "}
                {t.categoria.nombre}
                {" · "}
                {NOMBRE_MEDIO_PAGO[t.medio_pago]}
                {t.contraparte && ` · ${t.contraparte}`}
              </p>
              {mostrarEvento && t.evento && (
                <Link href={`/eventos/${t.evento.id}`} className="block text-xs underline decoration-stone-300">{t.evento.nombre}</Link>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {editable ? (
              <SelectorEstado key={t.estado} id={t.id} estado={t.estado} t={t} />
            ) : (
              t.estado !== "real" && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${t.estado === "pendiente" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>
                  {NOMBRE_ESTADO_MOVIMIENTO[t.estado]}
                </span>
              )
            )}
            {t.facturado && <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-stone-600">Fact.</span>}
            {editable && (
              <span className="ml-auto flex items-center gap-3">
                {t.estado !== "real" && <RegistrarPago t={t} />}
                <Link href={`/financiero/${t.id}/editar?volver_a=${encodeURIComponent(volverA)}`} className="text-xs text-stone-600 hover:text-stone-900">Editar</Link>
                <BotonEliminar id={t.id} descripcion={t.descripcion} />
              </span>
            )}
          </div>
        </article>
      ))}
    </div>

    <div className="tarjeta hidden overflow-x-auto p-0 md:block">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-4 py-3">Fecha</th>
            <th className="px-4 py-3">Descripción</th>
            <th className="px-4 py-3">Categoría</th>
            {mostrarEvento && <th className="px-4 py-3">Evento</th>}
            <th className="px-4 py-3">Medio</th>
            <th className="px-4 py-3 text-right">Monto</th>
            {editable && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {transacciones.length === 0 && (
            <tr>
              <td colSpan={columnas} className="px-4 py-10 text-center text-stone-500">
                No hay movimientos.
              </td>
            </tr>
          )}
          {transacciones.map((t) => (
            <tr key={t.id} className="hover:bg-stone-50">
              <td className="whitespace-nowrap px-4 py-3 text-stone-600">
                {rapida ? <CeldaFecha t={t} /> : t.fecha ? formatoFecha(t.fecha) : <span className="text-amber-700">Sin fecha</span>}
              </td>
              <td className="px-4 py-3">
                <div className="font-medium">
                  {t.descripcion}
                  {editable ? (
                    <span className="ml-2 inline-block align-middle">
                      <SelectorEstado key={t.estado} id={t.id} estado={t.estado} t={t} />
                    </span>
                  ) : t.estado !== "real" && (
                    <span
                      className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        t.estado === "pendiente" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"
                      }`}
                    >
                      {NOMBRE_ESTADO_MOVIMIENTO[t.estado]}
                    </span>
                  )}
                  {t.facturado && (
                    <span className="ml-1 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-stone-600">
                      Fact.
                    </span>
                  )}
                </div>
                {t.contraparte && <p className="text-xs text-stone-500">{t.contraparte}</p>}
              </td>
              <td className="px-4 py-3 text-stone-600">{rapida ? <CeldaCategoria t={t} categorias={categorias} /> : t.categoria.nombre}</td>
              {mostrarEvento && (
                <td className="px-4 py-3">
                  {rapida ? (
                    <CeldaEvento t={t} eventos={eventos} />
                  ) : t.evento ? (
                    <Link
                      href={`/eventos/${t.evento.id}`}
                      className="text-stone-900 underline decoration-stone-300 hover:decoration-stone-900"
                    >
                      {t.evento.nombre}
                    </Link>
                  ) : (
                    <span className="text-stone-400">—</span>
                  )}
                </td>
              )}
              <td className="whitespace-nowrap px-4 py-3 text-stone-600">{NOMBRE_MEDIO_PAGO[t.medio_pago]}</td>
              <td
                className={`whitespace-nowrap px-4 py-3 text-right font-mono font-medium ${
                  t.tipo === "ingreso" ? "text-green-700" : "text-red-700"
                }`}
              >
                {t.tipo === "ingreso" ? "+" : "−"} {formatoPesos(t.monto)}
              </td>
              {editable && (
                <td className="space-x-2 whitespace-nowrap px-4 py-3 text-right">
                  {t.estado !== "real" && <RegistrarPago t={t} />}
                  <Link
                    href={`/financiero/${t.id}/editar?volver_a=${encodeURIComponent(volverA)}`}
                    className="text-xs text-stone-600 hover:text-stone-900"
                  >
                    Editar
                  </Link>
                  <BotonEliminar id={t.id} descripcion={t.descripcion} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
