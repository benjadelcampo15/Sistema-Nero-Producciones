import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarDepositos, listarEntradas, listarMovimientos, listarProductos, listarSalidas, obtenerStock } from "@/lib/stock/consultas";
import { obtenerEventosResumidos } from "@/lib/financiero/consultas";
import { formatoCantidad } from "@/lib/stock/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../../sin-acceso";
import { NavegacionStock } from "../navegacion";
import { FormularioMovimiento } from "./formulario-movimiento";

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const ETIQUETA = {
  entrada: { texto: "Entrada", clase: "bg-green-100 text-green-800" },
  salida: { texto: "Salida", clase: "bg-red-100 text-red-800" },
  ajuste: { texto: "Ajuste", clase: "bg-amber-100 text-amber-800" },
};

export default async function PaginaMovimientosStock({ searchParams }: PageProps<"/stock/movimientos">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "stock", "editar");

  const { producto, deposito, q } = await searchParams;
  const filtroProducto = typeof producto === "string" ? producto : undefined;
  const filtroDeposito = typeof deposito === "string" ? deposito : undefined;
  const busqueda = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const termino = normalizar(busqueda);

  // Sin filtro de producto ni búsqueda, las salidas y entradas de varios productos se ven agrupadas (una fila por cada una).
  // Al buscar se ven producto por producto, así se encuentra cualquier producto de una salida o entrada.
  const agrupar = !filtroProducto && !termino;
  const [productos, depositos, movimientos, eventos, stock, salidas, entradas] = await Promise.all([
    listarProductos(),
    listarDepositos(),
    listarMovimientos({ producto: filtroProducto, deposito: filtroDeposito, sinSalidas: agrupar }),
    editable ? obtenerEventosResumidos() : [],
    editable ? obtenerStock() : [],
    agrupar ? listarSalidas({ deposito: filtroDeposito }) : [],
    agrupar ? listarEntradas({ deposito: filtroDeposito }) : [],
  ]);
  const historial = [
    ...movimientos.map((m) => ({ clave: m.fecha + m.creado_en, movimiento: m, salida: null, entrada: null })),
    ...salidas.map((s) => ({ clave: s.fecha + s.creado_en, movimiento: null, salida: s, entrada: null })),
    ...entradas.map((e) => ({ clave: e.fecha + e.creado_en, movimiento: null, salida: null, entrada: e })),
  ]
    .sort((a, b) => b.clave.localeCompare(a.clave))
    .filter(({ movimiento: m, salida: s }) => {
      // Las entradas agrupadas solo aparecen sin búsqueda.
      if (!termino) return true;
      const texto = m
        ? [m.producto.nombre, m.deposito.nombre, m.motivo, m.evento?.nombre, m.transferencia_id ? "transferencia" : ETIQUETA[m.tipo].texto, m.salida_id ? "salida por conteo" : "", formatoFecha(m.fecha)]
        : [s!.deposito.nombre, s!.motivo, s!.evento?.nombre, "salida por conteo", formatoFecha(s!.fecha)];
      return normalizar(texto.filter(Boolean).join(" ")).includes(termino);
    });
  const productoFiltrado = productos.find((p) => p.id === filtroProducto);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Stock</h1>
      <NavegacionStock actual="/stock/movimientos" />

      {editable &&
        (productos.length && depositos.length ? (
          <FormularioMovimiento productos={productos} depositos={depositos} eventos={eventos} productoInicial={filtroProducto} stock={stock} />
        ) : (
          <p className="tarjeta text-sm text-stone-600">
            Para registrar movimientos primero creá un <Link href="/stock/productos" className="underline">producto</Link>.
          </p>
        ))}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Historial</h2>
          {termino && (
            <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs">
              {historial.length} {historial.length === 1 ? "resultado" : "resultados"} para “{busqueda}”
            </span>
          )}
          {productoFiltrado && (
            <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs">
              {productoFiltrado.nombre} ·{" "}
              <Link href="/stock/movimientos" className="underline">ver todos</Link>
            </span>
          )}
        </div>
        <form className="relative" role="search">
          {filtroProducto && <input type="hidden" name="producto" value={filtroProducto} />}
          {filtroDeposito && <input type="hidden" name="deposito" value={filtroDeposito} />}
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z" clipRule="evenodd" />
          </svg>
          <input
            type="search"
            name="q"
            defaultValue={busqueda}
            enterKeyHint="search"
            placeholder="Buscar por producto, depósito, motivo, evento o tipo…"
            aria-label="Buscar movimientos"
            className="campo h-11 pl-10 pr-24 text-base md:text-sm"
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {busqueda && (
              <Link
                href={`/stock/movimientos${filtroProducto || filtroDeposito ? `?${new URLSearchParams({ ...(filtroProducto ? { producto: filtroProducto } : {}), ...(filtroDeposito ? { deposito: filtroDeposito } : {}) })}` : ""}`}
                className="rounded px-2 py-1 text-xs text-stone-500 hover:text-stone-900"
              >
                Limpiar
              </Link>
            )}
            <button type="submit" className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white">Buscar</button>
          </div>
        </form>

        {/* Celular: una tarjeta por movimiento. */}
        <div className="space-y-2 md:hidden">
          {historial.length === 0 && <p className="tarjeta p-6 text-center text-sm text-stone-500">{termino ? `Ningún movimiento coincide con “${busqueda}”.` : "No hay movimientos."}</p>}
          {historial.map(({ movimiento: m, salida: s, entrada: e }) =>
            e ? (
              <Link key={e.id} href={`/stock/entradas/${e.id}`} className="block rounded-xl border border-stone-200 bg-white p-3 shadow-sm active:bg-stone-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ETIQUETA.entrada.clase}`}>Entrada</span>
                    <p className="mt-1 font-medium">
                      {e.productos} {e.productos === 1 ? "producto" : "productos"} · {e.deposito.nombre}
                    </p>
                  </div>
                  <p className="shrink-0 text-right font-mono font-semibold">{formatoPesos(e.costoTotal)}</p>
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  {formatoFecha(e.fecha)}
                  {e.motivo && ` · ${e.motivo}`}
                  {e.sinCosto > 0 && <span className="text-amber-700"> · {e.sinCosto} sin costo</span>}
                  <span className="font-medium text-stone-900 underline"> · ver detalle</span>
                </p>
              </Link>
            ) : s ? (
              <Link key={s.id} href={`/stock/salidas/${s.id}`} className="block rounded-xl border border-stone-200 bg-white p-3 shadow-sm active:bg-stone-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ETIQUETA.salida.clase}`}>{s.modo === "conteo" ? "Salida por conteo" : "Salida"}</span>
                    <p className="mt-1 font-medium">
                      {s.productos} {s.productos === 1 ? "producto" : "productos"} · {s.deposito.nombre}
                    </p>
                  </div>
                  <p className="shrink-0 text-right font-mono font-semibold">{formatoPesos(s.costoTotal)}</p>
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  {formatoFecha(s.fecha)}
                  {s.evento && ` · ${s.evento.nombre}`}
                  {s.sinCosto > 0 && <span className="text-amber-700"> · {s.sinCosto} sin costo</span>}
                  <span className="font-medium text-stone-900 underline"> · ver detalle</span>
                </p>
              </Link>
            ) : (
              m && (
                <div key={m.id} className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ETIQUETA[m.tipo].clase}`}>{m.transferencia_id ? "Transferencia" : ETIQUETA[m.tipo].texto}</span>
                      <p className="mt-1 font-medium leading-tight">{m.producto.nombre}</p>
                    </div>
                    <p className={`shrink-0 text-right font-mono text-lg font-semibold ${m.cantidad > 0 ? "text-green-700" : "text-red-700"}`}>
                      {m.cantidad > 0 ? "+" : "−"}
                      {formatoCantidad(Math.abs(m.cantidad))}
                      <span className="block text-xs font-normal text-stone-400">{m.producto.unidad}</span>
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {formatoFecha(m.fecha)} · {m.deposito.nombre}
                    {m.costo_unitario !== null && ` · ${formatoPesos(Math.abs(m.cantidad) * m.costo_unitario)}`}
                  </p>
                  {(m.motivo || m.evento || m.factura_id || m.salida_id || m.entrada_id || m.pedido_id) && (
                    <p className="mt-1 text-xs text-stone-600">
                      {m.motivo}
                      {m.evento && <Link href={`/eventos/${m.evento.id}`} className="ml-1 underline">({m.evento.nombre})</Link>}
                      {m.factura_id && <Link href={`/facturas/${m.factura_id}`} className="ml-1 underline">ver factura</Link>}
                      {m.salida_id && <Link href={`/stock/salidas/${m.salida_id}`} className="ml-1 underline">ver salida</Link>}
                      {m.entrada_id && <Link href={`/stock/entradas/${m.entrada_id}`} className="ml-1 underline">ver entrada</Link>}
                      {m.pedido_id && <Link href={`/stock/pedidos/${m.pedido_id}`} className="ml-1 underline">ver pedido</Link>}
                    </p>
                  )}
                </div>
              )
            ),
          )}
        </div>

        <div className="tarjeta hidden overflow-x-auto p-0 md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Depósito</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-right">Costo unit.</th>
                <th className="px-4 py-3 text-right">Costo total</th>
                <th className="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {historial.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-stone-500">{termino ? `Ningún movimiento coincide con “${busqueda}”.` : "No hay movimientos."}</td>
                </tr>
              )}
              {historial.map(({ movimiento: m, salida: s, entrada: e }) =>
                e ? (
                  <tr key={e.id} className="hover:bg-stone-50">
                    <td className="whitespace-nowrap px-4 py-3 text-stone-600">{formatoFecha(e.fecha)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ETIQUETA.entrada.clase}`}>Entrada</span>
                    </td>
                    <td className="px-4 py-3 font-medium">{e.productos} {e.productos === 1 ? "producto" : "productos"}</td>
                    <td className="px-4 py-3 text-stone-600">{e.deposito.nombre}</td>
                    <td className="px-4 py-3 text-right text-stone-400">—</td>
                    <td className="px-4 py-3 text-right text-stone-400">—</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-medium">
                      {formatoPesos(e.costoTotal)}
                      {e.sinCosto > 0 && <span className="block text-xs font-normal text-amber-700">{e.sinCosto} sin costo</span>}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {e.motivo}
                      {e.evento && <span className="ml-1">({e.evento.nombre})</span>}
                      <Link href={`/stock/entradas/${e.id}`} className="ml-1 font-medium text-stone-900 underline">ver detalle</Link>
                    </td>
                  </tr>
                ) : s ? (
                  <tr key={s.id} className="hover:bg-stone-50">
                    <td className="whitespace-nowrap px-4 py-3 text-stone-600">{formatoFecha(s.fecha)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ETIQUETA.salida.clase}`}>{s.modo === "conteo" ? "Salida por conteo" : "Salida"}</span>
                    </td>
                    <td className="px-4 py-3 font-medium">{s.productos} {s.productos === 1 ? "producto" : "productos"}</td>
                    <td className="px-4 py-3 text-stone-600">{s.deposito.nombre}</td>
                    <td className="px-4 py-3 text-right text-stone-400">—</td>
                    <td className="px-4 py-3 text-right text-stone-400">—</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-medium">
                      {formatoPesos(s.costoTotal)}
                      {s.sinCosto > 0 && <span className="block text-xs font-normal text-amber-700">{s.sinCosto} sin costo</span>}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {s.motivo}
                      {s.evento && <span className="ml-1">({s.evento.nombre})</span>}
                      <Link href={`/stock/salidas/${s.id}`} className="ml-1 font-medium text-stone-900 underline">ver detalle</Link>
                    </td>
                  </tr>
                ) : m && (
                <tr key={m.id} className="hover:bg-stone-50">
                  <td className="whitespace-nowrap px-4 py-3 text-stone-600">{formatoFecha(m.fecha)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ETIQUETA[m.tipo].clase}`}>
                      {m.transferencia_id ? "Transferencia" : ETIQUETA[m.tipo].texto}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{m.producto.nombre}</td>
                  <td className="px-4 py-3 text-stone-600">{m.deposito.nombre}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right font-mono font-medium ${m.cantidad > 0 ? "text-green-700" : "text-red-700"}`}>
                    {m.cantidad > 0 ? "+" : "−"}
                    {formatoCantidad(Math.abs(m.cantidad))} <span className="text-xs text-stone-400">{m.producto.unidad}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-stone-600">
                    {m.costo_unitario !== null ? formatoPesos(m.costo_unitario) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                    {m.costo_unitario !== null ? formatoPesos(Math.abs(m.cantidad) * m.costo_unitario) : "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {m.motivo}
                    {m.evento && (
                      <Link href={`/eventos/${m.evento.id}`} className="ml-1 underline">
                        ({m.evento.nombre})
                      </Link>
                    )}
                    {m.factura_id && (
                      <Link href={`/facturas/${m.factura_id}`} className="ml-1 underline">
                        ver factura
                      </Link>
                    )}
                    {m.salida_id && (
                      <Link href={`/stock/salidas/${m.salida_id}`} className="ml-1 underline">
                        ver salida
                      </Link>
                    )}
                    {m.entrada_id && (
                      <Link href={`/stock/entradas/${m.entrada_id}`} className="ml-1 underline">
                        ver entrada
                      </Link>
                    )}
                    {m.pedido_id && (
                      <Link href={`/stock/pedidos/${m.pedido_id}`} className="ml-1 underline">
                        ver pedido
                      </Link>
                    )}
                  </td>
                </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
