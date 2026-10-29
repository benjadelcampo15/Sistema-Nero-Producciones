"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { crearMayorista, guardarPedido } from "@/lib/pedidos/acciones";
import { bonificadasDe, describirPromo, descuentoDe, faltante, precioSugerido, promoVigente, type Mayorista, type Pedido, type ProductoParaPedir } from "@/lib/pedidos/tipos";
import { formatoCantidad, type Deposito } from "@/lib/stock/tipos";
import { formatoPesos, hoy, parsearMonto, sumar } from "@/lib/formato";

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function leerNumero(texto: string, decimales: 2 | 3) {
  const t = texto.trim();
  if (!t) return null;
  const v = decimales === 3 && /^\d+(\.\d{1,3})?$/.test(t) ? Number(t) : parsearMonto(t);
  return v === null || !Number.isFinite(v) ? NaN : v;
}
const aTexto = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

type Filtro = "catalogo" | "faltantes" | "todos" | "pedido";

export function FormularioPedido({
  pedido,
  mayoristas: iniciales,
  depositos,
  productos,
  proveedorInicial,
}: {
  pedido?: Pedido;
  proveedorInicial?: string;
  mayoristas: Mayorista[];
  depositos: Deposito[];
  productos: ProductoParaPedir[];
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mayoristas, setMayoristas] = useState(iniciales);
  const [proveedor, setProveedor] = useState(
    pedido?.proveedor.id ?? (proveedorInicial && iniciales.some((m) => m.id === proveedorInicial) ? proveedorInicial : iniciales.length === 1 ? iniciales[0].id : ""),
  );
  const [nuevoMayorista, setNuevoMayorista] = useState<{ nombre: string; telefono: string } | null>(null);
  const [deposito, setDeposito] = useState(pedido?.deposito.id ?? (depositos.length === 1 ? depositos[0].id : ""));
  const [fecha, setFecha] = useState(pedido?.fecha ?? hoy());
  const [fechaEntrega, setFechaEntrega] = useState(pedido?.fecha_entrega ?? "");
  const [notas, setNotas] = useState(pedido?.notas ?? "");
  const [cantidades, setCantidades] = useState<Record<string, string>>(() => Object.fromEntries((pedido?.items ?? []).map((i) => [i.producto.id, aTexto(i.cantidad)])));
  const [precios, setPrecios] = useState<Record<string, string>>(() => Object.fromEntries((pedido?.items ?? []).map((i) => [i.producto.id, aTexto(i.precio_unitario)])));
  const [aclaraciones, setAclaraciones] = useState<Record<string, string>>(() => Object.fromEntries((pedido?.items ?? []).map((i) => [i.producto.id, i.aclaracion ?? ""])));
  /** ¿Está en el catálogo de un mayorista (lo que se le puede pedir)? */
  const vende = (p: ProductoParaPedir, prov = proveedor) => prov in p.catalogo;
  const tieneCatalogo = productos.some((p) => vende(p));
  const hayFaltantes = productos.some((p) => faltante(p) > 0 && (!tieneCatalogo || vende(p)));
  const [filtro, setFiltro] = useState<Filtro>(pedido ? "pedido" : tieneCatalogo ? "catalogo" : hayFaltantes ? "faltantes" : "todos");
  const [busqueda, setBusqueda] = useState("");
  const tabla = useRef<HTMLTableSectionElement>(null);

  /** Promo del producto: la que tenía el pedido (si es el mismo mayorista) o la vigente de su lista. */
  const promosDelPedido = new Map((pedido && pedido.proveedor.id === proveedor ? pedido.items : []).map((i) => [i.producto.id, i.promo]));
  const promoDe = (p: ProductoParaPedir) => (promosDelPedido.has(p.id) ? (promosDelPedido.get(p.id) ?? null) : promoVigente(p, proveedor, fecha));

  /** Precio sugerido: el de la lista del mayorista (con su descuento, si tiene), el último que se le pidió o el costo promedio. */
  const sugerido = (p: ProductoParaPedir) => {
    const base = precioSugerido(p, proveedor);
    return base === null ? null : Math.round(base * (1 - descuentoDe(promoDe(p))) * 100) / 100;
  };

  function elegirProveedor(id: string) {
    setProveedor(id);
    if (filtro === "catalogo" || filtro === "faltantes" || filtro === "todos") setFiltro(productos.some((p) => vende(p, id)) ? "catalogo" : "faltantes");
  }

  const filas = productos.map((p) => {
    const cantidad = leerNumero(cantidades[p.id] ?? "", 3);
    const precio = leerNumero(precios[p.id] ?? "", 2);
    const falta = faltante(p);
    const mal = (cantidad !== null && (Number.isNaN(cantidad) || cantidad < 0)) || (precio !== null && Number.isNaN(precio));
    const promo = promoDe(p);
    const regalo = cantidad && !Number.isNaN(cantidad) ? bonificadasDe(promo, cantidad) : 0;
    return { p, cantidad, precio, falta, mal, promo, regalo };
  });
  const enPedido = filas.filter((x) => x.cantidad !== null && !Number.isNaN(x.cantidad) && x.cantidad > 0);
  const total = sumar(enPedido.map((x) => (x.precio && !Number.isNaN(x.precio) ? x.precio * (x.cantidad as number) : 0)));
  const sinPrecio = enPedido.filter((x) => x.precio === null).length;
  const regalos = sumar(enPedido.map((x) => x.regalo));

  const termino = normalizar(busqueda.trim());
  const visibles = filas
    .filter((x) =>
      filtro === "catalogo"
        ? vende(x.p) || enPedido.includes(x)
        : filtro === "faltantes"
          ? x.falta > 0 || x.p.stock <= 0 || enPedido.includes(x)
          : filtro === "pedido"
            ? enPedido.includes(x)
            : true,
    )
    .filter((x) => !termino || normalizar(`${x.p.nombre} ${x.p.codigo ?? ""}`).includes(termino));

  function cambiarCantidad(p: ProductoParaPedir, valor: string) {
    setCantidades((c) => ({ ...c, [p.id]: valor }));
    // Al cargar la primera cantidad se completa el precio sugerido (se puede cambiar).
    const s = sugerido(p);
    if (valor.trim() && !(precios[p.id] ?? "").trim() && s !== null) setPrecios((x) => ({ ...x, [p.id]: aTexto(s) }));
  }

  function pedirFaltantes() {
    const nuevas = { ...cantidades };
    const nuevosPrecios = { ...precios };
    for (const x of filas) {
      // Con catálogo, solo lo que vende este mayorista.
      if (x.falta <= 0 || (cantidades[x.p.id] ?? "").trim() || (tieneCatalogo && !vende(x.p))) continue;
      nuevas[x.p.id] = aTexto(Math.ceil(x.falta));
      const s = sugerido(x.p);
      if (!(precios[x.p.id] ?? "").trim() && s !== null) nuevosPrecios[x.p.id] = aTexto(s);
    }
    setCantidades(nuevas);
    setPrecios(nuevosPrecios);
  }

  function siguiente(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const campos = [...(tabla.current?.querySelectorAll<HTMLInputElement>("input[data-pedir]") ?? [])];
    const i = campos.indexOf(e.currentTarget);
    if (campos[i + 1]) campos[i + 1].focus();
    else document.getElementById("buscar-pedido")?.focus();
  }

  function agregarMayorista() {
    if (!nuevoMayorista) return;
    iniciar(async () => {
      const r = await crearMayorista({ razon_social: nuevoMayorista.nombre, telefono: nuevoMayorista.telefono });
      if (r.error || !r.id) return setError(r.error ?? "No se pudo agregar el mayorista");
      setMayoristas((m) => [...m, { id: r.id!, razon_social: nuevoMayorista.nombre.trim(), telefono: nuevoMayorista.telefono.trim() || null, email: null, contacto: null, token: "" }].sort((a, b) => a.razon_social.localeCompare(b.razon_social, "es")));
      setProveedor(r.id);
      setNuevoMayorista(null);
      setError(null);
    });
  }

  const yaEnviado = Boolean(pedido && pedido.estado !== "borrador");

  /** Guarda el pedido (borrador o realizado); se le manda al proveedor a mano, con el PDF. */
  function guardar(estado: "borrador" | "enviado") {
    setError(null);
    if (!proveedor) return setError("Elegí el mayorista");
    if (filas.some((x) => x.mal)) return setError("Hay una cantidad o un precio mal escrito (marcado en rojo)");
    if (!enPedido.length) return setError("Cargá al menos un producto");
    iniciar(async () => {
      const r = await guardarPedido(pedido?.id ?? null, {
        proveedor_id: proveedor,
        deposito_id: deposito,
        fecha,
        fecha_entrega: fechaEntrega,
        estado,
        notas,
        items: enPedido.map((x) => ({ producto_id: x.p.id, cantidad: x.cantidad as number, precio_unitario: x.precio, aclaracion: aclaraciones[x.p.id]?.trim() || null, promo: x.promo })),
      });
      if (r.error) return setError(r.error);
      router.push(`/stock/pedidos/${r.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <section className="tarjeta space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="proveedor" className="etiqueta">Mayorista</label>
            {nuevoMayorista ? (
              <div className="space-y-2">
                <input autoFocus placeholder="Nombre" value={nuevoMayorista.nombre} onChange={(e) => setNuevoMayorista({ ...nuevoMayorista, nombre: e.target.value })} className="campo" />
                <input
                  placeholder="Teléfono (opcional)"
                  inputMode="tel"
                  value={nuevoMayorista.telefono}
                  onChange={(e) => setNuevoMayorista({ ...nuevoMayorista, telefono: e.target.value })}
                  className="campo"
                />
                <div className="flex gap-3">
                  <button type="button" onClick={agregarMayorista} disabled={pendiente} className="boton-secundario">Agregar</button>
                  <button type="button" onClick={() => setNuevoMayorista(null)} className="text-sm text-stone-600 hover:text-stone-900">Cancelar</button>
                </div>
              </div>
            ) : (
              <>
                <select id="proveedor" value={proveedor} onChange={(e) => elegirProveedor(e.target.value)} className="campo">
                  <option value="" disabled>Elegí…</option>
                  {mayoristas.map((m) => (
                    <option key={m.id} value={m.id}>{m.razon_social}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setNuevoMayorista({ nombre: "", telefono: "" })} className="mt-1 text-xs text-stone-600 underline hover:text-stone-900">
                  + Nuevo mayorista
                </button>
              </>
            )}
          </div>
          <div>
            <label htmlFor="deposito" className="etiqueta">Se entrega en</label>
            <select id="deposito" value={deposito} onChange={(e) => setDeposito(e.target.value)} className="campo">
              <option value="" disabled>Elegí…</option>
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fecha" className="etiqueta">Fecha del pedido</label>
            <input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo" />
          </div>
          <div>
            <label htmlFor="fecha_entrega" className="etiqueta">
              Entrega <span className="font-normal text-stone-400">(opcional)</span>
            </label>
            <input id="fecha_entrega" type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} className="campo" />
          </div>
        </div>
        <div>
          <label htmlFor="notas" className="etiqueta">
            Notas <span className="font-normal text-stone-400">(opcional)</span>
          </label>
          <input id="notas" maxLength={1000} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Horario de entrega, forma de pago…" className="campo" />
        </div>
      </section>

      <section className="tarjeta space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ...(tieneCatalogo ? [["catalogo", "Lo que vende este mayorista"] as const] : []),
              ["faltantes", "Faltantes y sin stock"],
              ["todos", "Todos los productos"],
              ["pedido", `En el pedido (${enPedido.length})`],
            ] as const
          ).map(([f, texto]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={`rounded-full border px-3 py-1 text-sm ${filtro === f ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-600 hover:text-stone-900"}`}
            >
              {texto}
            </button>
          ))}
          {hayFaltantes && (
            <button type="button" onClick={pedirFaltantes} className="boton-secundario ml-auto">Pedir todo lo que falta</button>
          )}
        </div>
        {proveedor && !tieneCatalogo && (
          <p className="text-xs text-stone-500">
            Este mayorista todavía no tiene productos cargados: lo que le pidas queda en su lista para la próxima (o cargala en{" "}
            <Link href={`/stock/pedidos/mayoristas/${proveedor}`} className="underline">sus productos</Link>).
          </p>
        )}
        {!hayFaltantes && (
          <p className="text-xs text-stone-500">
            Ningún producto está por debajo de su stock mínimo. Para que aparezcan los faltantes, cargá los mínimos en{" "}
            <Link href="/stock/pedidos/minimos" className="underline">Stock mínimo</Link>.
          </p>
        )}
        <input
          id="buscar-pedido"
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            tabla.current?.querySelector<HTMLInputElement>("input[data-pedir]")?.focus();
          }}
          placeholder="Buscar producto… (Enter para ir al primero)"
          className="campo"
        />
        <div className="max-h-[60vh] overflow-auto rounded-md border border-stone-200">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Stock</th>
                <th className="px-3 py-2 text-right">Mínimo</th>
                <th className="px-3 py-2 text-right">En camino</th>
                <th className="px-3 py-2 text-right">Falta</th>
                <th className="w-28 px-3 py-2 text-right">Pedir</th>
                <th className="w-36 px-3 py-2 text-right">Precio unit.</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
                <th className="w-48 px-3 py-2">Aclaración</th>
              </tr>
            </thead>
            <tbody ref={tabla} className="divide-y divide-stone-100">
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-stone-500">
                    {filtro === "faltantes" ? "No hay faltantes." : filtro === "pedido" ? "Todavía no hay productos en el pedido." : "Ningún producto coincide."}
                  </td>
                </tr>
              )}
              {visibles.map(({ p, cantidad, precio, falta, mal, promo, regalo }) => {
                const detalle = depositos.map((d) => `${d.nombre}: ${formatoCantidad(p.porDeposito[d.id] ?? 0)}`).join(" · ");
                const s = sugerido(p);
                return (
                  <tr key={p.id} className={mal ? "bg-red-50" : cantidad ? "bg-green-50/50" : ""}>
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{p.nombre}</span>
                      {p.codigo && <span className="ml-1 font-mono text-xs text-stone-400">{p.codigo}</span>}
                      {promo && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800" title={describirPromo(promo)}>
                          {promo.replace(".", ",")}
                        </span>
                      )}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-1.5 text-right font-mono ${p.stock <= 0 ? "text-red-700" : ""}`} title={detalle}>
                      {formatoCantidad(p.stock)} <span className="text-xs text-stone-400">{p.unidad}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-stone-600">{p.minimo ? formatoCantidad(p.minimo) : "—"}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-sky-700">{p.enCamino ? formatoCantidad(p.enCamino) : ""}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right">
                      {falta > 0 ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 font-mono text-xs font-semibold text-red-800">{formatoCantidad(falta)}</span>
                      ) : p.stock <= 0 ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">sin stock</span>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <input
                        data-pedir
                        aria-label={`Cantidad a pedir de ${p.nombre}`}
                        inputMode="decimal"
                        value={cantidades[p.id] ?? ""}
                        onChange={(e) => cambiarCantidad(p, e.target.value)}
                        onKeyDown={siguiente}
                        className="campo py-1 text-right font-mono"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        aria-label={`Precio unitario de ${p.nombre}`}
                        inputMode="decimal"
                        value={precios[p.id] ?? ""}
                        placeholder={s !== null ? aTexto(s) : ""}
                        onChange={(e) => setPrecios((x) => ({ ...x, [p.id]: e.target.value }))}
                        className="campo py-1 text-right font-mono"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">
                      {cantidad && precio && !Number.isNaN(cantidad) && !Number.isNaN(precio) ? formatoPesos(cantidad * precio) : ""}
                      {regalo > 0 && <span className="block text-xs font-sans font-semibold text-amber-700">+{formatoCantidad(regalo)} de regalo</span>}
                    </td>
                    <td className="px-2 py-1">
                      <input
                        aria-label={`Aclaración de ${p.nombre}`}
                        maxLength={200}
                        value={aclaraciones[p.id] ?? ""}
                        placeholder={cantidad ? "Ej.: mitad y mitad" : ""}
                        onChange={(e) => setAclaraciones((x) => ({ ...x, [p.id]: e.target.value }))}
                        className="campo py-1 text-sm"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {error && <p className="alerta-error">{error}</p>}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-stone-200 bg-white/95 py-3">
        <p className="text-sm">
          <span className="font-semibold">{enPedido.length}</span> {enPedido.length === 1 ? "producto" : "productos"} · total{" "}
          <span className="font-mono font-semibold">{formatoPesos(total)}</span>
          {regalos > 0 && <span className="text-xs font-semibold text-amber-700"> · +{formatoCantidad(regalos)} de regalo</span>}
          {sinPrecio > 0 && <span className="text-xs text-amber-700"> ({sinPrecio} sin precio)</span>}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          {yaEnviado ? (
            <button type="button" onClick={() => guardar("enviado")} disabled={pendiente} className="boton">
              {pendiente ? "Guardando…" : "Guardar cambios"}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => guardar("borrador")} disabled={pendiente} className="boton-secundario">
                Guardar borrador
              </button>
              <button type="button" onClick={() => guardar("enviado")} disabled={pendiente} className="boton">
                {pendiente ? "Guardando…" : "Realizar pedido"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
