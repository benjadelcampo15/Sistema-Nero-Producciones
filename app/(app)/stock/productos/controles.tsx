"use client";

import { useActionState, useTransition } from "react";
import { cambiarEstadoProducto, guardarProducto } from "@/lib/stock/acciones";
import { UNIDADES, type Producto } from "@/lib/stock/tipos";

/** Alta (sin producto) o edición de un producto. */
export function FormularioProducto({ producto }: { producto?: Producto }) {
  const [estado, accion, enviando] = useActionState(guardarProducto.bind(null, producto?.id ?? null), {});
  const v = (campo: string, inicial: string) => estado.valores?.[campo] ?? inicial;

  return (
    <form action={accion} className="flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1">
        <label className="etiqueta">Nombre</label>
        <input name="nombre" required maxLength={120} defaultValue={v("nombre", producto?.nombre ?? "")} className="campo" />
      </div>
      <div>
        <label className="etiqueta">Unidad</label>
        <select name="unidad" defaultValue={v("unidad", producto?.unidad ?? "unidad")} className="campo">
          {UNIDADES.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>
      <div className="w-32">
        <label className="etiqueta">Código</label>
        <input name="codigo" maxLength={50} defaultValue={v("codigo", producto?.codigo ?? "")} className="campo" />
      </div>
      <div className="w-28">
        <label className="etiqueta">Stock mínimo</label>
        <input
          name="stock_minimo"
          inputMode="decimal"
          defaultValue={v("stock_minimo", producto?.stock_minimo ? String(producto.stock_minimo) : "")}
          className="campo text-right font-mono"
        />
      </div>
      <button type="submit" disabled={enviando} className={producto ? "boton-secundario" : "boton"}>
        {enviando ? "Guardando…" : producto ? "Guardar" : "Agregar"}
      </button>
      {estado.error && <p className="alerta-error w-full">{estado.error}</p>}
      {estado.ok && producto && <p className="w-full text-sm text-green-700">{estado.ok}</p>}
    </form>
  );
}

export function BotonEstadoProducto({ id, activo }: { id: string; activo: boolean }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      className="text-xs text-stone-500 hover:text-stone-900 disabled:opacity-50"
      onClick={() =>
        iniciar(async () => {
          const r = await cambiarEstadoProducto(id, !activo);
          if (r.error) window.alert(r.error);
        })
      }
    >
      {activo ? "Desactivar" : "Activar"}
    </button>
  );
}
