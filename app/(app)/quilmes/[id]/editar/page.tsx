import { notFound, redirect } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerEvento } from "@/lib/eventos/consultas";
import { crearClienteServidor } from "@/lib/supabase/server";
import { FormularioEvento } from "@/components/formulario-evento";
import { SinAcceso } from "../../../sin-acceso";
import { BorrarEvento } from "../../../eventos/[id]/editar/borrar-evento";

export default async function PaginaEditarQuilmes({ params }: PageProps<"/quilmes/[id]/editar">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "quilmes", "editar")) return <SinAcceso />;

  const { id } = await params;
  const evento = await obtenerEvento(id);
  if (!evento) notFound();
  if (evento.tipo !== "quilmes") redirect(`/eventos/${id}/editar`);
  const movimientos = usuario.esAdmin
    ? ((await (await crearClienteServidor()).from("transacciones").select("id", { count: "exact", head: true }).eq("evento_id", id).is("eliminado_en", null)).count ?? 0)
    : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar evento Quilmes</h1>
      <FormularioEvento evento={evento} />
      {usuario.esAdmin && <BorrarEvento id={evento.id} nombre={evento.nombre} movimientos={movimientos} />}
    </div>
  );
}
