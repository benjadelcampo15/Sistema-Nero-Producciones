"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { emitirFactura } from "@/lib/facturar/acciones";
import {
  ALICUOTAS,
  CONCEPTOS,
  CONDICIONES_IVA,
  TIPOS_CBTE,
  TIPOS_DOC,
  calcularTotales,
  type ClaseCbte,
} from "@/lib/facturar/tipos";
import type { Categoria, EventoResumido } from "@/lib/financiero/tipos";
import { formatoFecha, formatoPesos, hoy, parsearMonto } from "@/lib/formato";

type Item = { descripcion: string; cantidad: string; precio: string; alicuota: string };
const itemVacio = (): Item => ({ descripcion: "", cantidad: "1", precio: "", alicuota: "5" });

export function FormularioFactura({
  eventos,
  categorias,
  puedeRegistrarIngreso,
  entorno,
}: {
  eventos: EventoResumido[];
  categorias: Categoria[];
  puedeRegistrarIngreso: boolean;
  entorno: string;
}) {
  const [estado, accion, enviando] = useActionState(emitirFactura, {});
  const v = (campo: string, inicial: string) => estado.valores?.[campo] ?? inicial;

  const [tipo, setTipo] = useState(Number(v("tipo_cbte", "6")));
  const [concepto, setConcepto] = useState(Number(v("concepto", "2")));
  const [docTipo, setDocTipo] = useState(Number(v("doc_tipo", "99")));
  const [items, setItems] = useState<Item[]>([itemVacio()]);

  const clase = (TIPOS_CBTE.find((t) => t.id === tipo)?.clase ?? "B") as ClaseCbte;
  const condiciones = CONDICIONES_IVA.filter((c) => (c.clases as readonly string[]).includes(clase));
  const totales = calcularTotales(
    items
      .map((it) => ({
        descripcion: it.descripcion,
        cantidad: parsearMonto(it.cantidad) ?? 0,
        precio: parsearMonto(it.precio) ?? 0,
        alicuota: clase === "C" ? null : Number(it.alicuota),
      }))
      .filter((it) => it.cantidad > 0 && it.precio > 0),
    clase,
  );
  const cambiarItem = (i: number, cambio: Partial<Item>) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...cambio } : it)));

  return (
    <form action={accion} className="max-w-4xl space-y-5">
      {entorno === "homologacion" && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-semibold">Modo pruebas (homologación):</span> las facturas se autorizan en ARCA pero no tienen validez fiscal.
        </p>
      )}

      <fieldset className="tarjeta space-y-4">
        <legend className="px-1 font-semibold">Comprobante</legend>
        <div className="grid grid-cols-3 gap-2">
          {TIPOS_CBTE.map((t) => (
            <label
              key={t.id}
              className={`cursor-pointer rounded-md border px-3 py-2 text-center text-sm font-medium ${
                tipo === t.id ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-600"
              }`}
            >
              <input type="radio" name="tipo_cbte" value={t.id} checked={tipo === t.id} onChange={() => {
                  setTipo(t.id);
                  if (t.clase === "A") setDocTipo(80);
                }}
                className="sr-only"
              />
              {t.nombre}
            </label>
          ))}
        </div>
        <p className="text-xs text-stone-500">
          A: a Responsables Inscriptos y monotributistas · B: a consumidores finales y exentos · C: si el emisor es monotributista.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="punto_venta" className="etiqueta">Punto de venta</label>
            <input id="punto_venta" name="punto_venta" inputMode="numeric" required defaultValue={v("punto_venta", "1")} className="campo" />
          </div>
          <div>
            <label htmlFor="fecha" className="etiqueta">Fecha</label>
            <input id="fecha" name="fecha" type="date" required defaultValue={v("fecha", hoy())} className="campo" />
          </div>
          <div>
            <label htmlFor="concepto" className="etiqueta">Concepto</label>
            <select id="concepto" name="concepto" value={concepto} onChange={(e) => setConcepto(Number(e.target.value))} className="campo">
              {CONCEPTOS.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        {concepto !== 1 && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="fecha_servicio_desde" className="etiqueta">Servicio desde</label>
              <input id="fecha_servicio_desde" name="fecha_servicio_desde" type="date" required defaultValue={v("fecha_servicio_desde", hoy())} className="campo" />
            </div>
            <div>
              <label htmlFor="fecha_servicio_hasta" className="etiqueta">Servicio hasta</label>
              <input id="fecha_servicio_hasta" name="fecha_servicio_hasta" type="date" required defaultValue={v("fecha_servicio_hasta", hoy())} className="campo" />
            </div>
            <div>
              <label htmlFor="fecha_vto_pago" className="etiqueta">Vencimiento del pago</label>
              <input id="fecha_vto_pago" name="fecha_vto_pago" type="date" required defaultValue={v("fecha_vto_pago", hoy())} className="campo" />
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className="tarjeta space-y-4">
        <legend className="px-1 font-semibold">Cliente</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="doc_tipo" className="etiqueta">Documento</label>
            <select id="doc_tipo" name="doc_tipo" value={docTipo} onChange={(e) => setDocTipo(Number(e.target.value))} className="campo">
              {TIPOS_DOC.filter((d) => clase !== "A" || d.id === 80).map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          </div>
          {docTipo !== 99 && (
            <div>
              <label htmlFor="doc_nro" className="etiqueta">{docTipo === 80 ? "CUIT" : "DNI"}</label>
              <input id="doc_nro" name="doc_nro" inputMode="numeric" required defaultValue={v("doc_nro", "")} className="campo font-mono" />
            </div>
          )}
          <div className={docTipo === 99 ? "sm:col-span-2" : ""}>
            <label htmlFor="receptor_nombre" className="etiqueta">
              Nombre / razón social <span className="font-normal text-stone-400">{docTipo === 99 ? "(opcional)" : ""}</span>
            </label>
            <input id="receptor_nombre" name="receptor_nombre" maxLength={200} defaultValue={v("receptor_nombre", "")} className="campo" />
          </div>
        </div>
        <div>
          <label htmlFor="condicion_iva_receptor" className="etiqueta">Condición frente al IVA</label>
          <select
            id="condicion_iva_receptor"
            name="condicion_iva_receptor"
            key={clase}
            defaultValue={v("condicion_iva_receptor", String(condiciones[0].id))}
            className="campo"
          >
            {condiciones.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="tarjeta space-y-3">
        <legend className="px-1 font-semibold">Ítems</legend>
        <input type="hidden" name="items" value={items.length} />
        {items.map((it, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_6rem_9rem_7rem_auto]">
            <input
              name={`item_descripcion_${i}`}
              value={it.descripcion}
              onChange={(e) => cambiarItem(i, { descripcion: e.target.value })}
              placeholder="Descripción"
              maxLength={200}
              className="campo"
            />
            <input
              name={`item_cantidad_${i}`}
              value={it.cantidad}
              onChange={(e) => cambiarItem(i, { cantidad: e.target.value })}
              inputMode="decimal"
              placeholder="Cant."
              className="campo text-right font-mono"
            />
            <input
              name={`item_precio_${i}`}
              value={it.precio}
              onChange={(e) => cambiarItem(i, { precio: e.target.value })}
              inputMode="decimal"
              placeholder={clase === "C" ? "Precio final" : "Precio sin IVA"}
              className="campo text-right font-mono"
            />
            {clase !== "C" ? (
              <select name={`item_alicuota_${i}`} value={it.alicuota} onChange={(e) => cambiarItem(i, { alicuota: e.target.value })} className="campo">
                {ALICUOTAS.map((a) => (
                  <option key={a.id} value={a.id}>IVA {String(a.porcentaje).replace(".", ",")}%</option>
                ))}
              </select>
            ) : (
              <span />
            )}
            <button
              type="button"
              disabled={items.length === 1}
              onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
              className="px-2 text-sm text-stone-400 hover:text-red-700 disabled:opacity-30"
              aria-label="Quitar ítem"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setItems((prev) => [...prev, itemVacio()])} className="text-sm text-stone-600 underline hover:text-stone-900">
          + Agregar ítem
        </button>

        <dl className="ml-auto max-w-xs space-y-1 border-t border-stone-200 pt-3 text-sm">
          {clase !== "C" && (
            <>
              <div className="flex justify-between"><dt className="text-stone-500">Neto</dt><dd className="font-mono">{formatoPesos(totales.neto)}</dd></div>
              {totales.alicuotas.map((a) => (
                <div key={a.id} className="flex justify-between">
                  <dt className="text-stone-500">IVA {String(ALICUOTAS.find((x) => x.id === a.id)?.porcentaje).replace(".", ",")}%</dt>
                  <dd className="font-mono">{formatoPesos(a.importe)}</dd>
                </div>
              ))}
            </>
          )}
          <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="font-mono">{formatoPesos(totales.total)}</dd></div>
        </dl>
      </fieldset>

      <fieldset className="tarjeta space-y-4">
        <legend className="px-1 font-semibold">En la app</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="evento_id" className="etiqueta">Evento <span className="font-normal text-stone-400">(opcional)</span></label>
            <select id="evento_id" name="evento_id" defaultValue={v("evento_id", "")} className="campo">
              <option value="">Sin evento</option>
              {eventos.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre} · {formatoFecha(e.fecha)}</option>
              ))}
            </select>
          </div>
          {puedeRegistrarIngreso && (
            <div>
              <label htmlFor="categoria_id" className="etiqueta">Categoría del ingreso</label>
              <select id="categoria_id" name="categoria_id" defaultValue={v("categoria_id", categorias[0]?.id ?? "")} className="campo">
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {puedeRegistrarIngreso && (
          <label className="flex items-center gap-2 text-sm">
            {/* En pruebas viene destildado para no mezclar facturas de prueba con los datos reales. */}
            <input type="checkbox" name="registrar_ingreso" defaultChecked={entorno !== "homologacion"} />
            Registrar el ingreso en Financiero (pendiente de cobro)
          </label>
        )}
      </fieldset>

      {estado.error && (
        <div className="alerta-error" role="alert">
          <p className="font-medium">{estado.error}</p>
          {estado.detalles && (
            <ul className="mt-1 list-disc pl-5">
              {estado.detalles.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={enviando || totales.total <= 0} className="boton">
          {enviando ? "Pidiendo CAE a ARCA…" : `Emitir ${TIPOS_CBTE.find((t) => t.id === tipo)?.nombre} por ${formatoPesos(totales.total)}`}
        </button>
        <Link href="/facturar" className="text-sm text-stone-600 hover:text-stone-900">Cancelar</Link>
      </div>
    </form>
  );
}
