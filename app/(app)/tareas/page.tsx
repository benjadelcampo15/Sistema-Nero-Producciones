import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { inicioTareas, usuariosTareas } from "@/lib/tareas/consultas";
import { SinAcceso } from "../sin-acceso";
import { InicioTareas } from "./inicio";

/** Inicio de Tareas (como el de Trello): espacios de trabajo, tableros, favoritos y recientes. */
export default async function PaginaTareas() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "tareas", "ver")) return <SinAcceso />;
  const [datos, usuarios] = await Promise.all([inicioTareas(usuario), usuariosTareas()]);
  return <InicioTareas {...datos} usuarios={usuarios} yo={usuario.id} creaEspacios={puede(usuario, "tareas", "editar")} />;
}
