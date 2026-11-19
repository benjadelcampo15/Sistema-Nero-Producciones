"use client";

import { useEffect, useState, useTransition } from "react";
import { guardarStockEvento } from "@/lib/stock/acciones-evento";
import { useCambiosPendientes, useDatosDelServidor } from "@/lib/cambios-pendientes";
import { formatoCantidad } from "@/lib/stock/tipos";

type Item = { producto_id: string; cantidad: number | null; nota: string | null };
type ProductoStock = { id: string; nombre: string; unidad: string; codigo: string | null; porDeposito: Record<string, number>; total: number };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Productos que se usan en el evento: se eligen del stock, con cantidad prevista opcional. */
export function EditorStockEvento({
  eventoId,
  inicial,
  depositos,
  stock,
  editable,
}: {
  eventoId: string;
  inicial: Item[];
  depositos: { id: string; nombre: string }[];
  stock: ProductoStock[];
  editable: boolean;
}) {
  const [lista, setLista] = useState<Item[]>(inicial);
  const [sinGuardar, setSinGuardar] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [q, setQ] = useState("");
  const [pendiente, iniciar] = useTransition();
  useDatosDelServidor(inicial, sinGuardar, setLista);

  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar]);

  const cambiar = (l: Item[]) => {
    setLista(l);
    setSinGuardar(true);
    setMensaje(null);
  };
  const guardar = () =>
    iniciar(async () => {
      const r = await guardarStockEvento(eventoId, lista);
      if (r.error) return setMensaje({ tipo: "error", texto: r.error });
      setSinGuardar(false);
      setMensaje({ tipo: "ok", texto: "Lista guardada" });
    });
  useCambiosPendientes(sinGuardar && editable, "Stock del evento", guardar);

  const producto = (id: string) => stock.find((s) => s.id === id);
  const elegidos = new Set(lista.map((i) => i.producto_id));
  const busqueda = normalizar(q.trim());
  const disponibles = busqueda
    ? stock.filter((s) => !elegidos.has(s.id) && (normalizar(s.nombre).includes(busqueda) || normalizar(s.codigo ?? "").includes(busqueda)))
    : [];
  const agregar = (ids: string[]) => cambiar([...lista, ...ids.map((producto_id) => ({ producto_id, cantidad: null, nota: null }))]);
  const editar = (i: number, c: Partial<Item>) => cambiar(lista.map((x, j) => (j === i ? { ...x, ...c } : x)));
  const mover = (i: number, d: -1 | 1) => {
    const otra = [...lista];
    [otra[i], otra[i + d]] = [otra[i + d], otra[i]];
    cambiar(otra);
  };
  const conFaltante = lista.filter((i) => i.cantidad !== null && i.cantidad > (producto(i.producto_id)?.total ?? 0)).length;

  return (
    <div className="space-y-4">
      {editable && (
        <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 bg-stone-100/90 px-1 py-2 backdrop-blur">
          <div className="relative w-full max-w-md">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto para agregar (nombre o código)…" aria-label="Buscar producto" className="campo" />
            {disponibles.length > 0 && (
              <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg">
                {disponibles.length > 1 && (
                  <button type="button" onClick={() => { agregar(disponibles.map((d) => d.id)); setQ(""); }} className="w-full border-b border-stone-100 px-3 py-1.5 text-left text-xs font-medium text-stone-700 hover:bg-stone-50">
                    + Agregar los {disponibles.length} que coinciden
                  </button>
                )}
                {disponibles.slice(0, 40).map((d) => (
                  <button key={d.id} type="button" onClick={() => { agregar([d.id]); setQ(""); }} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-stone-50">
                    <span>
                      {d.nombre} <span className="text-xs text-stone-500">{d.unidad}</span>
                    </span>
                    <span className="font-mono text-xs text-stone-600">stock {formatoCantidad(d.total)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {busqueda && !disponibles.length && <span className="text-xs text-stone-500">No hay productos para agregar con ese nombre.</span>}
          {mensaje && <p className={`text-sm ${mensaje.tipo === "error" ? "text-red-700" : "text-green-700"}`}>{mensaje.texto}</p>}
          <button type="button" onClick={guardar} disabled={pendiente || !sinGuardar} className="boton ml-auto">
            {pendiente ? "Guardando…" : sinGuardar ? "Guardar lista" : "Guardada"}
          </button>
        </div>
      )}
      {sinGuardar && <p className="text-xs text-amber-800">Guardá la lista antes de descargar el PDF (el PDF usa la lista guardada).</p>}

      <p className="text-sm text-stone-600">
        {lista.length} producto{lista.length === 1 ? "" : "s"} para el evento
        {conFaltante > 0 && <span className="font-medium text-red-700"> · {conFaltante} con stock insuficiente para lo previsto</span>}
      </p>

      {lista.length === 0 ? (
        <p className="tarjeta text-center text-sm text-stone-500">{editable ? "Buscá arriba los productos que se usan en este evento y agregalos." : "Todavía no se eligieron productos para este evento."}</p>
      ) : (
        <div className="tarjeta overflow-x-auto p-0">
          <table className="w-full text-sm" style={{ minWidth: 640 + depositos.length * 90 }}>
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-2">Producto</th>
                {depositos.map((d) => <th key={d.id} className="px-2 py-2 text-right">{d.nombre}</th>)}
                <th className="px-2 py-2 text-right">Total</th>
                <th className="px-2 py-2 text-right">Previsto</th>
                <th className="px-2 py-2 text-right">Falta</th>
                <th className="px-2 py-2">Nota</th>
                {editable && <th className="w-20" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {lista.map((item, i) => {
                const p = producto(item.producto_id);
                const falta = item.cantidad !== null && p ? r3(Math.max(0, item.cantidad - p.total)) : 0;
                return (
                  <tr key={item.producto_id} className={falta > 0 ? "bg-red-50/50" : ""}>
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{p?.nombre ?? "Producto dado de baja"}</span> <span className="text-xs text-stone-500">{p?.unidad}</span>
                    </td>
                    {depositos.map((d) => (
                      <td key={d.id} className="px-2 py-1.5 text-right font-mono text-stone-600">{formatoCantidad(p?.porDeposito[d.id] ?? 0)}</td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-mono font-semibold">{formatoCantidad(p?.total ?? 0)}</td>
                    <td className="px-1 py-1">
                      <input
                        value={item.cantidad === null ? "" : String(item.cantidad).replace(".", ",")}
                        disabled={!editable}
                        inputMode="decimal"
                        placeholder="—"
                        aria-label={`Cantidad prevista de ${p?.nombre ?? "producto"}`}
                        onChange={(e) => {
                          const t = e.target.value.trim();
                          const n = Number(t.replace(/\./g, "").replace(",", "."));
                          editar(i, { cantidad: t === "" ? null : Number.isFinite(n) && n >= 0 ? n : item.cantidad });
                        }}
                        className="w-20 rounded border border-stone-200 bg-white px-1.5 py-0.5 text-right font-mono disabled:bg-transparent"
                      />
                    </td>
                    <td className={`px-2 py-1.5 text-right font-mono ${falta > 0 ? "font-semibold text-red-700" : "text-stone-400"}`}>{falta > 0 ? formatoCantidad(falta) : "—"}</td>
                    <td className="px-1 py-1">
                      <input value={item.nota ?? ""} disabled={!editable} maxLength={300} placeholder="Ej.: para la barra 2" aria-label="Nota" onChange={(e) => editar(i, { nota: e.target.value || null })} className="w-44 rounded border border-stone-200 bg-white px-1.5 py-0.5 disabled:bg-transparent" />
                    </td>
                    {editable && (
                      <td className="whitespace-nowrap px-1 text-right">
                        <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} className="px-1 text-stone-400 hover:text-stone-900 disabled:opacity-30" aria-label="Subir">↑</button>
                        <button type="button" disabled={i === lista.length - 1} onClick={() => mover(i, 1)} className="px-1 text-stone-400 hover:text-stone-900 disabled:opacity-30" aria-label="Bajar">↓</button>
                        <button type="button" onClick={() => cambiar(lista.filter((_, j) => j !== i))} className="px-1 text-stone-400 hover:text-red-700" aria-label="Quitar producto">×</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
