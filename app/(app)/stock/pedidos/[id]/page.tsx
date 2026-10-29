import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerPedido } from "@/lib/pedidos/consultas";
import { ESTADO_PEDIDO, totalPedido } from "@/lib/pedidos/tipos";
import { formatoCantidad } from "@/lib/stock/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../../../sin-acceso";
import { AccionesPedido } from "./acciones-pedido";

export default async function PaginaPedido({ params }: PageProps<"/stock/pedidos/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;
  const { id } = await params;
  const pedido = await obtenerPedido(id);
  if (!pedido) notFound();
  const recibido = pedido.estado === "recibido";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/stock/pedidos" className="text-sm text-stone-500 hover:text-stone-900">← Pedidos</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Pedido N° {pedido.numero} · {pedido.proveedor.razon_social}</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_PEDIDO[pedido.estado].clase}`}>{ESTADO_PEDIDO[pedido.estado].nombre}</span>
        </div>
        <p className="text-sm text-stone-500">
          {formatoFecha(pedido.fecha)} · entrega en {pedido.deposito.nombre}
          {pedido.fecha_entrega && ` el ${formatoFecha(pedido.fecha_entrega)}`}
          {pedido.proveedor.telefono && ` · tel. ${pedido.proveedor.telefono}`}
        </p>
        {pedido.notas && <p className="mt-1 text-sm">{pedido.notas}</p>}
      </div>

      <AccionesPedido pedido={pedido} editable={puede(usuario, "stock", "editar")} />

      <section className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3 text-right">Cantidad</th>
              {recibido && <th className="px-4 py-3 text-right">Llegó</th>}
              <th className="px-4 py-3 text-right">Precio unit.</th>
              <th className="px-4 py-3 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {pedido.items.map((i) => (
              <tr key={i.producto.id}>
                <td className="px-4 py-2 font-medium">{i.producto.nombre}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono">
                  {formatoCantidad(i.cantidad)} <span className="text-xs text-stone-400">{i.producto.unidad}</span>
                </td>
                {recibido && (
                  <td className={`px-4 py-2 text-right font-mono ${i.cantidad_recibida !== i.cantidad ? "text-amber-700" : "text-green-700"}`}>
                    {i.cantidad_recibida === null ? "—" : formatoCantidad(i.cantidad_recibida)}
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-stone-600">{i.precio_unitario !== null ? formatoPesos(i.precio_unitario) : "—"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{i.precio_unitario !== null ? formatoPesos(i.precio_unitario * i.cantidad) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-300 font-semibold">
            <tr>
              <td className="px-4 py-3" colSpan={recibido ? 4 : 3}>Total</td>
              <td className="px-4 py-3 text-right font-mono">{formatoPesos(totalPedido(pedido.items))}</td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
