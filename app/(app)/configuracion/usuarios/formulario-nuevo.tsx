"use client";

import { useActionState } from "react";
import { sinPermisos } from "@/lib/permisos";
import { crearUsuario } from "./acciones";
import { CamposPermisos } from "./campos-permisos";
import { ContrasenaTemporal } from "./contrasena-temporal";

export function FormularioNuevoUsuario() {
  const [estado, accion, enviando] = useActionState(crearUsuario, {});

  return (
    <section className="tarjeta space-y-4">
      <h2 className="text-lg font-semibold">Nuevo usuario</h2>

      {estado.error && <p className="alerta-error">{estado.error}</p>}
      {estado.contrasenaTemporal && (
        <ContrasenaTemporal email={estado.email} contrasena={estado.contrasenaTemporal} />
      )}

      <form action={accion} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="nombre" className="etiqueta">Nombre</label>
            <input id="nombre" name="nombre" required maxLength={100} className="campo" />
          </div>
          <div>
            <label htmlFor="email" className="etiqueta">Email</label>
            <input id="email" name="email" type="email" required className="campo" />
          </div>
        </div>
        <CamposPermisos permisos={sinPermisos()} esAdmin={false} />
        <button type="submit" disabled={enviando} className="boton">
          {enviando ? "Creando…" : "Crear usuario"}
        </button>
      </form>
    </section>
  );
}
