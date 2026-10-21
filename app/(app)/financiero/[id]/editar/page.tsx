import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerCategorias, obtenerEventosResumidos, obtenerTransaccion } from "@/lib/financiero/consultas";
import { FormularioTransaccion } from "@/components/formulario-transaccion";
import { SinAcceso } from "../../../sin-acceso";

export default async function PaginaEditarMovimiento({ params, searchParams }: PageProps<"/financiero/[id]/editar">) {
  const usuario = await obtenerUsuario();
  const { id } = await params;
  const { volver_a } = await searchParams;

  const transaccion = /^[0-9a-f-]{36}$/i.test(id) ? await obtenerTransaccion(id) : null;
  if (!transaccion) notFound();

  const puedeEditar =
    puede(usuario, "financiero", "editar") || (transaccion.evento !== null && puede(usuario, "eventos", "editar"));
  if (!puedeEditar) return <SinAcceso />;

  const [categorias, eventos] = await Promise.all([obtenerCategorias(), obtenerEventosResumidos()]);
  const volverA =
    typeof volver_a === "string" && /^\/(financiero|eventos)/.test(volver_a) ? volver_a : "/financiero";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar movimiento</h1>
      <FormularioTransaccion
        transaccion={transaccion}
        categorias={categorias}
        eventos={eventos}
        volverA={volverA}
      />
    </div>
  );
}
