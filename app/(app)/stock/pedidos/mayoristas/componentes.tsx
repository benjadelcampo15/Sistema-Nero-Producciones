"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearMayorista, guardarCatalogo, guardarDatosMayorista } from "@/lib/pedidos/acciones";
import type { Mayorista, ProductoParaPedir } from "@/lib/pedidos/tipos";
import { formatoCantidad } from "@/lib/stock/tipos";
import { parsearMonto } from "@/lib/formato";

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
const aTexto = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

/** Alta de un mayorista desde Pedidos: después se completa su lista de productos. */
export function NuevoMayorista() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState({ nombre: "", telefono: "" });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="boton-secundario">
        + Nuevo mayorista
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await crearMayorista({ razon_social: datos.nombre, telefono: datos.telefono });
          if (r.error) return setError(r.error);
          router.push(`/stock/pedidos/mayoristas/${r.id}`);
        });
      }}
    >
      <div>
        <label htmlFor="nuevo_mayorista" className="etiqueta">Nombre</label>
        <input id="nuevo_mayorista" autoFocus required value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} className="campo" />
      </div>
      <div>
        <label htmlFor="nuevo_telefono" className="etiqueta">
          WhatsApp <span className="font-normal text-stone-400">(opcional)</span>
        </label>
        <input id="nuevo_telefono" value={datos.telefono} onChange={(e) => setDatos({ ...datos, telefono: e.target.value })} className="campo" />
      </div>
      <button type="submit" disabled={pendiente} className="boton">{pendiente ? "Agregando…" : "Agregar"}</button>
      <button type="button" onClick={() => setAbierto(false)} className="pb-2 text-sm text-stone-600 hover:text-stone-900">Cancelar</button>
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
    </form>
  );
}

export function DatosMayorista({ mayorista, editable }: { mayorista: Mayorista; editable: boolean }) {
  const [datos, setDatos] = useState({ razon_social: mayorista.razon_social, contacto: mayorista.contacto ?? "", telefono: mayorista.telefono ?? "", email: mayorista.email ?? "" });
  const [mensaje, setMensaje] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const campo = (id: keyof typeof datos, nombre: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`m_${id}`} className="etiqueta">{nombre}</label>
      <input id={`m_${id}`} value={datos[id]} disabled={!editable} onChange={(e) => setDatos({ ...datos, [id]: e.target.value })} className="campo" {...extra} />
    </div>
  );
  return (
    <form
      className="tarjeta space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => setMensaje(await guardarDatosMayorista(mayorista.id, datos)));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {campo("razon_social", "Nombre", { required: true })}
        {campo("contacto", "Contacto")}
        {campo("telefono", "Teléfono / WhatsApp")}
        {campo("email", "Email", { type: "email" })}
      </div>
      {editable && (
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pendiente} className="boton-secundario">{pendiente ? "Guardando…" : "Guardar datos"}</button>
          {mensaje.error && <p className="text-sm text-red-700">{mensaje.error}</p>}
          {mensaje.ok && <p className="text-sm text-green-700">{mensaje.ok}</p>}
        </div>
      )}
    </form>
  );
}

/** Qué productos se le pueden pedir a este mayorista y a qué precio. */
export function CatalogoMayorista({ proveedorId, productos, editable }: { proveedorId: string; productos: ProductoParaPedir[]; editable: boolean }) {
  const [vende, setVende] = useState<Record<string, boolean>>(() => Object.fromEntries(productos.map((p) => [p.id, proveedorId in p.catalogo])));
  const [precios, setPrecios] = useState<Record<string, string>>(() => Object.fromEntries(productos.map((p) => [p.id, aTexto(p.catalogo[proveedorId])])));
  const tieneAlguno = productos.some((p) => proveedorId in p.catalogo);
  const [soloSuyos, setSoloSuyos] = useState(tieneAlguno);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();

  const termino = normalizar(busqueda.trim());
  const visibles = productos.filter((p) => (!soloSuyos || vende[p.id]) && (!termino || normalizar(`${p.nombre} ${p.codigo ?? ""}`).includes(termino)));
  const elegidos = productos.filter((p) => vende[p.id]);

  function guardar() {
    const items = elegidos.map((p) => ({ producto_id: p.id, precio: precios[p.id]?.trim() ? parsearMonto(precios[p.id]) : null }));
    if (elegidos.some((p) => precios[p.id]?.trim() && parsearMonto(precios[p.id]) === null)) return setMensaje({ error: "Hay un precio mal escrito" });
    iniciar(async () => setMensaje(await guardarCatalogo(proveedorId, items)));
  }

  return (
    <section className="tarjeta space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Productos que se le piden ({elegidos.length})</h2>
        <div className="ml-auto flex gap-2">
          {(
            [
              [true, "Los que vende"],
              [false, "Todos los productos"],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={texto}
              type="button"
              onClick={() => setSoloSuyos(valor)}
              className={`rounded-full border px-3 py-1 text-sm ${soloSuyos === valor ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-600 hover:text-stone-900"}`}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>
      {editable && !tieneAlguno && (
        <p className="text-sm text-stone-500">Marcá los productos que le comprás a este mayorista. También se agregan solos cuando le hacés un pedido.</p>
      )}
      <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto…" className="campo" />
      <div className="max-h-[60vh] overflow-auto rounded-md border border-stone-200">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2 text-right">Stock</th>
              <th className="w-40 px-3 py-2 text-right">Precio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {visibles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-stone-500">{soloSuyos ? "Todavía no tiene productos. Pasá a “Todos los productos” para marcarlos." : "Ningún producto coincide."}</td>
              </tr>
            )}
            {visibles.map((p) => (
              <tr key={p.id} className={vende[p.id] ? "bg-green-50/50" : ""}>
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    disabled={!editable}
                    checked={!!vende[p.id]}
                    onChange={(e) => setVende((v) => ({ ...v, [p.id]: e.target.checked }))}
                    aria-label={`${p.nombre} se le pide a este mayorista`}
                  />
                </td>
                <td className="px-3 py-1.5 font-medium">{p.nombre}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-stone-600">
                  {formatoCantidad(p.stock)} <span className="text-xs text-stone-400">{p.unidad}</span>
                </td>
                <td className="px-2 py-1">
                  <input
                    aria-label={`Precio de ${p.nombre}`}
                    inputMode="decimal"
                    disabled={!editable}
                    value={precios[p.id] ?? ""}
                    placeholder={p.precios[proveedorId] !== undefined ? aTexto(p.precios[proveedorId]) : ""}
                    onChange={(e) => {
                      setPrecios((x) => ({ ...x, [p.id]: e.target.value }));
                      if (e.target.value.trim()) setVende((v) => ({ ...v, [p.id]: true }));
                    }}
                    className="campo py-1 text-right font-mono"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={guardar} disabled={pendiente} className="boton">{pendiente ? "Guardando…" : "Guardar productos"}</button>
          {mensaje.error && <p className="text-sm text-red-700">{mensaje.error}</p>}
          {mensaje.ok && <p className="text-sm text-green-700">{mensaje.ok}</p>}
        </div>
      )}
    </section>
  );
}
