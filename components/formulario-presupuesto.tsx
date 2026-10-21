"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { guardarPresupuesto } from "@/lib/presupuestos/acciones";
import { MODOS_IVA, RUBROS_SUGERIDOS, calcularTotales, type ModoIva, type Presupuesto } from "@/lib/presupuestos/tipos";
import { formatoPesos, hoy, parsearMonto } from "@/lib/formato";

type Fila = { rubro: string; descripcion: string; cantidad: string; precio: string; costo: string };

const aTexto = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));
const filaVacia = (rubro = ""): Fila => ({ rubro, descripcion: "", cantidad: "1", precio: "", costo: "" });

const FORMA_PAGO_SUGERIDA = "50% de anticipo para confirmar la fecha.\n50% restante hasta 48 h antes del evento.";

export function FormularioPresupuesto({ presupuesto }: { presupuesto?: Presupuesto }) {
  const [estado, accion, enviando] = useActionState(guardarPresupuesto.bind(null, presupuesto?.id ?? null), {});
  const v = (campo: string, inicial: string) => estado.valores?.[campo] ?? inicial;

  const [filas, setFilas] = useState<Fila[]>(
    presupuesto?.items.length
      ? presupuesto.items.map((i) => ({ rubro: i.rubro, descripcion: i.descripcion, cantidad: aTexto(i.cantidad), precio: aTexto(i.precio), costo: aTexto(i.costo) }))
      : [filaVacia("Técnica")],
  );
  const [modoIva, setModoIva] = useState<ModoIva>(presupuesto?.modo_iva ?? "mas_iva");
  const [descuento, setDescuento] = useState(aTexto(presupuesto?.descuento_pct || null));

  const totales = calcularTotales(
    filas
      .filter((f) => f.descripcion.trim())
      .map((f) => ({
        rubro: f.rubro,
        descripcion: f.descripcion,
        cantidad: parsearMonto(f.cantidad) ?? 0,
        precio: parsearMonto(f.precio) ?? 0,
        costo: f.costo.trim() ? (parsearMonto(f.costo) ?? 0) : null,
      })),
    modoIva,
    parsearMonto(descuento) ?? 0,
  );

  const cambiar = (i: number, cambio: Partial<Fila>) => setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  const campo = (nombre: string, etiqueta: string, inicial: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={nombre} className="etiqueta">{etiqueta}</label>
      <input id={nombre} name={nombre} defaultValue={v(nombre, inicial)} className="campo" {...props} />
    </div>
  );

  return (
    <form action={accion} className="max-w-5xl space-y-5">
      <fieldset className="tarjeta space-y-4">
        <legend className="px-1 font-semibold">Cliente</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campo("cliente_nombre", "Cliente / razón social", presupuesto?.cliente_nombre ?? "", { required: true, maxLength: 200 })}
          {campo("cliente_cuit", "CUIT (opcional)", presupuesto?.cliente_cuit ?? "", { maxLength: 20 })}
          {campo("cliente_contacto", "Contacto (opcional)", presupuesto?.cliente_contacto ?? "", { maxLength: 120 })}
          {campo("cliente_email", "Email (opcional)", presupuesto?.cliente_email ?? "", { type: "email" })}
          {campo("cliente_telefono", "Teléfono (opcional)", presupuesto?.cliente_telefono ?? "", { maxLength: 40 })}
        </div>
      </fieldset>

      <fieldset className="tarjeta space-y-4">
        <legend className="px-1 font-semibold">Evento</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">{campo("evento_nombre", "Nombre del evento", presupuesto?.evento_nombre ?? "", { maxLength: 200 })}</div>
          {campo("evento_fecha", "Fecha tentativa", presupuesto?.evento_fecha ?? "", { type: "date" })}
          {campo("invitados", "Invitados", presupuesto?.invitados ? String(presupuesto.invitados) : "", { inputMode: "numeric" })}
          <div className="sm:col-span-2 lg:col-span-4">{campo("evento_lugar", "Lugar", presupuesto?.evento_lugar ?? "", { maxLength: 200 })}</div>
        </div>
      </fieldset>

      <fieldset className="tarjeta space-y-3">
        <legend className="px-1 font-semibold">Ítems</legend>
        <p className="text-xs text-stone-500">
          El <b>costo</b> es interno: el cliente no lo ve y sirve para calcular tu margen.
        </p>
        <input type="hidden" name="items" value={filas.length} />
        <datalist id="rubros">
          {RUBROS_SUGERIDOS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <div className="hidden gap-2 text-xs font-medium text-stone-500 lg:grid lg:grid-cols-[9rem_1fr_5rem_8rem_8rem_auto]">
          <span>Rubro</span><span>Descripción</span><span className="text-right">Cant.</span><span className="text-right">Precio unit.</span><span className="text-right">Costo unit.</span><span />
        </div>
        {filas.map((f, i) => (
          <div key={i} className="grid gap-2 border-b border-stone-100 pb-2 lg:grid-cols-[9rem_1fr_5rem_8rem_8rem_auto] lg:border-0 lg:pb-0">
            <input name={`item_rubro_${i}`} list="rubros" value={f.rubro} onChange={(e) => cambiar(i, { rubro: e.target.value })} placeholder="Rubro" className="campo" />
            <input name={`item_descripcion_${i}`} value={f.descripcion} onChange={(e) => cambiar(i, { descripcion: e.target.value })} placeholder="Descripción" className="campo" />
            <input name={`item_cantidad_${i}`} value={f.cantidad} onChange={(e) => cambiar(i, { cantidad: e.target.value })} inputMode="decimal" placeholder="Cant." className="campo text-right font-mono" />
            <input name={`item_precio_${i}`} value={f.precio} onChange={(e) => cambiar(i, { precio: e.target.value })} inputMode="decimal" placeholder="Precio" className="campo text-right font-mono" />
            <input name={`item_costo_${i}`} value={f.costo} onChange={(e) => cambiar(i, { costo: e.target.value })} inputMode="decimal" placeholder="Costo" className="campo bg-stone-50 text-right font-mono" />
            <button type="button" disabled={filas.length === 1} onClick={() => setFilas((prev) => prev.filter((_, j) => j !== i))} className="px-2 text-sm text-stone-400 hover:text-red-700 disabled:opacity-30" aria-label="Quitar ítem">
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setFilas((prev) => [...prev, filaVacia(prev.at(-1)?.rubro ?? "")])} className="text-sm text-stone-600 underline hover:text-stone-900">
          + Agregar ítem
        </button>

        <div className="grid gap-4 border-t border-stone-200 pt-4 sm:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label htmlFor="modo_iva" className="etiqueta">IVA</label>
              <select id="modo_iva" name="modo_iva" value={modoIva} onChange={(e) => setModoIva(e.target.value as ModoIva)} className="campo">
                {MODOS_IVA.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </div>
            <div className="w-40">
              <label htmlFor="descuento_pct" className="etiqueta">Descuento (%)</label>
              <input id="descuento_pct" name="descuento_pct" value={descuento} onChange={(e) => setDescuento(e.target.value)} inputMode="decimal" placeholder="0" className="campo text-right font-mono" />
            </div>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-stone-500">Subtotal</dt><dd className="font-mono">{formatoPesos(totales.subtotal)}</dd></div>
            {totales.descuento > 0 && <div className="flex justify-between"><dt className="text-stone-500">Descuento</dt><dd className="font-mono">−{formatoPesos(totales.descuento)}</dd></div>}
            {modoIva !== "sin_iva" && <div className="flex justify-between"><dt className="text-stone-500">{modoIva === "mas_iva" ? "IVA 21%" : "IVA contenido"}</dt><dd className="font-mono">{formatoPesos(totales.iva)}</dd></div>}
            <div className="flex justify-between text-base font-semibold"><dt>Total al cliente</dt><dd className="font-mono">{formatoPesos(totales.total)}</dd></div>
            {totales.margen !== null && (
              <div className={`mt-2 flex justify-between rounded-md px-2 py-1 ${totales.margen >= 0 ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>
                <dt>Margen (neto − costo)</dt>
                <dd className="font-mono font-semibold">{formatoPesos(totales.margen)} ({totales.margenPct}%)</dd>
              </div>
            )}
          </dl>
        </div>
      </fieldset>

      <fieldset className="tarjeta space-y-4">
        <legend className="px-1 font-semibold">Condiciones</legend>
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem_10rem]">
          <div />
          {campo("fecha", "Fecha", presupuesto?.fecha ?? hoy(), { type: "date", required: true })}
          {campo("validez_dias", "Validez (días)", String(presupuesto?.validez_dias ?? 15), { inputMode: "numeric", required: true })}
        </div>
        {(["forma_pago", "incluye", "observaciones"] as const).map((n) => (
          <div key={n}>
            <label htmlFor={n} className="etiqueta">
              {n === "forma_pago" ? "Forma de pago" : n === "incluye" ? "Incluye / no incluye" : "Observaciones"}
            </label>
            <textarea
              id={n}
              name={n}
              rows={3}
              defaultValue={v(n, presupuesto?.[n] ?? (n === "forma_pago" && !presupuesto ? FORMA_PAGO_SUGERIDA : ""))}
              className="campo"
            />
          </div>
        ))}
      </fieldset>

      {estado.error && <p className="alerta-error" role="alert">{estado.error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={enviando} className="boton">
          {enviando ? "Guardando…" : presupuesto ? "Guardar cambios" : "Crear presupuesto"}
        </button>
        <Link href={presupuesto ? `/presupuestos/${presupuesto.id}` : "/presupuestos"} className="text-sm text-stone-600 hover:text-stone-900">Cancelar</Link>
      </div>
    </form>
  );
}
