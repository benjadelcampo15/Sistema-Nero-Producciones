"use client";

import { useActionState, useTransition } from "react";
import { cambiarEstadoDeposito, crearDeposito } from "@/lib/stock/acciones";

export function FormularioDeposito() {
  const [estado, accion, enviando] = useActionState(crearDeposito, {});
  return (
    <form action={accion} className="tarjeta flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-40 flex-1">
        <label htmlFor="nombre" className="etiqueta">Nuevo depósito</label>
        <input id="nombre" name="nombre" required maxLength={60} className="campo" />
      </div>
      <div className="min-w-48 flex-1">
        <label htmlFor="direccion" className="etiqueta">
          Dirección <span className="font-normal text-stone-400">(opcional)</span>
        </label>
        <input id="direccion" name="direccion" maxLength={200} className="campo" />
      </div>
      <button type="submit" disabled={enviando} className="boton">Agregar</button>
      {estado.error && <p className="alerta-error w-full">{estado.error}</p>}
    </form>
  );
}

export function BotonEstadoDeposito({ id, activo }: { id: string; activo: boolean }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      className="text-xs text-stone-500 hover:text-stone-900 disabled:opacity-50"
      onClick={() =>
        iniciar(async () => {
          const r = await cambiarEstadoDeposito(id, !activo);
          if (r.error) window.alert(r.error);
        })
      }
    >
      {activo ? "Desactivar" : "Activar"}
    </button>
  );
}
