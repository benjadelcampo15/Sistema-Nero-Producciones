"use client";

import { useActionState } from "react";
import { cambiarContrasena, salir } from "@/lib/auth/acciones";

export default function PaginaCambiarContrasena() {
  const [estado, accion, enviando] = useActionState(cambiarContrasena, {});

  return (
    <div className="tarjeta space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Elegí tu contraseña</h1>
        <p className="mt-1 text-sm text-stone-600">
          Reemplazá la contraseña temporal por una propia. Mínimo 12 caracteres, con mayúsculas, minúsculas y números.
        </p>
      </div>
      <form action={accion} className="space-y-4">
        {estado.error && <p className="alerta-error">{estado.error}</p>}
        <div>
          <label htmlFor="nueva" className="etiqueta">Contraseña nueva</label>
          <input id="nueva" name="nueva" type="password" autoComplete="new-password" required minLength={12} className="campo" />
        </div>
        <div>
          <label htmlFor="repetida" className="etiqueta">Repetila</label>
          <input id="repetida" name="repetida" type="password" autoComplete="new-password" required minLength={12} className="campo" />
        </div>
        <button type="submit" disabled={enviando} className="boton w-full">
          {enviando ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
      <form action={salir}>
        <button type="submit" className="w-full text-center text-sm text-stone-500 hover:text-stone-900">
          Salir
        </button>
      </form>
    </div>
  );
}
