"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarMovimientoStock } from "@/lib/stock/acciones";

/**
 * Elimina un movimiento de stock (o una entrada / salida completa) después de confirmar.
 * Con `volverA`, al terminar vuelve a esa página (ej.: desde el detalle de una salida borrada).
 */
export function BotonEliminarMovimiento({
  que,
  id,
  confirmacion,
  texto = "Eliminar",
  volverA,
  className = "text-xs text-red-600 hover:text-red-800 disabled:opacity-50",
}: {
  que: "movimiento" | "entrada" | "salida";
  id: string;
  confirmacion: string;
  texto?: string;
  volverA?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  return (
    <button
      type="button"
      disabled={pendiente}
      className={className}
      onClick={() => {
        if (!window.confirm(`${confirmacion}\n\nEl stock queda como si no se hubiera hecho. Queda registrado en la auditoría.`)) return;
        iniciar(async () => {
          const r = await eliminarMovimientoStock(que, id);
          if (r.error) return window.alert(r.error);
          if (volverA) router.push(volverA);
        });
      }}
    >
      {pendiente ? "Eliminando…" : texto}
    </button>
  );
}
