"use client";

import { useActionState } from "react";
import { crearSolicitud } from "@/lib/solicitudes/acciones";
import { ACEPTA_ADJUNTOS, PRIORIDADES, TIPOS } from "@/lib/solicitudes/tipos";

export function FormularioSolicitud() {
  const [estado, accion, enviando] = useActionState(crearSolicitud, {});
  const v = (campo: string, inicial = "") => estado.valores?.[campo] ?? inicial;
  return (
    <form action={accion} className="tarjeta space-y-4">
      <div>
        <label htmlFor="titulo" className="etiqueta">Título</label>
        <input id="titulo" name="titulo" required minLength={3} maxLength={140} defaultValue={v("titulo")} placeholder="Ej.: Exportar los cierres de caja a Excel" className="campo" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tipo" className="etiqueta">Tipo</label>
          <select id="tipo" name="tipo" required defaultValue={v("tipo", "funcionalidad")} className="campo">
            {TIPOS.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="etiqueta">Prioridad sugerida</p>
          <div className="flex gap-2">
            {PRIORIDADES.map((p) => (
              <label key={p.id} className="flex flex-1 cursor-pointer items-center justify-center rounded-md border border-stone-300 bg-white px-3 py-2 text-sm has-[:checked]:border-stone-900 has-[:checked]:bg-stone-900 has-[:checked]:text-white">
                <input type="radio" name="prioridad_sugerida" value={p.id} defaultChecked={v("prioridad_sugerida", "media") === p.id} className="sr-only" />
                {p.nombre}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div>
        <label htmlFor="descripcion" className="etiqueta">Descripción</label>
        <textarea
          id="descripcion"
          name="descripcion"
          required
          minLength={10}
          maxLength={8000}
          rows={7}
          defaultValue={v("descripcion")}
          placeholder="Qué necesitás, en qué pantalla, para qué lo usarían. Si es un error: qué hiciste, qué esperabas y qué pasó."
          className="campo"
        />
      </div>
      <div>
        <label htmlFor="adjuntos" className="etiqueta">
          Adjuntos <span className="font-normal text-stone-400">(opcional)</span>
        </label>
        <input id="adjuntos" name="adjuntos" type="file" multiple accept={ACEPTA_ADJUNTOS} className="block w-full text-sm" />
        <p className="mt-1 text-xs text-stone-500">Capturas, imágenes, PDF, Word o Excel. Hasta 10 MB entre todos.</p>
      </div>
      {estado.error && <p className="alerta-error">{estado.error}</p>}
      <button type="submit" disabled={enviando} className="boton w-full sm:w-auto">{enviando ? "Enviando…" : "Enviar solicitud"}</button>
    </form>
  );
}
