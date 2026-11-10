"use client";

import { useState, type ReactNode } from "react";
import type { ResumenEventoCuenta } from "@/lib/cuentas/tipos";
import { formatoPesos } from "@/lib/formato";

/**
 * Extracto de la cuenta corriente con filtro por evento: muestra solo las filas
 * de ese evento y su resumen (deuda, pagado y lo que falta), sin perder el saldo general.
 */
export function ExtractoConFiltro({
  eventos,
  saldoGeneral,
  encabezado,
  filas,
  vacio,
}: {
  eventos: ResumenEventoCuenta[];
  saldoGeneral: number;
  encabezado: ReactNode;
  filas: { clave: string; eventos: string[]; fila: ReactNode }[];
  vacio: ReactNode;
}) {
  const [evento, setEvento] = useState("");
  const elegido = eventos.find((e) => e.id === evento);
  const visibles = elegido ? filas.filter((f) => f.eventos.includes(elegido.id)) : filas;

  return (
    <div className="space-y-2">
      {eventos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="filtro_evento" className="text-sm text-stone-600">Evento</label>
          <select id="filtro_evento" value={evento} onChange={(e) => setEvento(e.target.value)} className="campo w-auto max-w-xs py-1 text-sm">
            <option value="">Todos los movimientos</option>
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
          {elegido && (
            <p className="text-sm text-stone-600">
              <span className="font-medium text-stone-900">{elegido.nombre}:</span> deuda {formatoPesos(elegido.total)} · pagado {formatoPesos(elegido.pagado)} ·{" "}
              <span className="font-semibold text-stone-900">falta {formatoPesos(elegido.pendiente)}</span>
              <span className="text-stone-400"> (saldo general de la cuenta: {formatoPesos(saldoGeneral)})</span>
            </p>
          )}
        </div>
      )}
      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          {encabezado}
          <tbody className="divide-y divide-stone-100">
            {filas.length === 0 && vacio}
            {visibles.map((f) => (
              <FilaClave key={f.clave}>{f.fila}</FilaClave>
            ))}
          </tbody>
        </table>
      </div>
      {elegido && <p className="text-xs text-stone-500">La columna Saldo es el acumulado de toda la cuenta (con todos los eventos).</p>}
    </div>
  );
}

function FilaClave({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
