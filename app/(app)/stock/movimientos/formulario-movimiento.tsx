"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { registrarMovimiento } from "@/lib/stock/acciones";
import { NOMBRE_TIPO_STOCK, TIPOS_MOVIMIENTO_STOCK, type Deposito, type FilaStock, type Producto, type TipoMovimientoStock } from "@/lib/stock/tipos";
import { FormularioSalida } from "./formulario-salida";
import type { EventoResumido } from "@/lib/financiero/tipos";
import { hoy } from "@/lib/formato";

export function FormularioMovimiento({
  productos,
  depositos,
  eventos,
  productoInicial,
  stock,
}: {
  productos: Producto[];
  stock: FilaStock[];
  depositos: Deposito[];
  eventos: EventoResumido[];
  productoInicial?: string;
}) {
  const [estado, accion, enviando] = useActionState(registrarMovimiento, {});
  const [tipo, setTipo] = useState<TipoMovimientoStock>("entrada");
  const v = (campo: string, inicial = "") => estado.valores?.[campo] ?? inicial;

  const selectorTipo = (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {TIPOS_MOVIMIENTO_STOCK.map((t) => (
        <label
          key={t}
          className={`cursor-pointer rounded-md border px-3 py-2 text-center text-sm font-medium ${
            tipo === t ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-600"
          }`}
        >
          <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => setTipo(t)} className="sr-only" />
          {NOMBRE_TIPO_STOCK[t]}
        </label>
      ))}
    </div>
  );

  // La salida es de varios productos juntos (conteo de barra): tiene su propio formulario.
  if (tipo === "salida") {
    return (
      <section className="space-y-4">
        <div className="tarjeta space-y-4">
          <h2 className="font-semibold">Registrar movimiento</h2>
          {selectorTipo}
        </div>
        {/* En el celular, la salida por conteo tiene su propia pantalla pensada para el teléfono. */}
        <Link href="/stock/conteo" className="flex items-center justify-between rounded-xl border border-stone-900 bg-stone-900 px-4 py-4 text-white md:hidden">
          <span>
            <span className="block font-semibold">Contar lo que quedó</span>
            <span className="text-sm text-stone-300">Elegí la barra y cargá producto por producto</span>
          </span>
          <span aria-hidden className="text-xl">→</span>
        </Link>
        <div className="hidden md:block">
          <FormularioSalida stock={stock} depositos={depositos} eventos={eventos} />
        </div>
      </section>
    );
  }

  return (
    <form action={accion} className="tarjeta space-y-4">
      <h2 className="font-semibold">Registrar movimiento</h2>
      {estado.error && <p className="alerta-error">{estado.error}</p>}
      {estado.ok && <p className="text-sm text-green-700">{estado.ok}</p>}

      {selectorTipo}


      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label htmlFor="producto_id" className="etiqueta">Producto</label>
          <select id="producto_id" name="producto_id" required defaultValue={v("producto_id", productoInicial ?? "")} className="campo">
            <option value="" disabled>Elegí…</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre} ({p.unidad})</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="deposito_id" className="etiqueta">{tipo === "transferencia" ? "Desde" : "Depósito"}</label>
          <select id="deposito_id" name="deposito_id" required defaultValue={v("deposito_id")} className="campo">
            <option value="" disabled>Elegí…</option>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
        </div>
        {tipo === "transferencia" ? (
          <div>
            <label htmlFor="deposito_destino_id" className="etiqueta">Hacia</label>
            <select id="deposito_destino_id" name="deposito_destino_id" required defaultValue={v("deposito_destino_id")} className="campo">
              <option value="" disabled>Elegí…</option>
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor="fecha" className="etiqueta">Fecha</label>
            <input id="fecha" name="fecha" type="date" required defaultValue={v("fecha", hoy())} className="campo" />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="cantidad" className="etiqueta">
            {tipo === "ajuste" ? "Cantidad contada (real)" : "Cantidad"}
          </label>
          <input id="cantidad" name="cantidad" inputMode="decimal" required defaultValue={v("cantidad")} className="campo text-right font-mono" />
        </div>
        {tipo === "transferencia" && (
          <div>
            <label htmlFor="fecha" className="etiqueta">Fecha</label>
            <input id="fecha" name="fecha" type="date" required defaultValue={v("fecha", hoy())} className="campo" />
          </div>
        )}
        {(tipo === "entrada" || tipo === "ajuste") && (
          <div>
            <label htmlFor="costo_unitario" className="etiqueta">
              Costo unitario ($) <span className="font-normal text-stone-400">(opcional)</span>
            </label>
            <input id="costo_unitario" name="costo_unitario" inputMode="decimal" defaultValue={v("costo_unitario")} className="campo text-right font-mono" />
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor="motivo" className="etiqueta">
            Motivo <span className="font-normal text-stone-400">(opcional)</span>
          </label>
          <input
            id="motivo"
            name="motivo"
            maxLength={200}
            defaultValue={v("motivo")}
            className="campo"
          />
        </div>
      </div>

      {tipo === "ajuste" && (
        <p className="text-xs text-stone-500">
          Ingresá lo que contaste físicamente: el sistema registra la diferencia con lo que tenía.
        </p>
      )}

      <button type="submit" disabled={enviando} className="boton">
        {enviando ? "Guardando…" : "Registrar"}
      </button>
    </form>
  );
}
