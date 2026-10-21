import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { SinAcceso } from "../sin-acceso";

export default async function PaginaFinanciero() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Financiero</h1>
      <p className="mt-2 text-sm text-stone-600">Movimientos y transacciones. Se construye en la fase 2.</p>
    </div>
  );
}
