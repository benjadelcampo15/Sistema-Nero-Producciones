"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { esquemaContrasenaNueva } from "@/lib/auth/contrasena";
import { registrarAuditoria } from "@/lib/auditoria";

export async function salir() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}

export type EstadoCambioContrasena = { error?: string };

export async function cambiarContrasena(
  _previo: EstadoCambioContrasena,
  formData: FormData,
): Promise<EstadoCambioContrasena> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const usuarioId = data?.claims?.sub;
  if (!usuarioId) {
    redirect("/login");
  }

  const nueva = String(formData.get("nueva") ?? "");
  const repetida = String(formData.get("repetida") ?? "");

  const validacion = esquemaContrasenaNueva.safeParse(nueva);
  if (!validacion.success) {
    return { error: validacion.error.issues[0].message };
  }
  if (nueva !== repetida) {
    return { error: "Las contraseñas no coinciden" };
  }

  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) {
    if (error.code === "same_password") {
      return { error: "La contraseña nueva tiene que ser distinta de la anterior" };
    }
    if (error.code === "weak_password") {
      return { error: "La contraseña es débil o apareció en filtraciones conocidas. Probá con otra." };
    }
    return { error: "No se pudo cambiar la contraseña. Intentá de nuevo." };
  }

  const { error: errorPerfil } = await crearClienteAdmin()
    .from("perfiles")
    .update({ debe_cambiar_contrasena: false })
    .eq("id", usuarioId);
  if (errorPerfil) {
    return { error: "La contraseña cambió pero no se pudo actualizar el perfil. Avisale al administrador." };
  }

  await registrarAuditoria({
    usuarioId,
    accion: "CAMBIO_CONTRASENA",
    tabla: "perfiles",
    registroId: usuarioId,
  });

  redirect("/");
}
