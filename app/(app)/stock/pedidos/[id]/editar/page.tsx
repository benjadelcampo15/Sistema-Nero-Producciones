import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarMayoristas, obtenerPedido, productosParaPedir } from "@/lib/pedidos/consultas";
import { listarDepositos } from "@/lib/stock/consultas";
import { SinAcceso } from "../../../../sin-acceso";
import { FormularioPedido } from "../../formulario-pedido";

export default async function PaginaEditarPedido({ params }: PageProps<"/stock/pedidos/[id]/editar">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "editar")) return <SinAcceso />;
  const { id } = await params;
  const pedido = await obtenerPedido(id);
  if (!pedido) notFound();
  if (pedido.estado !== "borrador" && pedido.estado !== "enviado") redirect(`/stock/pedidos/${id}`);
  const [mayoristas, depositos, productos] = await Promise.all([listarMayoristas(), listarDepositos(), productosParaPedir(id)]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/stock/pedidos/${id}`} className="text-sm text-stone-500 hover:text-stone-900">← Pedido N° {pedido.numero}</Link>
        <h1 className="mt-1 text-2xl font-semibold">Editar pedido N° {pedido.numero}</h1>
      </div>
      <FormularioPedido pedido={pedido} mayoristas={mayoristas} depositos={depositos} productos={productos} />
    </div>
  );
}
