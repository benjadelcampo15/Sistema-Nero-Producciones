"use client";

import { useActionState } from "react";
import { enviarFormularioPersonal } from "@/lib/empleados/acciones";
import { CamposPersona } from "@/components/campos-persona";

export function FormularioAlta({ token }: { token: string }) {
  const [estado, accion, enviando] = useActionState(enviarFormularioPersonal.bind(null, token), {});
  const v = (campo: string, inicial: string) => estado.valores?.[campo] ?? inicial;

  if (estado.ok) {
    return (
      <div className="tarjeta space-y-2 text-center">
        <p className="text-lg font-semibold">{estado.ok}</p>
        <p className="text-sm text-stone-600">Ya podés cerrar esta página.</p>
      </div>
    );
  }

  return (
    <form action={accion} className="tarjeta space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Datos del personal</h1>
        <p className="text-sm text-stone-600">Completá tus datos para trabajar en los eventos de Nero Producciones. Los usamos para tu seguro y tus pagos.</p>
      </div>
      {/* Campo trampa para robots: las personas no lo ven. */}
      <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <CamposPersona v={v} />
      {estado.error && <p className="alerta-error">{estado.error}</p>}
      <button type="submit" disabled={enviando} className="boton w-full">
        {enviando ? "Enviando…" : "Enviar"}
      </button>
    </form>
  );
}
