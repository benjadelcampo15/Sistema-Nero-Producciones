import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import {
  LIMITE_LISTADO,
  leerFiltros,
  obtenerCategorias,
  obtenerEventosResumidos,
  obtenerTransacciones,
} from "@/lib/financiero/consultas";
import { NOMBRE_MEDIO_PAGO } from "@/lib/financiero/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../sin-acceso";
import { BotonEliminar } from "./boton-eliminar";

export default async function PaginaFinanciero({ searchParams }: PageProps<"/financiero">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "financiero", "editar");

  const parametros = await searchParams;
  const filtros = leerFiltros(parametros);
  const [{ transacciones, truncado, totales }, categorias, eventos] = await Promise.all([
    obtenerTransacciones(filtros),
    obtenerCategorias({ incluirInactivas: true }),
    obtenerEventosResumidos(),
  ]);

  const consulta = new URLSearchParams(
    Object.entries(filtros).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""),
  ).toString();
  const volverA = `/financiero?${consulta}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Financiero</h1>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Link href="/financiero/categorias" className="boton-secundario">Categorías</Link>
          )}
          <a href={`/financiero/exportar?${consulta}`} className="boton-secundario">Exportar a Excel</a>
          {editable && (
            <Link href={`/financiero/nuevo?volver_a=${encodeURIComponent(volverA)}`} className="boton">
              + Nuevo movimiento
            </Link>
          )}
        </div>
      </div>

      {/* Filtros: formulario GET, quedan en la URL y se pueden compartir. */}
      <form className="tarjeta grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <label htmlFor="desde" className="etiqueta">Desde</label>
          <input id="desde" name="desde" type="date" defaultValue={filtros.desde} className="campo" />
        </div>
        <div>
          <label htmlFor="hasta" className="etiqueta">Hasta</label>
          <input id="hasta" name="hasta" type="date" defaultValue={filtros.hasta} className="campo" />
        </div>
        <div>
          <label htmlFor="tipo" className="etiqueta">Tipo</label>
          <select id="tipo" name="tipo" defaultValue={filtros.tipo ?? ""} className="campo">
            <option value="">Todos</option>
            <option value="ingreso">Ingresos</option>
            <option value="egreso">Egresos</option>
          </select>
        </div>
        <div>
          <label htmlFor="categoria" className="etiqueta">Categoría</label>
          <select id="categoria" name="categoria" defaultValue={filtros.categoria ?? ""} className="campo">
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.tipo === "ingreso" ? "ing." : "egr."})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="evento" className="etiqueta">Evento</label>
          <select id="evento" name="evento" defaultValue={filtros.evento ?? ""} className="campo">
            <option value="">Todos</option>
            <option value="sin">Sin evento</option>
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="q" className="etiqueta">Buscar</label>
          <input id="q" name="q" defaultValue={filtros.q ?? ""} placeholder="Descripción o proveedor" className="campo" />
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <button type="submit" className="boton">Filtrar</button>
          <Link href="/financiero" className="boton-secundario">Mes actual</Link>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <Total titulo="Ingresos" monto={totales.ingresos} color="text-green-700" />
        <Total titulo="Egresos" monto={totales.egresos} color="text-red-700" />
        <Total
          titulo="Resultado"
          monto={totales.resultado}
          color={totales.resultado >= 0 ? "text-stone-900" : "text-red-700"}
        />
      </div>

      {truncado && (
        <p className="alerta-error">
          Hay más de {LIMITE_LISTADO} movimientos en este período: se muestran los más recientes y los totales no están completos. Acotá las fechas.
        </p>
      )}

      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Evento</th>
              <th className="px-4 py-3">Medio</th>
              <th className="px-4 py-3 text-right">Monto</th>
              {editable && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {transacciones.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-stone-500">
                  No hay movimientos con estos filtros.
                </td>
              </tr>
            )}
            {transacciones.map((t) => (
              <tr key={t.id} className="hover:bg-stone-50">
                <td className="whitespace-nowrap px-4 py-3 text-stone-600">{formatoFecha(t.fecha)}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{t.descripcion}</p>
                  {t.contraparte && <p className="text-xs text-stone-500">{t.contraparte}</p>}
                </td>
                <td className="px-4 py-3 text-stone-600">{t.categoria.nombre}</td>
                <td className="px-4 py-3">
                  {t.evento ? (
                    <Link href={`/eventos/${t.evento.id}`} className="text-stone-900 underline decoration-stone-300 hover:decoration-stone-900">
                      {t.evento.nombre}
                    </Link>
                  ) : (
                    <span className="text-stone-400">—</span>
                  )}
                </td>
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
      <p className="text-xs text-stone-500">{transacciones.length} movimientos</p>
    </div>
  );
}

function Total({ titulo, monto, color }: { titulo: string; monto: number; color: string }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{titulo}</p>
      <p className={`mt-1 font-mono text-2xl font-semibold ${color}`}>{formatoPesos(monto)}</p>
    </div>
  );
}
