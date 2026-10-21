import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerCategorias, obtenerEventosResumidos } from "@/lib/financiero/consultas";
import { FormularioTransaccion } from "@/components/formulario-transaccion";
import { SinAcceso } from "../../sin-acceso";

export default async function PaginaNuevoMovimiento({ searchParams }: PageProps<"/financiero/nuevo">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "editar")) return <SinAcceso />;

  const { volver_a } = await searchParams;
  const [categorias, eventos] = await Promise.all([obtenerCategorias(), obtenerEventosResumidos()]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Nuevo movimiento</h1>
      <FormularioTransaccion
        categorias={categorias}
        eventos={eventos}
        volverA={typeof volver_a === "string" && volver_a.startsWith("/financiero") ? volver_a : "/financiero"}
      />
    </div>
  );
}
