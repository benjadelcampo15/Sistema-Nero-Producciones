import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { FormularioEvento } from "@/components/formulario-evento";
import { SinAcceso } from "../../sin-acceso";
import { leerEmpresa } from "@/lib/empresas";

export default async function PaginaNuevoQuilmes({ searchParams }: PageProps<"/quilmes/nuevo">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "quilmes", "editar")) return <SinAcceso />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Nuevo evento Quilmes</h1>
      <FormularioEvento tipo="quilmes" empresa={leerEmpresa((await searchParams).empresa)} />
    </div>
  );
}
