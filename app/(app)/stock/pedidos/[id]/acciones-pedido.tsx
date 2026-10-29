"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { borrarPedido, cancelarPedido, recibirPedido } from "@/lib/pedidos/acciones";
import { pedidoAbierto, type Pedido } from "@/lib/pedidos/tipos";
import { formatoCantidad } from "@/lib/stock/tipos";
import { formatoFecha, formatoPesos, hoy, parsearMonto } from "@/lib/formato";

const aTexto = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

export function AccionesPedido({ pedido, editable, recibirAbierto = false }: { pedido: Pedido; editable: boolean; recibirAbierto?: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [recibiendo, setRecibiendo] = useState(recibirAbierto && editable && pedidoAbierto(pedido.estado));
  const [fecha, setFecha] = useState(hoy());
  // Lo que se espera recibir: lo que confirmó el proveedor o, si no respondió, lo pedido.
  const [recibido, setRecibido] = useState<Record<string, { cantidad: string; regalo: string; costo: string }>>(() =>
    Object.fromEntries(
      pedido.items.map((i) => [i.producto.id, { cantidad: aTexto(i.cantidad_confirmada ?? i.cantidad), regalo: i.bonificadas ? aTexto(i.bonificadas) : "", costo: aTexto(i.precio_unitario) }]),
    ),
  );
  const abierto = pedidoAbierto(pedido.estado);
  const conRegalo = pedido.items.some((i) => i.bonificadas > 0);

  function accion(fn: () => Promise<{ error?: string }>, destino?: string) {
    setError(null);
    iniciar(async () => {
      const r = await fn();
      if (r.error) return setError(r.error);
      if (destino) router.push(destino);
      else router.refresh();
    });
  }

  function confirmarRecepcion() {
    const items = pedido.items.map((i) => {
      const r = recibido[i.producto.id];
      const cantidad = r.cantidad.trim() ? parsearMonto(r.cantidad) : 0;
      const regalo = r.regalo.trim() ? parsearMonto(r.regalo) : 0;
      const costo = r.costo.trim() ? parsearMonto(r.costo) : null;
      return { producto_id: i.producto.id, cantidad, regalo, costo, mal: cantidad === null || regalo === null || (r.costo.trim() !== "" && costo === null) };
    });
    if (items.some((i) => i.mal)) return setError("Hay una cantidad o un costo mal escrito");
    accion(() =>
      recibirPedido(pedido.id, {
        fecha,
        items: items.map((i) => ({ producto_id: i.producto_id, cantidad_recibida: i.cantidad as number, bonificadas_recibidas: i.regalo as number, costo_unitario: i.costo })),
      }),
    );
    setRecibiendo(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <a href={`/imprimir/pedido/${pedido.id}`} target="_blank" rel="noreferrer" className="boton-secundario">Imprimir</a>
        {editable && abierto && (
          <>
            <Link href={`/stock/pedidos/${pedido.id}/editar`} className="boton-secundario">Editar</Link>
            <button type="button" onClick={() => setRecibiendo(true)} className="boton">Recibir mercadería</button>
            <button type="button" disabled={pendiente} onClick={() => confirm("¿Cancelar este pedido?") && accion(() => cancelarPedido(pedido.id))} className="text-sm text-stone-600 hover:text-stone-900">
              Cancelar pedido
            </button>
          </>
        )}
        {editable && pedido.estado !== "recibido" && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => confirm("¿Borrar este pedido? No se puede deshacer.") && accion(() => borrarPedido(pedido.id), "/stock/pedidos")}
            className="ml-auto text-sm text-red-700 hover:underline"
          >
            Borrar
          </button>
        )}
      </div>
      {error && <p className="alerta-error">{error}</p>}

      {recibiendo && (
        <section className="tarjeta space-y-3 border-green-300">
          <h2 className="font-semibold">Recibir mercadería en {pedido.deposito.nombre}</h2>
          <p className="text-sm text-stone-500">
            Corregí lo que llegó distinto (0 si no llegó). Entra al stock con el costo de cada producto; lo de regalo entra con costo $0.
          </p>
          <div className="w-48">
            <label htmlFor="fecha_recepcion" className="etiqueta">Fecha de recepción</label>
            <input id="fecha_recepcion" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo" />
          </div>
          <div className="overflow-x-auto rounded-md border border-stone-200">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Pedido</th>
                  <th className="w-32 px-3 py-2 text-right">Llegó</th>
                  {conRegalo && <th className="w-28 px-3 py-2 text-right">De regalo</th>}
                  <th className="w-40 px-3 py-2 text-right">Costo unit.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {pedido.items.map((i) => (
                  <tr key={i.producto.id}>
                    <td className="px-3 py-1.5 font-medium">{i.producto.nombre}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-stone-600">
                      {formatoCantidad(i.cantidad)}
                      {i.cantidad_confirmada !== null && i.cantidad_confirmada !== i.cantidad && (
                        <span className="block text-xs text-violet-700">confirmó {formatoCantidad(i.cantidad_confirmada)}</span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <input
                        aria-label={`Llegó de ${i.producto.nombre}`}
                        inputMode="decimal"
                        value={recibido[i.producto.id].cantidad}
                        onChange={(e) => setRecibido((r) => ({ ...r, [i.producto.id]: { ...r[i.producto.id], cantidad: e.target.value } }))}
                        className="campo py-1 text-right font-mono"
                      />
                    </td>
                    {conRegalo && (
                      <td className="px-2 py-1">
                        <input
                          aria-label={`De regalo de ${i.producto.nombre}`}
                          inputMode="decimal"
                          value={recibido[i.producto.id].regalo}
                          placeholder="0"
                          onChange={(e) => setRecibido((r) => ({ ...r, [i.producto.id]: { ...r[i.producto.id], regalo: e.target.value } }))}
                          className="campo py-1 text-right font-mono"
                        />
                      </td>
                    )}
                    <td className="px-2 py-1">
                      <input
                        aria-label={`Costo unitario de ${i.producto.nombre}`}
                        inputMode="decimal"
                        value={recibido[i.producto.id].costo}
                        onChange={(e) => setRecibido((r) => ({ ...r, [i.producto.id]: { ...r[i.producto.id], costo: e.target.value } }))}
                        className="campo py-1 text-right font-mono"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={confirmarRecepcion} disabled={pendiente} className="boton">{pendiente ? "Guardando…" : "Confirmar recepción"}</button>
            <button type="button" onClick={() => setRecibiendo(false)} className="text-sm text-stone-600 hover:text-stone-900">Cancelar</button>
          </div>
        </section>
      )}
      {pedido.estado === "recibido" && pedido.recibido_en && (
        <p className="text-sm text-green-700">
          Recibido el {formatoFecha(pedido.recibido_en)}: la mercadería entró al stock de {pedido.deposito.nombre} ({formatoPesos(pedido.items.reduce((t, i) => t + (i.cantidad_recibida ?? 0) * (i.precio_unitario ?? 0), 0))} a precio de pedido).
        </p>
      )}
    </div>
  );
}
