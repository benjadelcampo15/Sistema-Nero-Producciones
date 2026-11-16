import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { tableroCompleto } from "@/lib/tareas/consultas";
import { SinAcceso } from "../../sin-acceso";
import { TableroKanban } from "./tablero";

/** Un tablero (listas y tarjetas). Si el usuario no tiene acceso, para él no existe. */
export default async function PaginaTablero({ params, searchParams }: PageProps<"/tareas/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "tareas", "ver")) return <SinAcceso />;
  const { id } = await params;
  const { tarjeta } = await searchParams;
  const datos = await tableroCompleto(id);
  if (!datos) notFound();
  return <TableroKanban key={datos.tablero.id} datos={datos} yo={usuario.id} tarjetaInicial={typeof tarjeta === "string" ? tarjeta : null} />;
}
