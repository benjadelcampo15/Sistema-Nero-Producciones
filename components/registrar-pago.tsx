"use client";

import { useActionState, useRef } from "react";
import { registrarPago } from "@/lib/financiero/acciones";
import { MEDIOS_PAGO, NOMBRE_MEDIO_PAGO, type Transaccion } from "@/lib/financiero/tipos";
import { formatoPesos, hoy } from "@/lib/formato";

/** Botón para registrar el pago (total o parcial) de un movimiento pendiente o proyectado. */
export function RegistrarPago({ t }: { t: Pick<Transaccion, "id" | "tipo" | "monto" | "descripcion" | "medio_pago"> }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [estado, accion, enviando] = useActionState(registrarPago.bind(null, t.id), {});
  const v = (campo: string, inicial: string) => estado.valores?.[campo] ?? inicial;
  const verbo = t.tipo === "egreso" ? "pago" : "cobro";

  return (
    <>
      <button type="button" onClick={() => dialogo.current?.showModal()} className="text-xs font-medium text-stone-700 underline hover:text-stone-900">
        Registrar {verbo}
      </button>
      <dialog ref={dialogo} className="m-auto w-full max-w-sm rounded-lg p-0 shadow-xl backdrop:bg-black/40">
        {estado.ok ? (
          <div className="space-y-3 p-5 text-center">
            <p className="font-semibold text-green-700">{estado.ok}</p>
            <button type="button" onClick={() => dialogo.current?.close()} className="boton">Listo</button>
          </div>
        ) : (
          <form action={accion} className="space-y-3 p-5 text-left">
            <div>
              <h3 className="font-semibold">Registrar {verbo}</h3>
              <p className="text-sm text-stone-600">
                {t.descripcion} · pendiente <span className="font-mono">{formatoPesos(t.monto)}</span>
              </p>
            </div>
            <div>
              <label htmlFor={`monto-${t.id}`} className="etiqueta">Monto {t.tipo === "egreso" ? "pagado" : "cobrado"}</label>
              <input
                id={`monto-${t.id}`}
                name="monto"
                required
                inputMode="decimal"
                defaultValue={v("monto", String(t.monto).replace(".", ","))}
                className="campo font-mono"
              />
              <p className="mt-1 text-xs text-stone-500">Si es menos que el total, queda pendiente la diferencia.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`fecha-${t.id}`} className="etiqueta">Fecha</label>
                <input id={`fecha-${t.id}`} name="fecha" type="date" required defaultValue={v("fecha", hoy())} className="campo" />
              </div>
              <div>
                <label htmlFor={`medio-${t.id}`} className="etiqueta">Medio</label>
                <select id={`medio-${t.id}`} name="medio_pago" defaultValue={v("medio_pago", t.medio_pago)} className="campo">
                  {MEDIOS_PAGO.map((m) => (
                    <option key={m} value={m}>{NOMBRE_MEDIO_PAGO[m]}</option>
                  ))}
                </select>
              </div>
            </div>
            {estado.error && <p className="alerta-error">{estado.error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => dialogo.current?.close()} className="boton-secundario">Cancelar</button>
              <button type="submit" disabled={enviando} className="boton">{enviando ? "Guardando…" : `Registrar ${verbo}`}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
