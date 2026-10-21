"use client";

import { useActionState, useTransition } from "react";
import { cambiarEstadoCategoria, crearCategoria } from "@/lib/financiero/acciones";

export function FormularioCategoria() {
  const [estado, accion, enviando] = useActionState(crearCategoria, {});

  return (
    <form action={accion} className="tarjeta flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-48 flex-1">
        <label htmlFor="nombre" className="etiqueta">Nueva categoría</label>
        <input id="nombre" name="nombre" required maxLength={60} className="campo" />
      </div>
      <div>
        <label htmlFor="tipo" className="etiqueta">Tipo</label>
        <select id="tipo" name="tipo" defaultValue="egreso" className="campo">
          <option value="egreso">Egreso</option>
          <option value="ingreso">Ingreso</option>
        </select>
      </div>
      <button type="submit" disabled={enviando} className="boton">Agregar</button>
      {estado.error && <p className="alerta-error w-full">{estado.error}</p>}
    </form>
  );
}

export function BotonEstadoCategoria({ id, activa }: { id: string; activa: boolean }) {
  const [pendiente, iniciar] = useTransition();

  return (
    <button
      type="button"
      disabled={pendiente}
      className="text-xs text-stone-500 hover:text-stone-900 disabled:opacity-50"
      onClick={() =>
        iniciar(async () => {
          const r = await cambiarEstadoCategoria(id, !activa);
          if (r.error) window.alert(r.error);
        })
      }
    >
      {activa ? "Desactivar" : "Activar"}
    </button>
  );
}
