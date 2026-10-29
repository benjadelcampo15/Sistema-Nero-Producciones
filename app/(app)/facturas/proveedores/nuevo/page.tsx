import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { SinAcceso } from "../../../sin-acceso";
import { FormularioProveedor } from "../formulario-proveedor";

export default async function PaginaNuevoProveedor() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturas", "editar")) return <SinAcceso />;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/facturas" className="text-sm text-stone-500 hover:text-stone-900">← Proveedores</Link>
        <h1 className="mt-1 text-2xl font-semibold">Nuevo proveedor</h1>
      </div>
      <section className="tarjeta">
        <FormularioProveedor />
      </section>
    </div>
  );
}
