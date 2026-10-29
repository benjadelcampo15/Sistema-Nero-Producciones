"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearMayorista, guardarCatalogo, guardarDatosMayorista } from "@/lib/pedidos/acciones";
import { describirPromo, leerPromo, type Mayorista, type ProductoParaPedir } from "@/lib/pedidos/tipos";
import { formatoCantidad } from "@/lib/stock/tipos";
import { hoy, parsearMonto } from "@/lib/formato";

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
          Teléfono <span className="font-normal text-stone-400">(opcional)</span>
        </label>
        <input id="nuevo_telefono" inputMode="tel" value={datos.telefono} onChange={(e) => setDatos({ ...datos, telefono: e.target.value })} className="campo" />
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
        {campo("telefono", "Teléfono", { inputMode: "tel" })}
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

/** Qué productos se le pueden pedir a este mayorista, a qué precio y con qué promo. */
export function CatalogoMayorista({ proveedorId, productos, editable }: { proveedorId: string; productos: ProductoParaPedir[]; editable: boolean }) {
  const [vende, setVende] = useState<Record<string, boolean>>(() => Object.fromEntries(productos.map((p) => [p.id, proveedorId in p.catalogo])));
  const [precios, setPrecios] = useState<Record<string, string>>(() => Object.fromEntries(productos.map((p) => [p.id, aTexto(p.catalogo[proveedorId])])));
  const [promos, setPromos] = useState<Record<string, string>>(() => Object.fromEntries(productos.map((p) => [p.id, p.promos[proveedorId]?.promo.replace(".", ",") ?? ""])));
  const [hasta, setHasta] = useState<Record<string, string>>(() => Object.fromEntries(productos.map((p) => [p.id, p.promos[proveedorId]?.hasta ?? ""])));
  const tieneAlguno = productos.some((p) => proveedorId in p.catalogo);
  const [soloSuyos, setSoloSuyos] = useState(tieneAlguno);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState<{ error?: string; ok?: string }>({});
  // Armado de una promo: qué promo es y qué productos entran (null: no se está armando).
  const [nuevaPromo, setNuevaPromo] = useState<{ promo: string; hasta: string; incluidos: Set<string> } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const termino = normalizar(busqueda.trim());
  // Armando una promo, la lista muestra solo lo que vende este mayorista.
  const visibles = productos.filter((p) => (nuevaPromo || soloSuyos ? vende[p.id] : true) && (!termino || normalizar(`${p.nombre} ${p.codigo ?? ""}`).includes(termino)));
  const elegidos = productos.filter((p) => vende[p.id]);
  const promoMal = (id: string) => Boolean(promos[id]?.trim()) && !leerPromo(promos[id]);

  function alternarIncluido(id: string) {
    setNuevaPromo((n) => {
      if (!n) return n;
      const incluidos = new Set(n.incluidos);
      if (incluidos.has(id)) incluidos.delete(id);
      else incluidos.add(id);
      return { ...n, incluidos };
    });
  }

  /** Pone la promo nueva solo a los productos elegidos. */
  function aplicarPromo() {
    if (!nuevaPromo) return;
    const promo = leerPromo(nuevaPromo.promo);
    if (!promo) return setMensaje({ error: "Escribí la promo: 4+1 (regalo) o 10% (descuento)" });
    const ids = [...nuevaPromo.incluidos];
    if (!ids.length) return setMensaje({ error: "Marcá los productos que entran en la promo" });
    setPromos((x) => ({ ...x, ...Object.fromEntries(ids.map((id) => [id, promo.replace(".", ",")])) }));
    setHasta((x) => ({ ...x, ...Object.fromEntries(ids.map((id) => [id, nuevaPromo.hasta])) }));
    setNuevaPromo(null);
    setMensaje({ ok: `Promo ${promo} aplicada a ${ids.length} ${ids.length === 1 ? "producto" : "productos"}: falta tocar “Guardar productos”` });
  }

  function guardar() {
    if (elegidos.some((p) => precios[p.id]?.trim() && parsearMonto(precios[p.id]) === null)) return setMensaje({ error: "Hay un precio mal escrito" });
    if (elegidos.some((p) => promoMal(p.id))) return setMensaje({ error: "Hay una promo mal escrita (en rojo): usá 4+1 (regalo) o 10% (descuento)" });
    const items = elegidos.map((p) => ({
      producto_id: p.id,
      precio: precios[p.id]?.trim() ? parsearMonto(precios[p.id]) : null,
      promo: promos[p.id]?.trim() ? leerPromo(promos[p.id]) : null,
      promo_hasta: hasta[p.id] || null,
    }));
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
      <p className="text-xs text-stone-500">
        <span className="font-semibold">Promos:</span> <span className="font-mono">4+1</span> = por cada 4 que pedís, 1 de regalo (entra al stock con costo $0) ·{" "}
        <span className="font-mono">10%</span> = descuento sobre el precio. Con “Vigente hasta”, la promo deja de aplicarse sola después de esa fecha.
      </p>
      {editable &&
        (nuevaPromo ? (
          <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="nueva_promo" className="etiqueta">Promo</label>
                <input
                  id="nueva_promo"
                  autoFocus
                  value={nuevaPromo.promo}
                  onChange={(e) => setNuevaPromo({ ...nuevaPromo, promo: e.target.value })}
                  placeholder="4+1 o 10%"
                  className={`campo w-32 font-mono ${nuevaPromo.promo.trim() && !leerPromo(nuevaPromo.promo) ? "border-red-400 bg-red-50" : ""}`}
                />
              </div>
              <div>
                <label htmlFor="nueva_promo_hasta" className="etiqueta">Vigente hasta <span className="font-normal text-stone-400">(opcional)</span></label>
                <input id="nueva_promo_hasta" type="date" value={nuevaPromo.hasta} onChange={(e) => setNuevaPromo({ ...nuevaPromo, hasta: e.target.value })} className="campo" />
              </div>
              <button
                type="button"
                onClick={() => setNuevaPromo({ ...nuevaPromo, incluidos: new Set([...nuevaPromo.incluidos, ...visibles.map((p) => p.id)]) })}
                className="boton-secundario"
              >
                Marcar todos los que se ven
              </button>
              <button type="button" onClick={() => setNuevaPromo({ ...nuevaPromo, incluidos: new Set() })} className="text-sm text-stone-600 underline">
                Desmarcar todos
              </button>
            </div>
            <p className="text-sm text-amber-900">
              {leerPromo(nuevaPromo.promo) ? describirPromo(leerPromo(nuevaPromo.promo)!) : "Escribí la promo"} · marcá en la lista los productos que entran (
              {nuevaPromo.incluidos.size} {nuevaPromo.incluidos.size === 1 ? "elegido" : "elegidos"}).
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={aplicarPromo} className="boton">Aplicar a {nuevaPromo.incluidos.size} {nuevaPromo.incluidos.size === 1 ? "producto" : "productos"}</button>
              <button type="button" onClick={() => setNuevaPromo(null)} className="text-sm text-stone-600 hover:text-stone-900">Cancelar</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setNuevaPromo({ promo: "", hasta: "", incluidos: new Set() })} disabled={!elegidos.length} className="boton-secundario">
            + Nueva promo
          </button>
        ))}
      <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto…" className="campo" />
      <div className="max-h-[60vh] overflow-auto rounded-md border border-stone-200">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="w-10 px-3 py-2">{nuevaPromo && <span className="text-amber-700">Entra</span>}</th>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2 text-right">Stock</th>
              <th className="w-36 px-3 py-2 text-right">Precio</th>
              <th className="w-28 px-3 py-2">Promo</th>
              <th className="w-40 px-3 py-2">Vigente hasta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {visibles.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-stone-500">{soloSuyos ? "Todavía no tiene productos. Pasá a “Todos los productos” para marcarlos." : "Ningún producto coincide."}</td>
              </tr>
            )}
            {visibles.map((p) => (
              <tr key={p.id} className={nuevaPromo ? (nuevaPromo.incluidos.has(p.id) ? "bg-amber-50" : "") : vende[p.id] ? "bg-green-50/50" : ""}>
                <td className="px-3 py-1.5">
                  {nuevaPromo ? (
                    <input
                      type="checkbox"
                      checked={nuevaPromo.incluidos.has(p.id)}
                      onChange={() => alternarIncluido(p.id)}
                      aria-label={`${p.nombre} entra en la promo`}
                      className="accent-amber-600"
                    />
                  ) : (
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={!!vende[p.id]}
                      onChange={(e) => setVende((v) => ({ ...v, [p.id]: e.target.checked }))}
                      aria-label={`${p.nombre} se le pide a este mayorista`}
                    />
                  )}
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
                <td className="px-2 py-1">
                  <input
                    aria-label={`Promo de ${p.nombre}`}
                    disabled={!editable}
                    value={promos[p.id] ?? ""}
                    placeholder="4+1"
                    title={promos[p.id] && leerPromo(promos[p.id]) ? describirPromo(leerPromo(promos[p.id])!) : undefined}
                    onChange={(e) => {
                      setPromos((x) => ({ ...x, [p.id]: e.target.value }));
                      if (e.target.value.trim()) setVende((v) => ({ ...v, [p.id]: true }));
                    }}
                    className={`campo py-1 font-mono ${promoMal(p.id) ? "border-red-400 bg-red-50" : ""}`}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    aria-label={`Promo de ${p.nombre} vigente hasta`}
                    type="date"
                    disabled={!editable || !promos[p.id]?.trim()}
                    value={hasta[p.id] ?? ""}
                    onChange={(e) => setHasta((x) => ({ ...x, [p.id]: e.target.value }))}
                    className={`campo py-1 ${hasta[p.id] && hasta[p.id] < hoy() ? "text-red-700" : ""}`}
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
