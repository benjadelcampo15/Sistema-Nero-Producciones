"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigirAdmin } from "@/lib/auth/sesion";
import { generarContrasenaTemporal } from "@/lib/auth/contrasena";
import { registrarAuditoria } from "@/lib/auditoria";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { NIVELES, SECCIONES, type Permisos } from "@/lib/permisos";

export type EstadoAccion = {
  error?: string;
  ok?: string;
  /** Se muestra una sola vez al admin; no se guarda en ningún lado. */
  contrasenaTemporal?: string;
  email?: string;
};

const esquemaPermisos = z.object({
  financiero: z.enum(NIVELES),
  eventos: z.enum(NIVELES),
  facturas: z.enum(NIVELES),
  stock: z.enum(NIVELES),
  facturar: z.enum(NIVELES),
  presupuestos: z.enum(NIVELES),
  cheques: z.enum(NIVELES),
  livings: z.enum(NIVELES),
});

function leerPermisos(formData: FormData) {
  return esquemaPermisos.safeParse(
    Object.fromEntries(SECCIONES.map((s) => [s.id, formData.get(`permiso_${s.id}`)])),
  );
}

function filasPermisos(usuarioId: string, permisos: Permisos) {
  return SECCIONES.map((s) => ({ usuario_id: usuarioId, seccion: s.id, nivel: permisos[s.id] }));
}

const esquemaNuevoUsuario = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre").max(100),
  email: z.email("Email inválido").trim().toLowerCase(),
});

export async function crearUsuario(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const admin = await exigirAdmin();

  const datos = esquemaNuevoUsuario.safeParse({
    nombre: formData.get("nombre"),
    email: formData.get("email"),
  });
  if (!datos.success) {
    return { error: datos.error.issues[0].message };
  }
  const permisos = leerPermisos(formData);
  if (!permisos.success) {
    return { error: "Permisos inválidos" };
  }
  const esAdmin = formData.get("es_admin") === "on";

  const supabase = crearClienteAdmin();
  const contrasenaTemporal = generarContrasenaTemporal();

  const { data: creado, error } = await supabase.auth.admin.createUser({
    email: datos.data.email,
    password: contrasenaTemporal,
    email_confirm: true,
  });
  if (error || !creado.user) {
    return {
      error:
        error?.code === "email_exists"
          ? "Ya existe un usuario con ese email"
          : "No se pudo crear el usuario",
    };
  }
  const id = creado.user.id;

  const perfil = {
    id,
    nombre: datos.data.nombre,
    email: datos.data.email,
    es_admin: esAdmin,
    debe_cambiar_contrasena: true,
  };
  const { error: errorPerfil } = await supabase.from("perfiles").insert(perfil);
  const { error: errorPermisos } = errorPerfil
    ? { error: errorPerfil }
    : await supabase.from("permisos").insert(filasPermisos(id, permisos.data));

  if (errorPerfil || errorPermisos) {
    // Deshacer: no dejar un usuario de login sin perfil.
    await supabase.auth.admin.deleteUser(id);
    return { error: "No se pudo crear el usuario" };
  }

  await registrarAuditoria({
    usuarioId: admin.id,
    accion: "CREAR_USUARIO",
    tabla: "perfiles",
    registroId: id,
    despues: { ...perfil, permisos: permisos.data },
  });

  refresh();
  return { ok: "Usuario creado", contrasenaTemporal, email: datos.data.email };
}

