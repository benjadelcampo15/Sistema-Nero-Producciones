import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  alcanza,
  sinPermisos,
  type NivelPermiso,
  type Permisos,
  type Seccion,
} from "@/lib/permisos";

export type UsuarioActual = {
  id: string;
  nombre: string;
  email: string;
  esAdmin: boolean;
  permisos: Permisos;
};

/**
 * Usuario de la sesión actual, con 2FA verificado y activo.
 * Redirige al login si no cumple. El proxy ya filtra antes, pero cada
 * página y acción lo vuelve a verificar del lado del servidor.
 */
export const obtenerUsuario = cache(async (): Promise<UsuarioActual> => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims || claims.aal !== "aal2") {
    redirect("/login");
  }

  const [{ data: perfil }, { data: filas }] = await Promise.all([
    supabase
      .from("perfiles")
      .select("id, nombre, email, es_admin, activo, debe_cambiar_contrasena")
      .eq("id", claims.sub)
      .maybeSingle(),
    supabase.from("permisos").select("seccion, nivel").eq("usuario_id", claims.sub),
  ]);

  if (!perfil || !perfil.activo) {
    redirect("/login");
  }
  if (perfil.debe_cambiar_contrasena) {
    redirect("/cambiar-contrasena");
  }

  const permisos = sinPermisos();
  for (const fila of (filas ?? []) as { seccion: Seccion; nivel: NivelPermiso }[]) {
    permisos[fila.seccion] = fila.nivel;
  }
  if (perfil.es_admin) {
    for (const seccion of Object.keys(permisos) as Seccion[]) {
      permisos[seccion] = "editar";
    }
  }

  return {
    id: perfil.id,
    nombre: perfil.nombre,
    email: perfil.email,
    esAdmin: perfil.es_admin,
    permisos,
  };
});

export function puede(usuario: UsuarioActual, seccion: Seccion, nivel: NivelPermiso) {
  return alcanza(usuario.permisos[seccion], nivel);
}

/** Para Server Actions: corta si el usuario no tiene el permiso. */
export async function exigirPermiso(seccion: Seccion, nivel: NivelPermiso) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, seccion, nivel)) {
    throw new Error("No tenés permiso para esta acción");
  }
  return usuario;
}

/** Para Server Actions de administración. */
export async function exigirAdmin() {
  const usuario = await obtenerUsuario();
  if (!usuario.esAdmin) {
    throw new Error("Solo un administrador puede hacer esto");
  }
  return usuario;
}
