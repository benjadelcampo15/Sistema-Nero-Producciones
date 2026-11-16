import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { misNotificaciones } from "@/lib/notificaciones/consultas";
import { mailConfigurado } from "@/lib/mail";
import { ListaNotificaciones } from "./lista";

/** La campana: notificaciones nuevas y anteriores, con acceso directo y preferencias. */
export default async function PaginaNotificaciones() {
  const usuario = await obtenerUsuario();
  const { lista, preferencias } = await misNotificaciones(puede(usuario, "tareas", "ver"));
  return <ListaNotificaciones lista={lista} preferencias={preferencias} conCorreo={mailConfigurado()} email={usuario.email} />;
}
