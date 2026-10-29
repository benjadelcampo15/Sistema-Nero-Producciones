"use client";

import { useActionState, useState, useTransition } from "react";
import { NOMBRE_NIVEL, SECCIONES, type Permisos } from "@/lib/permisos";
import {
  actualizarPermisos,
  cambiarEstadoUsuario,
  restablecerContrasena,
  type EstadoAccion,
} from "./acciones";
import { CamposPermisos } from "./campos-permisos";
import { ContrasenaTemporal } from "./contrasena-temporal";

export type UsuarioListado = {
  id: string;
  nombre: string;
  email: string;
  esAdmin: boolean;
  activo: boolean;
  debeCambiarContrasena: boolean;
  ultimoIngreso: string | null;
  permisos: Permisos;
  esUsuarioActual: boolean;
};

const formatoFecha = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

export function FilaUsuario({ usuario }: { usuario: UsuarioListado }) {
  const [estadoPermisos, guardarPermisos, guardando] = useActionState(
    actualizarPermisos.bind(null, usuario.id),
    {},
  );
  const [resultado, setResultado] = useState<EstadoAccion>({});
  const [pendiente, iniciar] = useTransition();

  const ejecutar = (confirmacion: string, accion: () => Promise<EstadoAccion>) => {
    if (!window.confirm(confirmacion)) return;
    iniciar(async () => setResultado(await accion()));
  };

  const resumen = usuario.esAdmin
    ? "Administrador"
    : SECCIONES.filter((s) => usuario.permisos[s.id] !== "ninguno")
        .map((s) => `${s.nombre}: ${NOMBRE_NIVEL[usuario.permisos[s.id]]}`)
        .join(" · ") || "Sin permisos";

  const mensaje = resultado.error ?? estadoPermisos.error;
  const exito = resultado.ok ?? estadoPermisos.ok;

  return (
    <details className={`tarjeta p-0 ${usuario.activo ? "" : "opacity-60"}`}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4">
        <span className="min-w-48 flex-1">
          <span className="font-medium">{usuario.nombre}</span>
          {usuario.esUsuarioActual && <span className="ml-2 text-xs text-stone-500">(vos)</span>}
          <span className="block text-sm text-stone-500">{usuario.email}</span>
        </span>
        <span className="text-sm text-stone-600">{resumen}</span>
        <span className="flex flex-wrap gap-1 text-xs">
          {!usuario.activo && <Etiqueta color="red">Desactivado</Etiqueta>}
          {usuario.debeCambiarContrasena && <Etiqueta color="amber">Contraseña temporal</Etiqueta>}
        </span>
      </summary>

      <div className="space-y-4 border-t border-stone-200 px-5 py-4">
        <p className="text-xs text-stone-500">
          Último ingreso: {usuario.ultimoIngreso ? formatoFecha.format(new Date(usuario.ultimoIngreso)) : "nunca"}
        </p>

        {mensaje && <p className="alerta-error">{mensaje}</p>}
        {exito && !mensaje && <p className="text-sm text-green-700">{exito}</p>}
        {resultado.contrasenaTemporal && (
          <ContrasenaTemporal email={usuario.email} contrasena={resultado.contrasenaTemporal} />
        )}

        <form action={guardarPermisos} className="space-y-3">
          <CamposPermisos
            permisos={usuario.permisos}
            esAdmin={usuario.esAdmin}
            bloquearAdmin={usuario.esUsuarioActual}
          />
          <button type="submit" disabled={guardando} className="boton">
            {guardando ? "Guardando…" : "Guardar permisos"}
          </button>
        </form>

        {!usuario.esUsuarioActual && (
          <div className="flex flex-wrap gap-2 border-t border-stone-200 pt-4">
            <button
              type="button"
              disabled={pendiente}
              className="boton-secundario"
              onClick={() =>
                ejecutar(
                  `¿Generar una contraseña temporal nueva para ${usuario.nombre}? La actual deja de funcionar.`,
                  () => restablecerContrasena(usuario.id),
                )
              }
            >
              Restablecer contraseña
            </button>
            <button
              type="button"
              disabled={pendiente}
              className={`boton-secundario ${usuario.activo ? "text-red-700" : ""}`}
              onClick={() =>
                ejecutar(
                  usuario.activo
                    ? `¿Desactivar a ${usuario.nombre}? No va a poder ingresar.`
                    : `¿Activar a ${usuario.nombre}?`,
                  () => cambiarEstadoUsuario(usuario.id, !usuario.activo),
                )
              }
            >
              {usuario.activo ? "Desactivar" : "Activar"}
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

function Etiqueta({ color, children }: { color: "red" | "amber" | "green"; children: React.ReactNode }) {
  const estilos = {
    red: "bg-red-100 text-red-800",
    amber: "bg-amber-100 text-amber-800",
    green: "bg-green-100 text-green-800",
  };
  return <span className={`rounded-full px-2 py-0.5 font-medium ${estilos[color]}`}>{children}</span>;
}
