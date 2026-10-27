import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerEvento } from "@/lib/eventos/consultas";
import { obtenerCategorias } from "@/lib/financiero/consultas";
import { FormularioTransaccion } from "@/components/formulario-transaccion";
import { SinAcceso } from "../../../sin-acceso";

/** Alta de un movimiento ya asociado al evento: va también a Financiero. */
export default async function PaginaMovimientoEvento({ params }: PageProps<"/eventos/[id]/movimiento">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "eventos", "editar") && !puede(usuario, "financiero", "editar")) return <SinAcceso />;

  const { id } = await params;
  const [evento, categorias] = await Promise.all([obtenerEvento(id), obtenerCategorias()]);
  if (!evento) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/eventos/${id}`} className="text-sm text-stone-500 hover:text-stone-900">← {evento.nombre}</Link>
        <h1 className="mt-1 text-2xl font-semibold">Nuevo movimiento del evento</h1>
      </div>
      <FormularioTransaccion
        categorias={categorias}
        eventos={[]}
        empresa={evento.empresa}
        eventoFijo={{ id: evento.id, nombre: evento.nombre, fecha: evento.fecha }}
        volverA={`/eventos/${id}`}
      />
    </div>
  );
}
