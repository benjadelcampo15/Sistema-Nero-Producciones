"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmarPedidoProveedor } from "@/lib/pedidos/acciones";
import { describirPromo, type Pedido } from "@/lib/pedidos/tipos";
import { formatoCantidad } from "@/lib/stock/tipos";
import { formatoFecha, formatoPesos, parsearMonto } from "@/lib/formato";

const aTexto = (n: number) => String(n).replace(".", ",");

/** Un pedido en la página del proveedor: lo ve, baja el PDF y, si sigue abierto, lo confirma o corrige. */
export function PedidoProveedor({ token, pedido: p }: { token: string; pedido: Pedido }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const abierto = p.estado === "enviado" || p.estado === "confirmado";
  const [editando, setEditando] = useState(p.estado === "enviado");
  const [cantidades, setCantidades] = useState<Record<string, string>>(() => Object.fromEntries(p.items.map((i) => [i.producto.id, aTexto(i.cantidad_confirmada ?? i.cantidad)])));
  const [notas, setNotas] = useState<Record<string, string>>(() => Object.fromEntries(p.items.map((i) => [i.producto.id, i.nota_proveedor ?? ""])));
  const [fechaEntrega, setFechaEntrega] = useState(p.fecha_entrega_confirmada ?? p.fecha_entrega ?? "");
  const [respuesta, setRespuesta] = useState(p.respuesta_proveedor ?? "");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const conPrecios = p.items.some((i) => i.precio_unitario !== null);

  function confirmar() {
    setError(null);
    const items = p.items.map((i) => {
      const t = (cantidades[i.producto.id] ?? "").trim();
      const v = t === "" ? 0 : /^\d+(\.\d{1,3})?$/.test(t) ? Number(t) : parsearMonto(t);
      return { producto_id: i.producto.id, cantidad: v, nota: notas[i.producto.id]?.trim() || undefined };
    });
    if (items.some((i) => i.cantidad === null || Number.isNaN(i.cantidad))) return setError("Hay una cantidad mal escrita");
    iniciar(async () => {
      const r = await confirmarPedidoProveedor(token, p.id, {
        respuesta,
        fecha_entrega: fechaEntrega,
        items: items.map((i) => ({ ...i, cantidad: i.cantidad as number })),
      });
      if (r.error) return setError(r.error);
      setListo(true);
      setEditando(false);
      router.refresh();
    });
  }

  return (
    <article id={`pedido-${p.numero}`} className="scroll-mt-4 rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 p-4">
        <div>
          <p className="text-lg font-semibold">Pedido N° {p.numero}</p>
          <p className="text-sm text-stone-500">
            Del {formatoFecha(p.fecha)} · entregar en <span className="font-medium text-stone-800">{p.deposito.nombre}</span>
            {p.fecha_entrega && ` el ${formatoFecha(p.fecha_entrega)}`}
          </p>
        </div>
        <a href={`/p/proveedor/${token}/pedido/${p.numero}`} target="_blank" rel="noreferrer" className="boton-secundario shrink-0">Bajar PDF</a>
      </div>

      <ul className="divide-y divide-stone-100">
        {p.items.map((i) => {
          const confirmada = i.cantidad_confirmada;
          return (
            <li key={i.producto.id} className="space-y-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium leading-tight">{i.producto.nombre}</p>
                  {i.promo && <p className="text-xs font-semibold text-amber-700">Promo {describirPromo(i.promo)}{i.bonificadas > 0 && ` → +${formatoCantidad(i.bonificadas)} de regalo`}</p>}
                  {i.aclaracion && <p className="text-sm italic text-stone-600">{i.aclaracion}</p>}
                  {conPrecios && i.precio_unitario !== null && <p className="text-xs text-stone-500">{formatoPesos(i.precio_unitario)} c/u</p>}
                </div>
                <p className="shrink-0 text-right">
                  <span className="font-mono text-xl font-semibold">{formatoCantidad(i.cantidad)}</span>
                  <span className="block text-xs text-stone-500">{i.producto.unidad}</span>
                </p>
              </div>
              {!editando && confirmada !== null && confirmada !== i.cantidad && (
                <p className="text-sm text-violet-800">
                  Confirmaste {formatoCantidad(confirmada)}
                  {i.nota_proveedor && ` · ${i.nota_proveedor}`}
                </p>
              )}
              {abierto && editando && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 p-2">
                  <label className="flex items-center gap-2 text-sm text-stone-600">
                    Mando
                    <input
                      inputMode="decimal"
                      aria-label={`Cuánto mandás de ${i.producto.nombre}`}
                      value={cantidades[i.producto.id] ?? ""}
                      onChange={(e) => setCantidades((c) => ({ ...c, [i.producto.id]: e.target.value }))}
                      className="h-10 w-20 rounded-md border border-stone-300 bg-white px-2 text-center font-mono text-base"
                    />
                  </label>
                  <input
                    aria-label={`Comentario sobre ${i.producto.nombre}`}
                    placeholder="Comentario (opcional)"
                    maxLength={300}
                    value={notas[i.producto.id] ?? ""}
                    onChange={(e) => setNotas((n) => ({ ...n, [i.producto.id]: e.target.value }))}
                    className="h-10 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-2 text-base"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {p.notas && <p className="border-t border-stone-100 px-4 py-3 text-sm text-stone-700">{p.notas}</p>}

      {abierto && (
        <div className="space-y-3 border-t border-stone-100 p-4">
          {editando ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`entrega-${p.id}`} className="etiqueta">¿Cuándo lo entregás?</label>
                  <input id={`entrega-${p.id}`} type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} className="campo h-11 text-base" />
                </div>
                <div>
                  <label htmlFor={`respuesta-${p.id}`} className="etiqueta">Comentario general</label>
                  <input id={`respuesta-${p.id}`} maxLength={1000} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder="Opcional" className="campo h-11 text-base" />
                </div>
              </div>
              {error && <p className="alerta-error">{error}</p>}
              <button type="button" onClick={confirmar} disabled={pendiente} className="boton h-12 w-full text-base">
                {pendiente ? "Enviando…" : p.estado === "confirmado" ? "Actualizar confirmación" : "Confirmar pedido"}
              </button>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-green-700">
                {listo ? "¡Listo! Les avisamos que lo confirmaste." : "Ya confirmaste este pedido."}
                {(p.fecha_entrega_confirmada || fechaEntrega) && ` Entrega: ${formatoFecha(p.fecha_entrega_confirmada ?? fechaEntrega)}.`}
              </p>
              <button type="button" onClick={() => setEditando(true)} className="text-sm text-stone-600 underline">Cambiar</button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
