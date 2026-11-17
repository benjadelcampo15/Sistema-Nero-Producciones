"use client";

import { useState, useTransition } from "react";
import { guardarReceta } from "@/lib/stock/acciones-consumido";
import type { RecetaGuardada } from "@/lib/stock/consumido";
import type { Producto } from "@/lib/stock/fudo";

type Filtro = "pendientes" | "configurados" | "ignorados" | "todos";
const estadoDe = (r: RecetaGuardada) => (r.tipo === "ignorar" ? "ignorados" : r.items.length ? "configurados" : "pendientes");
const n = (x: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(x);

export function EditorRecetas({ recetas, productos, edita }: { recetas: RecetaGuardada[]; productos: Producto[]; edita: boolean }) {
  const cuenta = (f: Filtro) => (f === "todos" ? recetas.length : recetas.filter((r) => estadoDe(r) === f).length);
  const [filtro, setFiltro] = useState<Filtro>(cuenta("pendientes") ? "pendientes" : "todos");
  const [q, setQ] = useState("");
  const lista = recetas.filter((r) => (filtro === "todos" || estadoDe(r) === filtro) && (!q || `${r.nombre} ${r.categoria ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  if (!recetas.length) {
    return <p className="tarjeta text-center text-sm text-stone-500">Todavía no hay productos de FUDO para esta empresa. Aparecen solos al importar el primer reporte.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["pendientes", "configurados", "ignorados", "todos"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFiltro(f)} className={`rounded-full px-3 py-1 text-sm ${filtro === f ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700"} ${f === "pendientes" && cuenta(f) ? "font-semibold" : ""}`}>
            {f === "pendientes" ? "Pendientes de configuración" : f === "configurados" ? "Configurados" : f === "ignorados" ? "No son mercadería" : "Todos"} ({cuenta(f)})
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" aria-label="Buscar producto de FUDO" className="campo w-52" />
      </div>
      {lista.length === 0 ? (
        <p className="tarjeta text-center text-sm text-stone-500">Nada en esta vista.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((r) => (
            <Receta key={`${r.id}-${r.actualizado_en}`} receta={r} productos={productos} edita={edita} />
          ))}
        </ul>
      )}
    </div>
  );
}

type Item = { producto_id: string; cantidad: string; detalle: string };

function Receta({ receta, productos, edita }: { receta: RecetaGuardada; productos: Producto[]; edita: boolean }) {
  const estado = estadoDe(receta);
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState(receta.tipo);
  const [nota, setNota] = useState(receta.nota ?? "");
  const [items, setItems] = useState<Item[]>(receta.items.map((i) => ({ producto_id: i.producto_id, cantidad: String(i.cantidad).replace(".", ","), detalle: i.detalle ?? "" })));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const nombre = (id: string) => productos.find((p) => p.id === id);
  const cambiar = (i: number, c: Partial<Item>) => setItems(items.map((x, j) => (j === i ? { ...x, ...c } : x)));
  const guardar = () =>
    iniciar(async () => {
      const lista = items.filter((i) => i.producto_id);
      const r = await guardarReceta(receta.id, {
        tipo,
        nota,
        items: tipo === "ignorar" ? [] : lista.map((i) => ({ producto_id: i.producto_id, cantidad: Number(i.cantidad.replace(",", ".")), detalle: i.detalle || undefined })),
      });
      setError(r.error ?? null);
      if (!r.error) setAbierto(false);
    });

  return (
    <li className={`tarjeta p-3 ${estado === "pendientes" ? "border-amber-300" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium">{receta.nombre}</span>
          {receta.categoria && <span className="ml-2 text-xs text-stone-500">{receta.categoria}</span>}
          <p className="text-sm text-stone-600">
            {estado === "pendientes" && <span className="rounded bg-amber-100 px-1.5 text-xs font-medium text-amber-900">Pendiente de configuración</span>}
            {estado === "ignorados" && <span className="text-stone-500">No consume mercadería{receta.nota ? ` · ${receta.nota}` : ""}</span>}
            {estado === "configurados" && receta.items.map((i) => `${n(i.cantidad)} ${nombre(i.producto_id)?.unidad ?? ""} ${nombre(i.producto_id)?.nombre ?? "producto borrado"}`).join(" + ")}
          </p>
        </div>
        {edita && !abierto && (
          <button type="button" onClick={() => setAbierto(true)} className="boton-secundario py-1 text-sm">
            {estado === "pendientes" ? "Configurar" : "Editar"}
          </button>
        )}
      </div>
      {abierto && (
        <div className="mt-3 space-y-2 border-t border-stone-100 pt-3 text-sm">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1">
              <input type="radio" checked={tipo === "receta"} onChange={() => setTipo("receta")} /> Consume productos de stock
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={tipo === "ignorar"} onChange={() => setTipo("ignorar")} /> No es mercadería (entrada, servicio, etc.)
            </label>
          </div>
          {tipo === "receta" && (
            <>
              <p className="text-xs text-stone-500">Por cada unidad vendida en FUDO se consume:</p>
              {items.map((it, i) => (
                <ItemReceta key={i} item={it} productos={productos} usados={items.map((x) => x.producto_id)} onCambio={(c) => cambiar(i, c)} onQuitar={() => setItems(items.filter((_, j) => j !== i))} />
              ))}
              <button type="button" onClick={() => setItems([...items, { producto_id: "", cantidad: "1", detalle: "" }])} className="text-sm underline">
                + Agregar producto
              </button>
            </>
          )}
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" maxLength={500} aria-label="Nota" className="campo" />
          {error && <p className="text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={pendiente || (tipo === "receta" && !items.some((i) => i.producto_id))} onClick={guardar} className="boton py-1 text-sm">
              Guardar
            </button>
            <button type="button" onClick={() => setAbierto(false)} className="boton-secundario py-1 text-sm">Cancelar</button>
          </div>
          <p className="text-xs text-stone-500">El cambio vale para todos los eventos de esta empresa (también para comparaciones ya hechas, que se recalculan).</p>
        </div>
      )}
    </li>
  );
}

function ItemReceta({ item, productos, usados, onCambio, onQuitar }: { item: Item; productos: Producto[]; usados: string[]; onCambio: (c: Partial<Item>) => void; onQuitar: () => void }) {
  const [ml, setMl] = useState({ trago: "", botella: "" });
  const prod = productos.find((p) => p.id === item.producto_id);
  const fraccion = Number(ml.trago.replace(",", ".")) / Number(ml.botella.replace(",", "."));
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-stone-200 p-2">
      <select value={item.producto_id} onChange={(e) => onCambio({ producto_id: e.target.value })} aria-label="Producto de stock" className="campo w-64">
        <option value="">Elegí un producto de stock…</option>
        {productos.filter((p) => p.id === item.producto_id || !usados.includes(p.id)).map((p) => (
          <option key={p.id} value={p.id}>{p.nombre} ({p.unidad})</option>
        ))}
      </select>
      <input value={item.cantidad} onChange={(e) => onCambio({ cantidad: e.target.value })} inputMode="decimal" aria-label="Cantidad por unidad vendida" className="campo w-24 text-right font-mono" />
      <span className="text-stone-600">{prod?.unidad ?? ""}</span>
      <input value={item.detalle} onChange={(e) => onCambio({ detalle: e.target.value })} placeholder="Detalle (ej. 50 ml)" maxLength={200} aria-label="Detalle" className="campo w-40" />
      <button type="button" onClick={onQuitar} className="text-xs text-red-700 underline">Quitar</button>
      <span className="flex basis-full flex-wrap items-center gap-1 text-xs text-stone-500">
        Calcular fracción: trago de
        <input value={ml.trago} onChange={(e) => setMl({ ...ml, trago: e.target.value })} inputMode="decimal" aria-label="ml del trago" className="w-14 rounded border border-stone-200 px-1" /> ml sobre botella de
        <input value={ml.botella} onChange={(e) => setMl({ ...ml, botella: e.target.value })} inputMode="decimal" aria-label="ml de la botella" className="w-16 rounded border border-stone-200 px-1" /> ml
        {Number.isFinite(fraccion) && fraccion > 0 && (
          <button type="button" onClick={() => onCambio({ cantidad: String(Math.round(fraccion * 10000) / 10000).replace(".", ","), detalle: `${ml.trago} ml de ${ml.botella} ml` })} className="underline">
            usar {n(Math.round(fraccion * 10000) / 10000)}
          </button>
        )}
      </span>
    </div>
  );
}
