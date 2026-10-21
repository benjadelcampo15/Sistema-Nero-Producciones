import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerPresupuesto } from "@/lib/presupuestos/consultas";
import { numeroPresupuesto } from "@/lib/presupuestos/tipos";
import { FormularioPresupuesto } from "@/components/formulario-presupuesto";
import { SinAcceso } from "../../../sin-acceso";

export default async function PaginaEditarPresupuesto({ params }: PageProps<"/presupuestos/[id]/editar">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "presupuestos", "editar")) return <SinAcceso />;

  const { id } = await params;
  const p = await obtenerPresupuesto(id);
  if (!p) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar {numeroPresupuesto(p.numero)}</h1>
      {p.estado === "enviado" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Este presupuesto ya se envió: los cambios se ven en el mismo link que tiene el cliente.
        </p>
      )}
      <FormularioPresupuesto presupuesto={p} />
    </div>
  );
}
