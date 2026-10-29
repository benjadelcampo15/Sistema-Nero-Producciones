"use client";

import { useState, useTransition } from "react";
import { guardarMinimos } from "@/lib/pedidos/acciones";
import { formatoCantidad } from "@/lib/stock/tipos";
import { parsearMonto } from "@/lib/formato";

type Fila = { id: string; nombre: string; unidad: string; codigo: string | null; stock: number; minimo: number };

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
const aTexto = (n: number) => (n ? String(n).replace(".", ",") : "");

/** Stock mínimo de cada producto: por debajo, aparece como faltante al armar un pedido. */
export function FormularioMinimos({ productos }: { productos: Fila[] }) {
  const [pendiente, iniciar] = useTransition();
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(productos.map((p) => [p.id, aTexto(p.minimo)])));
  const [guardados, setGuardados] = useState<Record<string, number>>(() => Object.fromEntries(productos.map((p) => [p.id, p.minimo])));
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState<{ error?: string; ok?: string }>({});

  const leer = (t: string) => {
    if (!t.trim()) return 0;
    const v = /^\d+(\.\d{1,3})?$/.test(t.trim()) ? Number(t.trim()) : parsearMonto(t);
    return v === null || !Number.isFinite(v) ? NaN : v;
  };
  const cambios = Object.fromEntries(
    Object.entries(valores)
      .map(([id, t]) => [id, leer(t)] as const)
      .filter(([id, v]) => !Number.isNaN(v) && v !== guardados[id]),
  );
  const malos = Object.values(valores).filter((t) => Number.isNaN(leer(t))).length;
  const termino = normalizar(busqueda.trim());
  const visibles = productos.filter((p) => !termino || normalizar(`${p.nombre} ${p.codigo ?? ""}`).includes(termino));

  function guardar() {
    if (malos) return setMensaje({ error: "Hay un mínimo mal escrito (marcado en rojo)" });
    iniciar(async () => {
      const r = await guardarMinimos(cambios);
      setMensaje(r);
      if (!r.error) setGuardados((g) => ({ ...g, ...cambios }));
    });
  }

  return (
    <div className="space-y-3">
      <input type="search" autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto…" className="campo" />
      <div className="max-h-[65vh] overflow-auto rounded-md border border-stone-200 bg-white">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2 text-right">Stock actual</th>
              <th className="w-36 px-3 py-2 text-right">Mínimo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {visibles.map((p) => {
              const v = leer(valores[p.id] ?? "");
              return (
                <tr key={p.id} className={Number.isNaN(v) ? "bg-red-50" : v !== guardados[p.id] ? "bg-amber-50" : ""}>
                  <td className="px-3 py-1.5 font-medium">{p.nombre}</td>
                  <td className={`whitespace-nowrap px-3 py-1.5 text-right font-mono ${v > 0 && p.stock < v ? "text-red-700" : "text-stone-600"}`}>
                    {formatoCantidad(p.stock)} <span className="text-xs text-stone-400">{p.unidad}</span>
                  </td>
                  <td className="px-2 py-1">
                    <input
                      aria-label={`Mínimo de ${p.nombre}`}
                      inputMode="decimal"
                      value={valores[p.id] ?? ""}
                      placeholder="0"
                      onChange={(e) => setValores((x) => ({ ...x, [p.id]: e.target.value }))}
                      className="campo py-1 text-right font-mono"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-stone-200 bg-white/95 py-3">
        <button type="button" onClick={guardar} disabled={pendiente || !Object.keys(cambios).length} className="boton">
          {pendiente ? "Guardando…" : `Guardar${Object.keys(cambios).length ? ` (${Object.keys(cambios).length})` : ""}`}
        </button>
        {mensaje.error && <p className="text-sm text-red-700">{mensaje.error}</p>}
        {mensaje.ok && <p className="text-sm text-green-700">{mensaje.ok}</p>}
      </div>
    </div>
  );
}
