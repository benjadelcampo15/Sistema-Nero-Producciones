"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rechazarFactura, reprocesarFactura } from "@/lib/facturas/acciones";

export function AccionesFactura({ id, puedeReintentar }: { id: string; puedeReintentar: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const ejecutar = (confirmacion: string | null, accion: () => Promise<{ error?: string }>, despues?: () => void) => {
    if (confirmacion && !window.confirm(confirmacion)) return;
    setError(null);
    iniciar(async () => {
      const r = await accion();
      if (r.error) setError(r.error);
      else despues?.();
    });
  };

  return (
    <div className="space-y-2">
      {error && <p className="alerta-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {puedeReintentar && (
          <button
            type="button"
            disabled={pendiente}
            className="boton-secundario"
            onClick={() =>
              ejecutar("¿Volver a leer la factura con IA? Se reemplazan los datos leídos.", () => reprocesarFactura(id))
            }
          >
            {pendiente ? "Procesando…" : "Volver a leer con IA"}
          </button>
        )}
        <button
          type="button"
          disabled={pendiente}
          className="boton-secundario text-red-700"
          onClick={() =>
            ejecutar(
              "¿Rechazar esta factura? No se carga en Financiero (queda registrada como rechazada).",
              () => rechazarFactura(id),
              () => router.push("/facturas?estado=por_revisar"),
            )
          }
        >
          Rechazar
        </button>
      </div>
    </div>
  );
}
