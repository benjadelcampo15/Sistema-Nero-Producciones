import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { FormularioPresupuesto } from "@/components/formulario-presupuesto";
import { SinAcceso } from "../../sin-acceso";

export default async function PaginaNuevoPresupuesto() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "presupuestos", "editar")) return <SinAcceso />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Nuevo presupuesto</h1>
      <FormularioPresupuesto />
    </div>
  );
}
