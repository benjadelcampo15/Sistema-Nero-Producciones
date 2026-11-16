import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { inicioTareas, usuariosTareas } from "@/lib/tareas/consultas";
import { SinAcceso } from "../../sin-acceso";
import { ImportarTrello } from "./importar";

/** Importar un tablero de Trello (JSON exportado). */
export default async function PaginaImportar() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "tareas", "ver")) return <SinAcceso />;
  const [{ espacios }, usuarios] = await Promise.all([inicioTareas(usuario), usuariosTareas()]);
  return <ImportarTrello espacios={espacios.filter((e) => e.rol)} usuarios={usuarios} />;
}
