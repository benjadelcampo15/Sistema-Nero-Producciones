import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarMayoristas, productosParaPedir } from "@/lib/pedidos/consultas";
import { listarDepositos } from "@/lib/stock/consultas";
import { SinAcceso } from "../../../sin-acceso";
import { FormularioPedido } from "../formulario-pedido";

export default async function PaginaNuevoPedido({ searchParams }: PageProps<"/stock/pedidos/nuevo">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "editar")) return <SinAcceso />;
  const { proveedor } = await searchParams;
  const [mayoristas, depositos, productos] = await Promise.all([listarMayoristas(), listarDepositos(), productosParaPedir()]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/stock/pedidos" className="text-sm text-stone-500 hover:text-stone-900">← Pedidos</Link>
        <h1 className="mt-1 text-2xl font-semibold">Nuevo pedido</h1>
      </div>
      <FormularioPedido mayoristas={mayoristas} depositos={depositos} productos={productos} proveedorInicial={typeof proveedor === "string" ? proveedor : undefined} />
    </div>
  );
}
