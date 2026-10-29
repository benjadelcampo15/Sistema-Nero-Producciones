import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerPedido } from "@/lib/pedidos/consultas";
import { ESTADO_PEDIDO, describirPromo, pedidoAbierto, totalPedido } from "@/lib/pedidos/tipos";
import { formatoCantidad } from "@/lib/stock/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { urlBase } from "@/lib/url";
import { SinAcceso } from "../../../sin-acceso";
import { AccionesPedido } from "./acciones-pedido";
import { PanelEnviarPedido } from "../enviar-pedido";

const fechaHora = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

export default async function PaginaPedido({ params, searchParams }: PageProps<"/stock/pedidos/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;
  const { id } = await params;
  const [pedido, base, { recibir, enviar }] = await Promise.all([obtenerPedido(id), urlBase(), searchParams]);
  if (!pedido) notFound();
  const recibido = pedido.estado === "recibido";
  const respondio = pedido.confirmado_en !== null;
  const cambios = pedido.items.filter((i) => i.cantidad_confirmada !== null && i.cantidad_confirmada !== i.cantidad);

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

      {respondio && (
        <section className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
          <p className="font-semibold">
            {pedido.proveedor.razon_social} confirmó el pedido el {fechaHora.format(new Date(pedido.confirmado_en!))}
            {pedido.fecha_entrega_confirmada && ` · entrega ${formatoFecha(pedido.fecha_entrega_confirmada)}`}
          </p>
          {cambios.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {cambios.map((i) => (
                <li key={i.producto.id}>
                  {i.producto.nombre}: manda <span className="font-mono font-semibold">{formatoCantidad(i.cantidad_confirmada!)}</span> de {formatoCantidad(i.cantidad)}
                  {i.nota_proveedor && ` · “${i.nota_proveedor}”`}
                </li>
              ))}
            </ul>
          ) : (
            <p>Manda todo lo pedido.</p>
          )}
          {pedido.items
            .filter((i) => i.nota_proveedor && !cambios.includes(i))
            .map((i) => (
              <p key={i.producto.id}>{i.producto.nombre}: “{i.nota_proveedor}”</p>
            ))}
          {pedido.respuesta_proveedor && <p className="mt-1">“{pedido.respuesta_proveedor}”</p>}
        </section>
      )}

      {pedidoAbierto(pedido.estado) && <PanelEnviarPedido pedido={pedido} urlBase={base} destacado={enviar === "1"} />}

      <AccionesPedido pedido={pedido} editable={puede(usuario, "stock", "editar")} recibirAbierto={recibir === "1"} />

      <section className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
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
                <td className="px-4 py-2">
                  <span className="font-medium">{i.producto.nombre}</span>
                  {i.promo && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800" title={describirPromo(i.promo)}>
                      {i.promo.replace(".", ",")}
                    </span>
                  )}
                  {i.aclaracion && <span className="block text-xs text-stone-500">{i.aclaracion}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono">
                  {formatoCantidad(i.cantidad)} <span className="text-xs text-stone-400">{i.producto.unidad}</span>
                  {i.bonificadas > 0 && <span className="block font-sans text-xs font-semibold text-amber-700">+{formatoCantidad(i.bonificadas)} de regalo</span>}
                </td>
                {recibido && (
                  <td className={`px-4 py-2 text-right font-mono ${i.cantidad_recibida !== i.cantidad ? "text-amber-700" : "text-green-700"}`}>
                    {i.cantidad_recibida === null ? "—" : formatoCantidad(i.cantidad_recibida)}
                    {(i.bonificadas_recibidas ?? 0) > 0 && <span className="block font-sans text-xs">+{formatoCantidad(i.bonificadas_recibidas!)} de regalo</span>}
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
