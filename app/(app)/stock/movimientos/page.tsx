import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarDepositos, listarMovimientos, listarProductos } from "@/lib/stock/consultas";
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

  const [productos, depositos, movimientos, eventos] = await Promise.all([
    listarProductos(),
    listarDepositos(),
    listarMovimientos({ producto: filtroProducto, deposito: filtroDeposito }),
    editable ? obtenerEventosResumidos() : [],
  ]);
  const productoFiltrado = productos.find((p) => p.id === filtroProducto);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Stock</h1>
      <NavegacionStock actual="/stock/movimientos" />

      {editable &&
        (productos.length && depositos.length ? (
          <FormularioMovimiento productos={productos} depositos={depositos} eventos={eventos} productoInicial={filtroProducto} />
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
                <th className="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {movimientos.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-stone-500">No hay movimientos.</td>
                </tr>
              )}
              {movimientos.map((m) => (
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
