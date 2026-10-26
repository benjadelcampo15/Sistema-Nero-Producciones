"use client";

import { useOptimistic, useTransition } from "react";
import { cambiarEstadoMovimiento } from "@/lib/financiero/acciones";
import { ESTADOS_MOVIMIENTO, NOMBRE_ESTADO_MOVIMIENTO, type EstadoMovimiento } from "@/lib/financiero/tipos";

const COLORES: Record<EstadoMovimiento, string> = {
  real: "border-green-200 bg-green-50 text-green-800",
  pendiente: "border-amber-200 bg-amber-100 text-amber-800",
  proyectado: "border-sky-200 bg-sky-100 text-sky-800",
};

/** Cambia el estado del movimiento desde la lista, sin entrar a editarlo. */
export function SelectorEstado({ id, estado }: { id: string; estado: EstadoMovimiento }) {
  const [actual, setActual] = useOptimistic(estado);
  const [pendiente, iniciar] = useTransition();

  return (
    <select
      aria-label="Estado"
      value={actual}
      disabled={pendiente}
      onChange={(e) => {
        const nuevo = e.target.value as EstadoMovimiento;
        iniciar(async () => {
          setActual(nuevo);
          const r = await cambiarEstadoMovimiento(id, nuevo);
          if (r.error) window.alert(r.error);
        });
      }}
      className={`cursor-pointer rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase disabled:opacity-60 ${COLORES[actual]}`}
    >
      {ESTADOS_MOVIMIENTO.map((e) => (
        <option key={e} value={e}>{NOMBRE_ESTADO_MOVIMIENTO[e]}</option>
      ))}
    </select>
  );
}
