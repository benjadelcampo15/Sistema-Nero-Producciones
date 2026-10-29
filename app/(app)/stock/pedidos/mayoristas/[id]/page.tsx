import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarMayoristas, productosParaPedir } from "@/lib/pedidos/consultas";
import { SinAcceso } from "../../../../sin-acceso";
import { CatalogoMayorista, DatosMayorista } from "../componentes";

export default async function PaginaMayorista({ params }: PageProps<"/stock/pedidos/mayoristas/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "stock", "editar");
  const { id } = await params;
  const [mayoristas, productos] = await Promise.all([listarMayoristas(), productosParaPedir()]);
  const mayorista = mayoristas.find((m) => m.id === id);
  if (!mayorista) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/stock/pedidos" className="text-sm text-stone-500 hover:text-stone-900">← Pedidos</Link>
          <h1 className="mt-1 text-2xl font-semibold">{mayorista.razon_social}</h1>
        </div>
        {editable && <Link href={`/stock/pedidos/nuevo?proveedor=${id}`} className="boton">Pedir</Link>}
      </div>
      <DatosMayorista mayorista={mayorista} editable={editable} />
      <CatalogoMayorista proveedorId={id} productos={productos} editable={editable} />
    </div>
  );
}