export async function actualizarPermisos(
  usuarioId: string,
  _previo: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const admin = await exigirAdmin();

  const permisos = leerPermisos(formData);
  if (!permisos.success) {
    return { error: "Permisos inválidos" };
  }
  const esAdmin = formData.get("es_admin") === "on";
  if (usuarioId === admin.id && !esAdmin) {
    return { error: "No podés sacarte el rol de administrador a vos mismo" };
  }

  const supabase = crearClienteAdmin();
  const [{ data: perfilAntes }, { data: permisosAntes }] = await Promise.all([
    supabase.from("perfiles").select("es_admin").eq("id", usuarioId).single(),
    supabase.from("permisos").select("seccion, nivel").eq("usuario_id", usuarioId),
  ]);

  const { error: errorPerfil } = await supabase.from("perfiles").update({ es_admin: esAdmin }).eq("id", usuarioId);
  const { error: errorPermisos } = await supabase
    .from("permisos")
    .upsert(filasPermisos(usuarioId, permisos.data));
  if (errorPerfil || errorPermisos) {
    return { error: "No se pudieron guardar los permisos" };
  }

  await registrarAuditoria({
    usuarioId: admin.id,
    accion: "ACTUALIZAR_PERMISOS",
    tabla: "permisos",
    registroId: usuarioId,
    antes: { es_admin: perfilAntes?.es_admin, permisos: permisosAntes },
    despues: { es_admin: esAdmin, permisos: permisos.data },
  });

  refresh();
  return { ok: "Permisos guardados" };
}

export async function cambiarEstadoUsuario(usuarioId: string, activo: boolean): Promise<EstadoAccion> {
  const admin = await exigirAdmin();
  if (usuarioId === admin.id) {
    return { error: "No podés desactivarte a vos mismo" };
  }

  const supabase = crearClienteAdmin();
  // El bloqueo en Auth impide renovar la sesión; el flag corta el acceso en la app y en RLS al instante.
  const { error: errorAuth } = await supabase.auth.admin.updateUserById(usuarioId, {
    ban_duration: activo ? "none" : "876000h",
  });
  const { error } = errorAuth
    ? { error: errorAuth }
    : await supabase.from("perfiles").update({ activo }).eq("id", usuarioId);
  if (error) {
    return { error: "No se pudo cambiar el estado del usuario" };
  }

  await registrarAuditoria({
    usuarioId: admin.id,
    accion: activo ? "ACTIVAR_USUARIO" : "DESACTIVAR_USUARIO",
    tabla: "perfiles",
    registroId: usuarioId,
    antes: { activo: !activo },
    despues: { activo },
  });

  refresh();
  return { ok: activo ? "Usuario activado" : "Usuario desactivado" };
}

export async function restablecerContrasena(usuarioId: string): Promise<EstadoAccion> {
  const admin = await exigirAdmin();
  const supabase = crearClienteAdmin();
  const contrasenaTemporal = generarContrasenaTemporal();

  const { error: errorAuth } = await supabase.auth.admin.updateUserById(usuarioId, {
    password: contrasenaTemporal,
  });
  const { error } = errorAuth
    ? { error: errorAuth }
    : await supabase.from("perfiles").update({ debe_cambiar_contrasena: true }).eq("id", usuarioId);
  if (error) {
    return { error: "No se pudo restablecer la contraseña" };
  }

  await registrarAuditoria({
    usuarioId: admin.id,
    accion: "RESTABLECER_CONTRASENA",
    tabla: "perfiles",
    registroId: usuarioId,
  });

  refresh();
  return { ok: "Contraseña restablecida", contrasenaTemporal };
}

export async function restablecer2FA(usuarioId: string): Promise<EstadoAccion> {
  const admin = await exigirAdmin();
  if (usuarioId === admin.id) {
    return { error: "Para restablecer tu propio 2FA pedíselo a otro administrador" };
  }

  const supabase = crearClienteAdmin();
  const { data, error } = await supabase.auth.admin.mfa.listFactors({ userId: usuarioId });
  if (error) {
    return { error: "No se pudo restablecer la verificación en dos pasos" };
  }
  for (const factor of data.factors) {
    const { error: errorBorrado } = await supabase.auth.admin.mfa.deleteFactor({
      userId: usuarioId,
      id: factor.id,
    });
    if (errorBorrado) {
      return { error: "No se pudo restablecer la verificación en dos pasos" };
    }
  }

  await registrarAuditoria({
    usuarioId: admin.id,
    accion: "RESTABLECER_2FA",
    tabla: "perfiles",
    registroId: usuarioId,
  });

  refresh();
  return { ok: "2FA restablecido: el usuario lo configura de nuevo al ingresar" };
}
