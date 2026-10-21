"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { guardarTransaccion } from "@/lib/financiero/acciones";
import {
  ESTADOS_MOVIMIENTO,
  MEDIOS_PAGO,
  NOMBRE_ESTADO_MOVIMIENTO,
  NOMBRE_MEDIO_PAGO,
  type Categoria,
  type EventoResumido,
  type TipoMovimiento,
  type Transaccion,
} from "@/lib/financiero/tipos";
import { formatoFecha, hoy } from "@/lib/formato";

type Props = {
  transaccion?: Transaccion;
  categorias: Categoria[];
  eventos: EventoResumido[];
  /** Si viene, el movimiento queda fijado a ese evento (alta desde la pantalla del evento). */
  eventoFijo?: EventoResumido;
  volverA: string;
};

export function FormularioTransaccion({ transaccion, categorias, eventos, eventoFijo, volverA }: Props) {
  const [estado, accion, enviando] = useActionState(
    guardarTransaccion.bind(null, transaccion?.id ?? null),
    {},
  );
  const [tipo, setTipo] = useState<TipoMovimiento>(transaccion?.tipo ?? "egreso");
  // Tras un error se muestran los valores que el usuario había cargado.
  const v = (campo: string, inicial: string) => estado.valores?.[campo] ?? inicial;
  const delTipo = categorias.filter((c) => c.tipo === tipo);

  // Si la categoría actual fue desactivada, igual se muestra para no perderla al editar.
  if (transaccion && transaccion.tipo === tipo && !delTipo.some((c) => c.id === transaccion.categoria.id)) {
    delTipo.unshift({ ...transaccion.categoria, tipo, activa: false });
  }

  return (
    <form action={accion} className="tarjeta max-w-2xl space-y-5">
      <input type="hidden" name="volver_a" value={volverA} />
      {estado.error && <p className="alerta-error">{estado.error}</p>}

      <fieldset>
        <legend className="etiqueta">Tipo</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["egreso", "ingreso"] as const).map((t) => (
            <label
              key={t}
              className={`cursor-pointer rounded-md border px-3 py-2 text-center text-sm font-medium ${
                tipo === t
                  ? t === "ingreso"
                    ? "border-green-600 bg-green-50 text-green-800"
                    : "border-red-600 bg-red-50 text-red-800"
                  : "border-stone-300 bg-white text-stone-600"
              }`}
            >
              <input
                type="radio"
                name="tipo"
                value={t}
                checked={tipo === t}
                onChange={() => setTipo(t)}
                className="sr-only"
              />
              {t === "ingreso" ? "Ingreso" : "Egreso (gasto)"}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="monto" className="etiqueta">Monto ($)</label>
          <input
            id="monto"
            name="monto"
            inputMode="decimal"
            required
            defaultValue={v("monto", transaccion ? String(transaccion.monto).replace(".", ",") : "")}
            placeholder="15.000,00"
            className="campo text-right font-mono"
          />
        </div>
        <div>
          <label htmlFor="fecha" className="etiqueta">Fecha</label>
          <input id="fecha" name="fecha" type="date" required defaultValue={v("fecha", transaccion?.fecha ?? hoy())} className="campo" />
        </div>
      </div>

      <div>
        <label htmlFor="descripcion" className="etiqueta">Descripción</label>
        <input
          id="descripcion"
          name="descripcion"
          required
          maxLength={200}
          defaultValue={v("descripcion", transaccion?.descripcion ?? "")}
          placeholder="Ej: Pago sonido escenario principal"
          className="campo"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="categoria_id" className="etiqueta">Categoría</label>
          <select
            id="categoria_id"
            name="categoria_id"
            required
            key={tipo}
            defaultValue={v("categoria_id", transaccion?.tipo === tipo ? transaccion.categoria.id : "")}
            className="campo"
          >
            <option value="" disabled>Elegí…</option>
            {delTipo.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="evento_id" className="etiqueta">Evento</label>
          {eventoFijo ? (
            <>
              <input type="hidden" name="evento_id" value={eventoFijo.id} />
              <p className="campo bg-stone-100">{eventoFijo.nombre}</p>
            </>
          ) : (
            <select id="evento_id" name="evento_id" defaultValue={v("evento_id", transaccion?.evento?.id ?? "")} className="campo">
              <option value="">Sin evento (gasto general)</option>
              {transaccion?.evento && !eventos.some((e) => e.id === transaccion.evento!.id) && (
                <option value={transaccion.evento.id}>{transaccion.evento.nombre}</option>
              )}
              {eventos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre} · {formatoFecha(e.fecha)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contraparte" className="etiqueta">
            {tipo === "ingreso" ? "Cliente / de quién" : "Proveedor / a quién"} <span className="font-normal text-stone-400">(opcional)</span>
          </label>
          <input id="contraparte" name="contraparte" maxLength={200} defaultValue={v("contraparte", transaccion?.contraparte ?? "")} className="campo" />
        </div>
        <div>
          <label htmlFor="medio_pago" className="etiqueta">Medio de pago</label>
          <select id="medio_pago" name="medio_pago" defaultValue={v("medio_pago", transaccion?.medio_pago ?? "transferencia")} className="campo">
            {MEDIOS_PAGO.map((m) => (
              <option key={m} value={m}>{NOMBRE_MEDIO_PAGO[m]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="estado" className="etiqueta">Estado</label>
          <select id="estado" name="estado" defaultValue={v("estado", transaccion?.estado ?? "real")} className="campo">
            {ESTADOS_MOVIMIENTO.map((e) => (
              <option key={e} value={e}>
                {NOMBRE_ESTADO_MOVIMIENTO[e]}
                {e === "real" ? " (ya se cobró / pagó)" : e === "pendiente" ? " (comprometido)" : " (estimado)"}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            name="facturado"
            defaultChecked={estado.valores ? estado.valores.facturado === "on" : (transaccion?.facturado ?? false)}
          />
          Facturado
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="iva" className="etiqueta">
            IVA ($) <span className="font-normal text-stone-400">(opcional)</span>
          </label>
          <input
            id="iva"
            name="iva"
            inputMode="decimal"
            defaultValue={v("iva", transaccion?.iva ? String(transaccion.iva).replace(".", ",") : "")}
            className="campo text-right font-mono"
          />
        </div>
        <div>
          <label htmlFor="iibb" className="etiqueta">
            IIBB ($) <span className="font-normal text-stone-400">(opcional)</span>
          </label>
          <input
            id="iibb"
            name="iibb"
            inputMode="decimal"
            defaultValue={v("iibb", transaccion?.iibb ? String(transaccion.iibb).replace(".", ",") : "")}
            className="campo text-right font-mono"
          />
        </div>
      </div>

      <div>
        <label htmlFor="notas" className="etiqueta">
          Notas <span className="font-normal text-stone-400">(opcional)</span>
        </label>
        <textarea id="notas" name="notas" rows={2} maxLength={500} defaultValue={v("notas", transaccion?.notas ?? "")} className="campo" />
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={enviando} className="boton">
          {enviando ? "Guardando…" : transaccion ? "Guardar cambios" : "Cargar movimiento"}
        </button>
        <Link href={volverA} className="text-sm text-stone-600 hover:text-stone-900">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
