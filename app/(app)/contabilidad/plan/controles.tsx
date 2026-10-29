"use client";

import { useActionState, useState, useTransition } from "react";
import { cambiarEstadoCuentaContable, guardarCuentaContable } from "@/lib/contabilidad/acciones";
import type { CuentaContable } from "@/lib/contabilidad/tipos";

export function FormularioCuentaContable({ cuenta, alTerminar }: { cuenta?: CuentaContable; alTerminar?: () => void }) {
  const [estado, accion, enviando] = useActionState(async (previo: Parameters<typeof guardarCuentaContable>[1], formData: FormData) => {
    const r = await guardarCuentaContable(cuenta?.id ?? null, previo, formData);
    if (r.ok && alTerminar) alTerminar();
    return r;
  }, {});
  const v = (campo: string, inicial: string) => estado.valores?.[campo] ?? inicial;
  const id = cuenta?.id ?? "nueva";

  return (
    <form action={accion} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto]">
        <div>
          <label className="etiqueta" htmlFor={`codigo-${id}`}>Código</label>
          {cuenta ? (
            <>
              <input type="hidden" name="codigo" value={cuenta.codigo} />
              <p id={`codigo-${id}`} className="campo bg-stone-50 font-mono">{cuenta.codigo}</p>
            </>
          ) : (
            <input id={`codigo-${id}`} name="codigo" required placeholder="5.2.09" defaultValue={v("codigo", "")} className="campo font-mono" />
          )}
        </div>
        <div>
          <label className="etiqueta" htmlFor={`nombre-${id}`}>Nombre</label>
          <input id={`nombre-${id}`} name="nombre" required maxLength={120} defaultValue={v("nombre", cuenta?.nombre ?? "")} className="campo" />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="imputable" defaultChecked={estado.valores ? estado.valores.imputable === "on" : (cuenta?.imputable ?? true)} />
          Imputable
        </label>
      </div>
      {estado.error && <p className="alerta-error">{estado.error}</p>}
      {estado.ok && !cuenta && <p className="text-sm text-green-700">{estado.ok}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={enviando} className={cuenta ? "boton-secundario" : "boton"}>
          {enviando ? "Guardando…" : cuenta ? "Guardar" : "Agregar cuenta"}
        </button>
        {alTerminar && (
          <button type="button" onClick={alTerminar} className="text-sm text-stone-600 hover:text-stone-900">Cancelar</button>
        )}
      </div>
    </form>
  );
}

/** Fila del plan: nombre, y al tocar Editar, el formulario en el lugar. */
export function FilaCuenta({ cuenta, nivel, editable }: { cuenta: CuentaContable; nivel: number; editable: boolean }) {
  const [editando, setEditando] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <tr className={cuenta.imputable ? "" : "bg-stone-50/60"}>
      <td className="py-1.5 pr-4" style={{ paddingLeft: `${1 + nivel * 1.25}rem` }}>
        {editando ? (
          <div className="py-2">
            <FormularioCuentaContable cuenta={cuenta} alTerminar={() => setEditando(false)} />
          </div>
        ) : (
          <span className={`${cuenta.imputable ? "" : "font-semibold"} ${cuenta.activa ? "" : "text-stone-400 line-through"}`}>
            <span className="font-mono text-xs text-stone-500">{cuenta.codigo}</span> {cuenta.nombre}
          </span>
        )}
        {error && <p className="text-xs text-red-700">{error}</p>}
      </td>
      <td className="px-4 py-1.5 text-xs text-stone-500">{cuenta.imputable ? "Imputable" : "Rubro"}</td>
      {editable && (
        <td className="whitespace-nowrap px-4 py-1.5 text-right">
          {!editando && (
            <button type="button" onClick={() => setEditando(true)} className="mr-3 text-xs text-stone-500 hover:text-stone-900">Editar</button>
          )}
          <button
            type="button"
            disabled={pendiente}
            className="text-xs text-stone-500 hover:text-stone-900 disabled:opacity-50"
            onClick={() =>
              iniciar(async () => {
                const r = await cambiarEstadoCuentaContable(cuenta.id, !cuenta.activa);
                setError(r.error ?? null);
              })
            }
          >
            {cuenta.activa ? "Desactivar" : "Activar"}
          </button>
        </td>
      )}
    </tr>
  );
}
