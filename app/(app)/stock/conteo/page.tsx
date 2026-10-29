import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarDepositos, obtenerStock } from "@/lib/stock/consultas";
import { obtenerEventosResumidos } from "@/lib/financiero/consultas";
import { SinAcceso } from "../../sin-acceso";
import { ConteoBarra } from "./conteo-barra";

/** Conteo de barra desde el celular: lo que quedó al final del evento; sale la diferencia. */
export default async function PaginaConteo() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "editar")) return <SinAcceso />;
  const [stock, depositos, eventos] = await Promise.all([obtenerStock(), listarDepositos(), obtenerEventosResumidos()]);

  if (!depositos.length) {
    return (
      <p className="tarjeta text-sm text-stone-600">
        Todavía no hay depósitos. Crealos en <Link href="/stock/depositos" className="underline">Stock → Depósitos</Link>.
      </p>
    );
  }
  return <ConteoBarra stock={stock} depositos={depositos} eventos={eventos.slice(0, 30)} />;
}
