import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { SinAcceso } from "../sin-acceso";

export default async function PaginaEventos() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "eventos", "ver")) return <SinAcceso />;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Eventos</h1>
      <p className="mt-2 text-sm text-stone-600">Eventos con sus movimientos y balance. Se construye en la fase 3.</p>
    </div>
  );
}
