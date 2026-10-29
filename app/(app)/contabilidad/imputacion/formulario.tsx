"use client";

import { useActionState } from "react";
import { guardarImputacion } from "@/lib/contabilidad/acciones";

/** La pantalla entera es un formulario: se guarda todo junto. */
export function FormularioImputacion({ editable, children }: { editable: boolean; children: React.ReactNode }) {
  const [estado, accion, enviando] = useActionState(guardarImputacion, {});
  if (!editable) return <fieldset disabled>{children}</fieldset>;
  return (
    <form action={accion} className="space-y-6">
      {children}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-stone-200 bg-white/95 py-3">
        <button type="submit" disabled={enviando} className="boton">{enviando ? "Guardando…" : "Guardar imputación"}</button>
        {estado.error && <p className="text-sm text-red-700">{estado.error}</p>}
        {estado.ok && <p className="text-sm text-green-700">{estado.ok}</p>}
      </div>
    </form>
  );
}
