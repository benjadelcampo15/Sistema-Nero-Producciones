"use client";

import Link from "next/link";
import { useActionState } from "react";
import { guardarEvento } from "@/lib/eventos/acciones";
import { ESTADOS_EVENTO, NOMBRE_ESTADO_EVENTO, type Evento } from "@/lib/eventos/tipos";
import { hoy } from "@/lib/formato";

export function FormularioEvento({ evento }: { evento?: Evento }) {
  const [estado, accion, enviando] = useActionState(guardarEvento.bind(null, evento?.id ?? null), {});
  const v = (campo: string, inicial: string) => estado.valores?.[campo] ?? inicial;

  return (
    <form action={accion} className="tarjeta max-w-2xl space-y-5">
      {estado.error && <p className="alerta-error">{estado.error}</p>}

      <div>
        <label htmlFor="nombre" className="etiqueta">Nombre</label>
        <input
          id="nombre"
          name="nombre"
          required
          maxLength={120}
          defaultValue={v("nombre", evento?.nombre ?? "")}
          placeholder="Ej: Vino a la Nave – Edición Noviembre"
          className="campo"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="fecha" className="etiqueta">Fecha</label>
          <input id="fecha" name="fecha" type="date" required defaultValue={v("fecha", evento?.fecha ?? hoy())} className="campo" />
        </div>
        <div>
          <label htmlFor="estado" className="etiqueta">Estado</label>
          <select id="estado" name="estado" defaultValue={v("estado", evento?.estado ?? "planificado")} className="campo">
            {ESTADOS_EVENTO.map((e) => (
              <option key={e} value={e}>{NOMBRE_ESTADO_EVENTO[e]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="lugar" className="etiqueta">
            Lugar <span className="font-normal text-stone-400">(opcional)</span>
          </label>
          <input id="lugar" name="lugar" maxLength={200} defaultValue={v("lugar", evento?.lugar ?? "")} className="campo" />
        </div>
        <div>
          <label htmlFor="presupuesto" className="etiqueta">
            Presupuesto de gastos ($) <span className="font-normal text-stone-400">(opcional)</span>
          </label>
          <input
            id="presupuesto"
            name="presupuesto"
            inputMode="decimal"
            defaultValue={v("presupuesto", evento?.presupuesto ? String(evento.presupuesto).replace(".", ",") : "")}
            placeholder="5.000.000"
            className="campo text-right font-mono"
          />
        </div>
      </div>

      <div>
        <label htmlFor="notas" className="etiqueta">
          Notas <span className="font-normal text-stone-400">(opcional)</span>
        </label>
        <textarea id="notas" name="notas" rows={3} maxLength={1000} defaultValue={v("notas", evento?.notas ?? "")} className="campo" />
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={enviando} className="boton">
          {enviando ? "Guardando…" : evento ? "Guardar cambios" : "Crear evento"}
        </button>
        <Link href={evento ? `/eventos/${evento.id}` : "/eventos"} className="text-sm text-stone-600 hover:text-stone-900">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
