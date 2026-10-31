"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarMovimientoStock } from "@/lib/stock/acciones";

/**
 * Elimina un movimiento de stock (o una entrada / salida completa) pidiendo el motivo.
 * Lo eliminado sigue en el historial, marcado, y deja de contar para el stock.
 * Con `volverA`, al terminar vuelve a esa página.
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

  function eliminar() {
    let motivo: string | null = "";
    // Se vuelve a pedir mientras quede vacío; Cancelar no elimina nada.
    while (motivo !== null && !motivo.trim()) {
      motivo = window.prompt(
        `${confirmacion}\n\nEl stock queda como si no se hubiera hecho, y en el historial se ve como eliminado.\n\nMotivo de la eliminación (obligatorio):`,
      );
    }
    if (motivo === null) return;
    const texto = motivo.trim().slice(0, 200);
    iniciar(async () => {
      const r = await eliminarMovimientoStock(que, id, texto);
      if (r.error) return window.alert(r.error);
      if (volverA) router.push(volverA);
    });
  }

  return (
    <button type="button" disabled={pendiente} className={className} onClick={eliminar}>
      {pendiente ? "Eliminando…" : texto}
    </button>
  );
}
