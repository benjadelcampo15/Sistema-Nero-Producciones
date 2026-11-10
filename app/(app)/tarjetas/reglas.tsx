"use client";

import { useState, useTransition } from "react";
import { NOMBRE_EMPRESA } from "@/lib/empresas";
import { borrarRegla } from "@/lib/tarjetas/acciones";
import type { Regla } from "@/lib/tarjetas/tipos";

/** Las asignaciones aprendidas (se crean al asignar un consumo; acá solo se ven y se borran). */
export function ListaReglas({ reglas, editable }: { reglas: Regla[]; editable: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="space-y-2">
      <button type="button" onClick={() => setAbierta(!abierta)} className="font-semibold">
        {abierta ? "▾" : "▸"} Reglas aprendidas ({reglas.length})
      </button>
      {abierta && (
        <div className="tarjeta space-y-2">
          <p className="text-sm text-stone-500">
            Cuando asignás un consumo, se recuerda por el comienzo de la descripción (sin los códigos de operación) y se aplica a los consumos iguales de los
            resúmenes siguientes.
          </p>
          {error && <p className="alerta-error">{error}</p>}
          {reglas.length === 0 ? (
            <p className="text-sm text-stone-500">Todavía no hay reglas.</p>
          ) : (
            <table className="tabla-movil w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="py-1 pr-3">Descripción empieza con</th>
                  <th className="py-1 pr-3">Empresa</th>
                  <th className="py-1 pr-3">Detalle</th>
                  {editable && <th />}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {reglas.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1 pr-3 font-mono">{r.clave}</td>
                    <td className="py-1 pr-3">{r.ambigua ? <span className="text-stone-500">Las dos (se elige a mano)</span> : r.empresa ? NOMBRE_EMPRESA[r.empresa] : "—"}</td>
                    <td className="py-1 pr-3">{r.detalle ?? "—"}</td>
                    {editable && (
                      <td className="py-1 text-right">
                        <button
                          type="button"
                          disabled={pendiente}
                          onClick={() =>
                            iniciar(async () => {
                              const res = await borrarRegla(r.id);
                              setError(res.error ?? null);
                            })
                          }
                          className="text-xs text-red-700 hover:underline"
                        >
                          Borrar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
