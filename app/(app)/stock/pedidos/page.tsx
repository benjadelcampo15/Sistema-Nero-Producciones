import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarMayoristas, listarPedidos, productosParaPedir } from "@/lib/pedidos/consultas";
import { ESTADO_PEDIDO, faltante, totalPedido } from "@/lib/pedidos/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../../sin-acceso";
import { NavegacionStock } from "../navegacion";
import { NuevoMayorista } from "./mayoristas/componentes";

export default async function PaginaPedidos() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "stock", "editar");
  const [pedidos, productos, mayoristas] = await Promise.all([listarPedidos(), productosParaPedir(), listarMayoristas()]);
  const faltantes = productos.filter((p) => faltante(p) > 0);
  const sinStock = productos.filter((p) => p.stock <= 0 && faltante(p) === 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Stock</h1>
      <NavegacionStock actual="/stock/pedidos" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-500">Pedidos a los mayoristas: al armarlos ves el stock y lo que falta; al recibirlos la mercadería entra al stock con su costo.</p>
        {editable && (
          <div className="flex gap-2">
            <Link href="/stock/pedidos/minimos" className="boton-secundario">Stock mínimo</Link>
            <Link href="/stock/pedidos/nuevo" className="boton">+ Nuevo pedido</Link>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="tarjeta p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">Por debajo del mínimo</p>
          <p className={`mt-1 font-mono text-xl font-semibold ${faltantes.length ? "text-red-700" : ""}`}>{faltantes.length}</p>
          {faltantes.length > 0 && (
            <p className="mt-1 line-clamp-2 text-xs text-stone-500">{faltantes.slice(0, 8).map((p) => p.nombre).join(" · ")}{faltantes.length > 8 ? "…" : ""}</p>
          )}
        </div>
        <div className="tarjeta p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">Sin stock (sin mínimo cargado)</p>
          <p className="mt-1 font-mono text-xl font-semibold">{sinStock.length}</p>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Mayoristas</h2>
          {editable && <NuevoMayorista />}
        </div>
        {mayoristas.length === 0 ? (
          <p className="tarjeta text-sm text-stone-500">Todavía no hay mayoristas. Agregá el primero.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {mayoristas.map((m) => {
              const suyos = productos.filter((p) => m.id in p.catalogo);
              const reponer = suyos.filter((p) => faltante(p) > 0 || p.stock <= 0).length;
              return (
                <div key={m.id} className="tarjeta flex flex-col gap-3 p-4">
                  <div>
                    <p className="font-semibold">{m.razon_social}</p>
                    <p className="text-xs text-stone-500">
                      {suyos.length} {suyos.length === 1 ? "producto" : "productos"}
                      {reponer > 0 && <span className="font-medium text-red-700"> · {reponer} para reponer</span>}
                      {m.telefono && ` · ${m.telefono}`}
                    </p>
                  </div>
                  <div className="mt-auto flex gap-2">
                    {editable && <Link href={`/stock/pedidos/nuevo?proveedor=${m.id}`} className="boton px-4 py-1.5">Pedir</Link>}
                    <Link href={`/stock/pedidos/mayoristas/${m.id}`} className="boton-secundario px-4 py-1.5">Productos</Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <h2 className="text-lg font-semibold">Pedidos</h2>
      <section className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">N°</th>
              <th className="px-4 py-3">PDF</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Mayorista</th>
              <th className="px-4 py-3">Entrega en</th>
              <th className="px-4 py-3 text-right">Productos</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {pedidos.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-stone-500">Todavía no hay pedidos.</td>
              </tr>
            )}
            {pedidos.map((p) => (
              <tr key={p.id} className="hover:bg-stone-50">
                <td className="px-4 py-2 font-mono">
                  <Link href={`/stock/pedidos/${p.id}`} className="underline decoration-stone-300 hover:decoration-stone-900">{p.numero}</Link>
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <a href={`/imprimir/pedido/${p.id}`} target="_blank" rel="noreferrer" className="boton-secundario px-3 py-1 text-xs">
                    Descargar PDF
                  </a>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-stone-600">
                  {formatoFecha(p.fecha)}
                  {p.fecha_entrega && <span className="block text-xs text-stone-400">entrega {formatoFecha(p.fecha_entrega)}</span>}
                </td>
                <td className="px-4 py-2 font-medium">
                  <Link href={`/stock/pedidos/${p.id}`} className="hover:underline">{p.proveedor.razon_social}</Link>
                </td>
                <td className="px-4 py-2 text-stone-600">{p.deposito.nombre}</td>
                <td className="px-4 py-2 text-right font-mono">{p.items.length}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{formatoPesos(totalPedido(p.items))}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_PEDIDO[p.estado].clase}`}>{ESTADO_PEDIDO[p.estado].nombre}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
