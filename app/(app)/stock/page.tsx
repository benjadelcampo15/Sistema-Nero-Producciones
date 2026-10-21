import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarDepositos, obtenerStock } from "@/lib/stock/consultas";
import { formatoCantidad } from "@/lib/stock/tipos";
import { formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../sin-acceso";
import { NavegacionStock } from "./navegacion";

export default async function PaginaStock({ searchParams }: PageProps<"/stock">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;

  const { deposito: parametro } = await searchParams;
  const [depositos, stock] = await Promise.all([listarDepositos(), obtenerStock()]);
  const deposito = depositos.find((d) => d.id === parametro);

  // En la vista de un depósito se muestran solo los productos que tienen (o tuvieron) stock ahí.
  const filas = deposito ? stock.filter((f) => deposito.id in f.porDeposito) : stock;
  const cantidadDe = (f: (typeof stock)[number]) => (deposito ? (f.porDeposito[deposito.id] ?? 0) : f.total);
  const valorTotal = filas.reduce((t, f) => t + (f.costoPromedio ?? 0) * Math.max(cantidadDe(f), 0), 0);
  const bajoMinimo = filas.filter((f) => f.producto.stock_minimo > 0 && f.total < f.producto.stock_minimo).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Stock</h1>
        {puede(usuario, "stock", "editar") && (
          <Link href="/stock/movimientos" className="boton">+ Movimiento</Link>
        )}
      </div>

      <NavegacionStock actual="/stock" />

      <nav className="flex flex-wrap gap-2">
        {[undefined, ...depositos].map((d) => (
          <Link
            key={d?.id ?? "general"}
            href={d ? `/stock?deposito=${d.id}` : "/stock"}
            scroll={false}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              deposito?.id === d?.id
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
            }`}
          >
            {d ? d.nombre : "General"}
          </Link>
        ))}
      </nav>

      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador titulo="Productos" valor={String(filas.length)} />
        <Indicador titulo="Valor estimado (a costo)" valor={formatoPesos(valorTotal)} />
        <Indicador titulo="Bajo el mínimo" valor={String(bajoMinimo)} alerta={bajoMinimo > 0} />
      </div>

      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Producto</th>
              {deposito ? (
                <th className="px-4 py-3 text-right">Cantidad</th>
              ) : (
                <>
                  {depositos.map((d) => (
                    <th key={d.id} className="px-4 py-3 text-right">{d.nombre}</th>
                  ))}
                  <th className="px-4 py-3 text-right">Total</th>
                </>
              )}
              <th className="px-4 py-3 text-right">Mínimo</th>
              <th className="px-4 py-3 text-right">Costo prom.</th>
              <th className="px-4 py-3 text-right">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filas.length === 0 && (
              <tr>
                <td colSpan={depositos.length + 5} className="px-4 py-10 text-center text-stone-500">
                  No hay productos{deposito ? " en este depósito" : ""}. Se crean en Productos o al aprobar una factura de compra.
                </td>
              </tr>
            )}
            {filas.map((f) => {
              const bajo = f.producto.stock_minimo > 0 && f.total < f.producto.stock_minimo;
              const cantidad = cantidadDe(f);
              return (
                <tr key={f.producto.id} className={bajo ? "bg-red-50/60" : "hover:bg-stone-50"}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/stock/movimientos?producto=${f.producto.id}`}
                      className="font-medium underline decoration-stone-300 hover:decoration-stone-900"
                    >
                      {f.producto.nombre}
                    </Link>
                    <span className="ml-2 text-xs text-stone-500">{f.producto.unidad}</span>
                    {bajo && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Bajo mínimo</span>}
                  </td>
                  {deposito ? (
                    <td className="px-4 py-3 text-right font-mono font-semibold">{formatoCantidad(cantidad)}</td>
                  ) : (
                    <>
                      {depositos.map((d) => (
                        <td key={d.id} className="px-4 py-3 text-right font-mono text-stone-700">
                          {f.porDeposito[d.id] ? formatoCantidad(f.porDeposito[d.id]) : <span className="text-stone-300">0</span>}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-mono font-semibold">{formatoCantidad(f.total)}</td>
                    </>
                  )}
                  <td className="px-4 py-3 text-right font-mono text-stone-500">
                    {f.producto.stock_minimo ? formatoCantidad(f.producto.stock_minimo) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-stone-600">
                    {f.costoPromedio !== null ? formatoPesos(f.costoPromedio) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {f.costoPromedio !== null ? formatoPesos(f.costoPromedio * Math.max(cantidad, 0)) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Indicador({ titulo, valor, alerta = false }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{titulo}</p>
      <p className={`mt-1 font-mono text-xl font-semibold ${alerta ? "text-red-700" : ""}`}>{valor}</p>
    </div>
  );
}
