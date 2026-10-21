import Link from "next/link";
import { NOMBRE_ESTADO_MOVIMIENTO, NOMBRE_MEDIO_PAGO, type Transaccion } from "@/lib/financiero/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { BotonEliminar } from "./boton-eliminar-transaccion";

export function TablaMovimientos({
  transacciones,
  editable,
  volverA,
  mostrarEvento = true,
}: {
  transacciones: Transaccion[];
  editable: boolean;
  /** Pantalla a la que se vuelve después de editar. */
  volverA: string;
  mostrarEvento?: boolean;
}) {
  const columnas = 5 + (mostrarEvento ? 1 : 0) + (editable ? 1 : 0);

  return (
    <div className="tarjeta overflow-x-auto p-0">
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
              <td className="whitespace-nowrap px-4 py-3 text-stone-600">{formatoFecha(t.fecha)}</td>
              <td className="px-4 py-3">
                <p className="font-medium">
                  {t.descripcion}
                  {t.estado !== "real" && (
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
                </p>
                {t.contraparte && <p className="text-xs text-stone-500">{t.contraparte}</p>}
              </td>
              <td className="px-4 py-3 text-stone-600">{t.categoria.nombre}</td>
              {mostrarEvento && (
                <td className="px-4 py-3">
                  {t.evento ? (
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
                <td className="whitespace-nowrap px-4 py-3 text-right">
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
  );
}
