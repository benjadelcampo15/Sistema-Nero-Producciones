"use client";

import { useState, useTransition } from "react";
import { borrarEvento } from "@/lib/eventos/acciones";

/** Borrar el evento (solo administradores). */
export function BorrarEvento({ id, nombre, movimientos }: { id: string; nombre: string; movimientos: number }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function borrar() {
    const aviso = movimientos
      ? `\n\nSus ${movimientos} ${movimientos === 1 ? "movimiento queda" : "movimientos quedan"} en Financiero, sin evento.`
      : "";
    if (!window.confirm(`¿Borrar el evento "${nombre}"? No se puede deshacer.${aviso}`)) return;
    setError(null);
    iniciar(async () => {
      const r = await borrarEvento(id);
      if (r?.error) setError(r.error);
    });
  }

  return (
    <section className="max-w-2xl space-y-2 rounded-xl border border-red-200 bg-red-50 p-4">
      <h2 className="font-semibold text-red-900">Borrar evento</h2>
      <p className="text-sm text-red-900/80">
        Se borran el evento, su planilla, el living, los convocados y las pólizas. Los movimientos de plata y de stock, los comprobantes, los presupuestos y los
        cheques no se borran: quedan sin evento.
      </p>
      <button type="button" onClick={borrar} disabled={pendiente} className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
        {pendiente ? "Borrando…" : "Borrar evento"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
