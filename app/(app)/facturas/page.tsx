import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { SinAcceso } from "../sin-acceso";

export default async function PaginaFacturas() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturas", "ver")) return <SinAcceso />;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Facturas</h1>
      <p className="mt-2 text-sm text-stone-600">Carga de facturas con lectura por IA. Se construye en la fase 4.</p>
    </div>
  );
}
