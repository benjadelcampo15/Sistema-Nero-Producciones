import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { eventosParaPropuesta, historialPropuesta, obtenerPropuesta, proveedoresParaPropuesta, solicitudesParaPropuesta } from "@/lib/propuestas/consultas";
import { SinAcceso } from "../../sin-acceso";
import { EditorPropuesta } from "./editor";

export default async function PaginaPropuestaPago({ params }: PageProps<"/propuestas-pago/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const editor = puede(usuario, "financiero", "editar");
  const { id } = await params;
  const propuesta = await obtenerPropuesta(id);
  if (!propuesta) notFound();

  const [historial, eventos, solicitudes, proveedores] = await Promise.all([
    historialPropuesta(id),
    eventosParaPropuesta(propuesta.empresa),
    editor ? solicitudesParaPropuesta(propuesta.empresa) : Promise.resolve([]),
    editor ? proveedoresParaPropuesta() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/propuestas-pago" className="text-sm text-stone-500 hover:text-stone-900">← Propuestas de pago</Link>
      <EditorPropuesta
        propuesta={propuesta}
        historial={historial}
        eventos={eventos}
        solicitudes={solicitudes}
        proveedores={proveedores}
        editor={editor}
      />
    </div>
  );
}
