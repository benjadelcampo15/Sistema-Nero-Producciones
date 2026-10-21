"use client";

import { useTransition } from "react";
import { eliminarTransaccion } from "@/lib/financiero/acciones";

export function BotonEliminar({ id, descripcion }: { id: string; descripcion: string }) {
  const [pendiente, iniciar] = useTransition();

  return (
    <button
      type="button"
      disabled={pendiente}
      className="ml-3 text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
      onClick={() => {
        if (!window.confirm(`¿Eliminar "${descripcion}"? Queda registrado en la auditoría.`)) return;
        iniciar(async () => {
          const r = await eliminarTransaccion(id);
          if (r.error) window.alert(r.error);
        });
      }}
    >
      {pendiente ? "Eliminando…" : "Eliminar"}
    </button>
  );
}
