"use client";

import { useState } from "react";
import Link from "next/link";
import { formatoCantidad, type Deposito, type FilaStock } from "@/lib/stock/tipos";
import { formatoPesos } from "@/lib/formato";

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Stock con buscador: la lista se filtra mientras se escribe (sin ir al servidor). */
export function ListaStock({ stock, depositos, depositoId }: { stock: FilaStock[]; depositos: Deposito[]; depositoId: string | null }) {
  const [busqueda, setBusqueda] = useState("");
  const termino = normalizar(busqueda.trim());
  const deposito = depositos.find((d) => d.id === depositoId);

  // En la vista de un depósito se muestran solo los productos que tienen (o tuvieron) stock ahí.
  const filas = (deposito ? stock.filter((f) => deposito.id in f.porDeposito) : stock).filter(
    (f) => !termino || normalizar(`${f.producto.nombre} ${f.producto.codigo ?? ""}`).includes(termino),
  );
  const cantidadDe = (f: FilaStock) => (deposito ? (f.porDeposito[deposito.id] ?? 0) : f.total);
  const valorTotal = filas.reduce((t, f) => t + (f.costoPromedio ?? 0) * Math.max(cantidadDe(f), 0), 0);
  const bajoMinimo = filas.filter((f) => f.producto.stock_minimo > 0 && f.total < f.producto.stock_minimo).length;

  return (
    <>
      <div className="relative" role="search">
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z" clipRule="evenodd" />
        </svg>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          enterKeyHint="search"
          placeholder="Buscar producto por nombre o código…"
          aria-label="Buscar producto"
          className="campo h-11 pl-10 pr-20 text-base md:text-sm"
        />
        {busqueda && (
          <button type="button" onClick={() => setBusqueda("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-stone-500 hover:text-stone-900">
            Limpiar
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Indicador titulo="Productos" valor={String(filas.length)} />
        <Indicador titulo="Valor a costo" valor={formatoPesos(valorTotal)} />
        <Indicador titulo="Bajo el mínimo" valor={String(bajoMinimo)} alerta={bajoMinimo > 0} />
      </div>

      {/* Celular: una tarjeta por producto. */}
      <div className="space-y-2 md:hidden">
        {filas.length === 0 && (
          <p className="tarjeta p-6 text-center text-sm text-stone-500">
            {termino ? `Ningún producto coincide con “${busqueda}”.` : `No hay productos${deposito ? " en este depósito" : ""}. Se crean en Productos o al aprobar una factura de compra.`}
          </p>
        )}
        {filas.map((f) => {
          const bajo = f.producto.stock_minimo > 0 && f.total < f.producto.stock_minimo;
          const cantidad = cantidadDe(f);
          return (
            <Link
              key={f.producto.id}
              href={`/stock/movimientos?producto=${f.producto.id}`}
              className={`block rounded-xl border bg-white p-3 shadow-sm active:bg-stone-50 ${bajo ? "border-red-200" : "border-stone-200"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium leading-tight">{f.producto.nombre}</p>
                  {bajo && <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Bajo mínimo</span>}
                </div>
                <p className="shrink-0 text-right">
                  <span className="font-mono text-xl font-semibold">{formatoCantidad(cantidad)}</span>
                  <span className="block text-xs text-stone-500">{f.producto.unidad}</span>
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                {!deposito &&
                  depositos.map((d) => (
                    <span key={d.id}>
                      {d.nombre} <span className="font-mono text-stone-700">{formatoCantidad(f.porDeposito[d.id] ?? 0)}</span>
                    </span>
                  ))}
                {f.producto.stock_minimo > 0 && (
                  <span>
                    Mín. <span className="font-mono text-stone-700">{formatoCantidad(f.producto.stock_minimo)}</span>
                  </span>
                )}
                <span>
                  Costo <span className="font-mono text-stone-700">{f.costoPromedio !== null ? formatoPesos(f.costoPromedio) : "—"}</span>
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="tarjeta hidden overflow-x-auto p-0 md:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Producto</th>
              {deposito ? (
                <th className="px-4 py-3 text-right">Cantidad</th>
              ) : (
                <>
                  {depositos.map((d) => (
                    <th key={d.id} className="px-4 py-3 text-right">{d.nombre}</th>
                  ))}
                  <th className="px-4 py-3 text-right">Total</th>
                </>
              )}
              <th className="px-4 py-3 text-right">Mínimo</th>
              <th className="px-4 py-3 text-right">Costo prom.</th>
              <th className="px-4 py-3 text-right">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filas.length === 0 && (
              <tr>
                <td colSpan={depositos.length + 5} className="px-4 py-10 text-center text-stone-500">
                  {termino ? `Ningún producto coincide con “${busqueda}”.` : `No hay productos${deposito ? " en este depósito" : ""}. Se crean en Productos o al aprobar una factura de compra.`}
                </td>
              </tr>
            )}
            {filas.map((f) => {
              const bajo = f.producto.stock_minimo > 0 && f.total < f.producto.stock_minimo;
              const cantidad = cantidadDe(f);
              return (
                <tr key={f.producto.id} className={bajo ? "bg-red-50/60" : "hover:bg-stone-50"}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/stock/movimientos?producto=${f.producto.id}`}
                      className="font-medium underline decoration-stone-300 hover:decoration-stone-900"
                    >
                      {f.producto.nombre}
                    </Link>
                    <span className="ml-2 text-xs text-stone-500">{f.producto.unidad}</span>
                    {bajo && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Bajo mínimo</span>}
                  </td>
                  {deposito ? (
                    <td className="px-4 py-3 text-right font-mono font-semibold">{formatoCantidad(cantidad)}</td>
                  ) : (
                    <>
                      {depositos.map((d) => (
                        <td key={d.id} className="px-4 py-3 text-right font-mono text-stone-700">
                          {f.porDeposito[d.id] ? formatoCantidad(f.porDeposito[d.id]) : <span className="text-stone-300">0</span>}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-mono font-semibold">{formatoCantidad(f.total)}</td>
                    </>
                  )}
                  <td className="px-4 py-3 text-right font-mono text-stone-500">
                    {f.producto.stock_minimo ? formatoCantidad(f.producto.stock_minimo) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-stone-600">
                    {f.costoPromedio !== null ? formatoPesos(f.costoPromedio) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {f.costoPromedio !== null ? formatoPesos(f.costoPromedio * Math.max(cantidad, 0)) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Indicador({ titulo, valor, alerta = false }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="tarjeta min-w-0 p-3 sm:p-4">
      <p className="text-[10px] uppercase leading-tight tracking-wide text-stone-500 sm:text-xs">{titulo}</p>
      <p className={`mt-1 break-words font-mono text-sm font-semibold sm:text-xl ${alerta ? "text-red-700" : ""}`}>{valor}</p>
    </div>
  );
}