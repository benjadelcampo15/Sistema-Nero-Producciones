import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerPlano } from "@/lib/livings/consultas";
import { SinAcceso } from "../sin-acceso";
import { EditorPlano } from "./editor-plano";

export default async function PaginaLivings() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "livings", "ver")) return <SinAcceso />;

  const plano = await obtenerPlano();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Livings VIP</h1>
        <p className="text-sm text-stone-500 print:hidden">
          Livings con reserva del jardín y del salón: subí el Excel, la app los acomoda y les asigna mozos.
        </p>
      </div>
      <EditorPlano inicial={plano} editable={puede(usuario, "livings", "editar")} />
    </div>
  );
}
