import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarDepositos, listarMovimientos, listarProductos, listarSalidas, obtenerStock } from "@/lib/stock/consultas";
import { obtenerEventosResumidos } from "@/lib/financiero/consultas";
import { formatoCantidad } from "@/lib/stock/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../../sin-acceso";
import { NavegacionStock } from "../navegacion";
import { FormularioMovimiento } from "./formulario-movimiento";

const ETIQUETA = {
  entrada: { texto: "Entrada", clase: "bg-green-100 text-green-800" },
  salida: { texto: "Salida", clase: "bg-red-100 text-red-800" },
  ajuste: { texto: "Ajuste", clase: "bg-amber-100 text-amber-800" },
};

export default async function PaginaMovimientosStock({ searchParams }: PageProps<"/stock/movimientos">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "stock", "editar");

  const { producto, deposito } = await searchParams;
  const filtroProducto = typeof producto === "string" ? producto : undefined;
  const filtroDeposito = typeof deposito === "string" ? deposito : undefined;

  // Sin filtro de producto, las salidas de varios productos se ven agrupadas (una fila por salida).
  const agrupar = !filtroProducto;
  const [productos, depositos, movimientos, eventos, stock, salidas] = await Promise.all([
    listarProductos(),
    listarDepositos(),
    listarMovimientos({ producto: filtroProducto, deposito: filtroDeposito, sinSalidas: agrupar }),
    editable ? obtenerEventosResumidos() : [],
    editable ? obtenerStock() : [],
    agrupar ? listarSalidas({ deposito: filtroDeposito }) : [],
  ]);
  const historial = [
    ...movimientos.map((m) => ({ clave: m.fecha + m.creado_en, movimiento: m, salida: null })),
    ...salidas.map((s) => ({ clave: s.fecha + s.creado_en, movimiento: null, salida: s })),
  ].sort((a, b) => b.clave.localeCompare(a.clave));
  const productoFiltrado = productos.find((p) => p.id === filtroProducto);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Stock</h1>
      <NavegacionStock actual="/stock/movimientos" />

      {editable &&
        (productos.length && depositos.length ? (
          <FormularioMovimiento productos={productos} depositos={depositos} eventos={eventos} productoInicial={filtroProducto} stock={stock} />
        ) : (
          <p className="tarjeta text-sm text-stone-600">
            Para registrar movimientos primero creá un <Link href="/stock/productos" className="underline">producto</Link>.
          </p>
        ))}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Historial</h2>
          {productoFiltrado && (
            <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs">
              {productoFiltrado.nombre} ·{" "}
              <Link href="/stock/movimientos" className="underline">ver todos</Link>
            </span>
          )}
        </div>
        <div className="tarjeta overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Depósito</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-right">Costo unit.</th>
                <th className="px-4 py-3 text-right">Costo total</th>
                <th className="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {historial.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-stone-500">No hay movimientos.</td>
                </tr>
              )}
              {historial.map(({ movimiento: m, salida: s }) =>
                s ? (
                  <tr key={s.id} className="hover:bg-stone-50">
                    <td className="whitespace-nowrap px-4 py-3 text-stone-600">{formatoFecha(s.fecha)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ETIQUETA.salida.clase}`}>{s.modo === "conteo" ? "Salida por conteo" : "Salida"}</span>
                    </td>
                    <td className="px-4 py-3 font-medium">{s.productos} {s.productos === 1 ? "producto" : "productos"}</td>
                    <td className="px-4 py-3 text-stone-600">{s.deposito.nombre}</td>
                    <td className="px-4 py-3 text-right text-stone-400">—</td>
                    <td className="px-4 py-3 text-right text-stone-400">—</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-medium">
                      {formatoPesos(s.costoTotal)}
                      {s.sinCosto > 0 && <span className="block text-xs font-normal text-amber-700">{s.sinCosto} sin costo</span>}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {s.motivo}
                      {s.evento && <span className="ml-1">({s.evento.nombre})</span>}
                      <Link href={`/stock/salidas/${s.id}`} className="ml-1 font-medium text-stone-900 underline">ver detalle</Link>
                    </td>
                  </tr>
                ) : m && (
                <tr key={m.id} className="hover:bg-stone-50">
                  <td className="whitespace-nowrap px-4 py-3 text-stone-600">{formatoFecha(m.fecha)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ETIQUETA[m.tipo].clase}`}>
                      {m.transferencia_id ? "Transferencia" : ETIQUETA[m.tipo].texto}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{m.producto.nombre}</td>
                  <td className="px-4 py-3 text-stone-600">{m.deposito.nombre}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right font-mono font-medium ${m.cantidad > 0 ? "text-green-700" : "text-red-700"}`}>
                    {m.cantidad > 0 ? "+" : "−"}
                    {formatoCantidad(Math.abs(m.cantidad))} <span className="text-xs text-stone-400">{m.producto.unidad}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-stone-600">
                    {m.costo_unitario !== null ? formatoPesos(m.costo_unitario) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                    {m.costo_unitario !== null ? formatoPesos(Math.abs(m.cantidad) * m.costo_unitario) : "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {m.motivo}
                    {m.evento && (
                      <Link href={`/eventos/${m.evento.id}`} className="ml-1 underline">
                        ({m.evento.nombre})
                      </Link>
                    )}
                    {m.factura_id && (
                      <Link href={`/facturas/${m.factura_id}`} className="ml-1 underline">
                        ver factura
                      </Link>
                    )}
                    {m.salida_id && (
                      <Link href={`/stock/salidas/${m.salida_id}`} className="ml-1 underline">
                        ver salida
                      </Link>
                    )}
                  </td>
                </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
