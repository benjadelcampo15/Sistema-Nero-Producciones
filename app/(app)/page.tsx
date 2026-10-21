import { redirect } from "next/navigation";
import { obtenerUsuario } from "@/lib/auth/sesion";
import { SECCIONES } from "@/lib/permisos";

/** Inicio: lleva a la primera sección habilitada. */
export default async function Inicio() {
  const usuario = await obtenerUsuario();

  const primera = SECCIONES.find((s) => usuario.permisos[s.id] !== "ninguno");
  if (primera) {
    redirect(primera.href);
  }
  if (usuario.esAdmin) {
    redirect("/configuracion/usuarios");
  }

  return (
    <div className="tarjeta max-w-lg">
      <h1 className="text-lg font-semibold">Hola, {usuario.nombre}</h1>
      <p className="mt-2 text-sm text-stone-600">
        Todavía no tenés acceso a ninguna sección. Pedile al administrador que te asigne permisos.
      </p>
    </div>
  );
}
