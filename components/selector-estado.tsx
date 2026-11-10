"use client";

import { useOptimistic, useRef, useTransition } from "react";
import { cambiarEstadoMovimiento } from "@/lib/financiero/acciones";
import { ESTADOS_MOVIMIENTO, NOMBRE_ESTADO_MOVIMIENTO, type EstadoMovimiento, type Transaccion } from "@/lib/financiero/tipos";
import { DialogoPago } from "./registrar-pago";

const COLORES: Record<EstadoMovimiento, string> = {
  real: "border-green-200 bg-green-50 text-green-800",
  pendiente: "border-amber-200 bg-amber-100 text-amber-800",
  proyectado: "border-sky-200 bg-sky-100 text-sky-800",
};

/**
 * Cambia el estado del movimiento desde la lista, sin entrar a editarlo. Pasar
 * de pendiente o proyectado a real es registrar el pago (o cobro): abre su
 * formulario chico (monto, fecha, medio; admite pagos parciales).
 */
export function SelectorEstado({ id, estado, t }: { id: string; estado: EstadoMovimiento; t?: Pick<Transaccion, "id" | "tipo" | "monto" | "descripcion" | "medio_pago"> }) {
  const [actual, setActual] = useOptimistic(estado);
  const [pendiente, iniciar] = useTransition();
  const dialogo = useRef<HTMLDialogElement>(null);

  return (
    <>
      <select
        aria-label="Estado"
        value={actual}
        disabled={pendiente}
        onChange={(e) => {
          const nuevo = e.target.value as EstadoMovimiento;
          if (nuevo === "real" && actual !== "real" && t) {
            // El select vuelve a mostrar el estado actual hasta que se registre el pago.
            e.target.value = actual;
            dialogo.current?.showModal();
            return;
          }
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
      {t && actual !== "real" && <DialogoPago t={t} dialogo={dialogo} />}
    </>
  );
}
