import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerEvento } from "@/lib/eventos/consultas";
import { FormularioEvento } from "@/components/formulario-evento";
import { SinAcceso } from "../../../sin-acceso";

export default async function PaginaEditarEvento({ params }: PageProps<"/eventos/[id]/editar">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "eventos", "editar")) return <SinAcceso />;

  const { id } = await params;
  const evento = await obtenerEvento(id);
  if (!evento) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar evento</h1>
      <FormularioEvento evento={evento} />
    </div>
  );
}
