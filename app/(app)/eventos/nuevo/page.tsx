import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { FormularioEvento } from "@/components/formulario-evento";
import { SinAcceso } from "../../sin-acceso";

export default async function PaginaNuevoEvento() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "eventos", "editar")) return <SinAcceso />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Nuevo evento</h1>
      <FormularioEvento />
    </div>
  );
}
