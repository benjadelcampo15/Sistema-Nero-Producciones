import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { SinAcceso } from "../../../sin-acceso";
import { FormularioCliente } from "../formulario-cliente";

export default async function PaginaNuevoCliente() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturar", "editar")) return <SinAcceso />;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/facturar" className="text-sm text-stone-500 hover:text-stone-900">← Clientes</Link>
        <h1 className="mt-1 text-2xl font-semibold">Nuevo cliente</h1>
      </div>
      <section className="tarjeta">
        <FormularioCliente />
      </section>
    </div>
  );
}
