"use client";

import { useState } from "react";
import { UNIDADES, type Deposito, type Producto } from "@/lib/stock/tipos";

export type ItemFactura = {
  descripcion: string;
  cantidad?: number;
  subtotal_neto?: number;
  impuestos_internos?: number;
  /** Lecturas anteriores de la IA traían el precio unitario directo. */
  precio_unitario?: number;
  importe?: number;
};

/**
 * Costo unitario real sin IVA = (subtotal neto con descuentos + impuestos internos) / cantidad.
 * Lo calcula la app (no la IA) para que no dependa de que el modelo haga bien la cuenta.
 */
function costoUnitario(it: ItemFactura) {
  const cantidad = it.cantidad || 1;
  if (it.subtotal_neto) return (it.subtotal_neto + (it.impuestos_internos ?? 0)) / cantidad;
  return it.precio_unitario || undefined;
}

type Renglon = { incluir: boolean; producto: string; nombre: string; unidad: string; cantidad: string; costo: string };

const aTexto = (n?: number) => (n ? String(n).replace(".", ",") : "");

/** Busca un producto existente con el mismo nombre que el renglón de la factura. */
function productoParecido(descripcion: string, productos: Producto[]) {
  const d = descripcion.trim().toLowerCase();
  return productos.find((p) => p.nombre.toLowerCase() === d || (p.nombre.length > 3 && d.includes(p.nombre.toLowerCase())));
}

/**
 * Parte del formulario de aprobación (va dentro del mismo <form>).
 * Pregunta a qué depósito ingresa la mercadería y vincula cada renglón a un producto.
 */
export function SeccionStock({
  items,
  productos,
  depositos,
  ingresaInicial,
}: {
  items: ItemFactura[];
  productos: Producto[];
  depositos: Deposito[];
  ingresaInicial: boolean;
}) {
  const [ingresa, setIngresa] = useState(ingresaInicial);
  const [deposito, setDeposito] = useState(depositos.length === 1 ? depositos[0].id : "");
  const [renglones, setRenglones] = useState<Renglon[]>(() =>
    (items.length ? items : [{ descripcion: "" }]).map((it) => {
      const existente = productoParecido(it.descripcion, productos);
      const costo = costoUnitario(it);
      return {
        incluir: true,
        producto: existente?.id ?? "nuevo",
        nombre: it.descripcion.slice(0, 120),
        unidad: existente?.unidad ?? "unidad",
        cantidad: aTexto(it.cantidad ?? 1),
        costo: aTexto(costo ? Math.round(costo * 100) / 100 : undefined),
      };
    }),
  );

  const cambiar = (i: number, cambio: Partial<Renglon>) =>
    setRenglones((prev) => prev.map((r, j) => (j === i ? { ...r, ...cambio } : r)));

  return (
    <fieldset className="tarjeta space-y-3">
      <legend className="px-1 font-semibold">Ingreso a stock</legend>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="stock_ingresa" checked={ingresa} onChange={(e) => setIngresa(e.target.checked)} className="mt-0.5" />
        <span>
          <span className="font-medium">Esta factura es una compra de mercadería que entra a un depósito</span>
          {ingresaInicial && <span className="block text-xs text-stone-500">La IA detectó que es una compra de productos.</span>}
        </span>
      </label>

      {ingresa && (
        <>
          <div>
            <p className="etiqueta">¿A qué depósito va?</p>
            <div className="flex flex-wrap gap-2">
              {depositos.map((d) => (
                <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm has-[:checked]:border-stone-900 has-[:checked]:bg-stone-900 has-[:checked]:text-white">
                  <input type="radio" name="stock_deposito_id" value={d.id} checked={deposito === d.id} onChange={() => setDeposito(d.id)} className="sr-only" />
                  {d.nombre}
                </label>
              ))}
            </div>
          </div>

          <input type="hidden" name="stock_items" value={renglones.length} />
          <div className="space-y-3">
            {renglones.map((r, i) => (
              <div key={i} className={`space-y-2 rounded-md border border-stone-200 p-3 ${r.incluir ? "" : "opacity-50"}`}>
                <label className="flex items-center gap-2 text-xs text-stone-600">
                  <input type="checkbox" name={`stock_incluir_${i}`} checked={r.incluir} onChange={(e) => cambiar(i, { incluir: e.target.checked })} />
                  Renglón {i + 1}: incluir en el stock
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="etiqueta">Producto</label>
                    <select name={`stock_producto_${i}`} value={r.producto} onChange={(e) => cambiar(i, { producto: e.target.value })} className="campo">
                      <option value="nuevo">+ Producto nuevo</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre} ({p.unidad})</option>
                      ))}
                    </select>
                  </div>
                  {r.producto === "nuevo" && (
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <div>
                        <label className="etiqueta">Nombre del producto</label>
                        <input name={`stock_nombre_${i}`} value={r.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} maxLength={120} className="campo" />
                      </div>
                      <div>
                        <label className="etiqueta">Unidad</label>
                        <select name={`stock_unidad_${i}`} value={r.unidad} onChange={(e) => cambiar(i, { unidad: e.target.value })} className="campo">
                          {UNIDADES.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="etiqueta">Cantidad</label>
                    <input name={`stock_cantidad_${i}`} value={r.cantidad} onChange={(e) => cambiar(i, { cantidad: e.target.value })} inputMode="decimal" className="campo text-right font-mono" />
                  </div>
                  <div>
                    <label className="etiqueta">Costo unitario sin IVA ($)</label>
                    <input name={`stock_costo_${i}`} value={r.costo} onChange={(e) => cambiar(i, { costo: e.target.value })} inputMode="decimal" className="campo text-right font-mono" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="text-sm text-stone-600 underline hover:text-stone-900"
            onClick={() =>
              setRenglones((prev) => [...prev, { incluir: true, producto: "nuevo", nombre: "", unidad: "unidad", cantidad: "1", costo: "" }])
            }
          >
            + Agregar renglón
          </button>
        </>
      )}
    </fieldset>
  );
}
