"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { urlBase } from "@/lib/url";
import { CAMPOS_PERSONA, ESTADOS_SEGURO, esquemaPersona, type DatosPersona, type EstadoSeguro } from "./tipos";
import { urlPoliza } from "./consultas";

export type EstadoFormEmpleado = { error?: string; ok?: string; valores?: Record<string, string> };

const valoresDe = (formData: FormData) =>
  Object.fromEntries([...formData.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$"))) as Record<string, string>;
const esUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

// ─── Personal ────────────────────────────────────────────────────────────

export async function guardarPersona(id: string | null, _previo: EstadoFormEmpleado, formData: FormData): Promise<EstadoFormEmpleado> {
  await exigirPermiso("operativa", "editar");
  const valores = valoresDe(formData);
  const datos = esquemaPersona.safeParse(valores);
  if (!datos.success) return { error: datos.error.issues[0].message, valores };
  const notas = (valores.notas ?? "").trim().slice(0, 1000) || null;

  const supabase = await crearClienteServidor();
  const fila = { ...datos.data, notas };
  const { data, error } = id
    ? await supabase.from("personal").update(fila).eq("id", id).select("id")
    : await supabase.from("personal").insert(fila).select("id");
  if (error || !data?.length) {
    return { error: error?.code === "23505" ? "Ya hay un empleado con ese DNI" : "No se pudo guardar", valores };
  }
  refresh();
  return { ok: id ? "Datos actualizados" : "Empleado agregado" };
}

/** Pasa a la ficha los datos que mandó por el formulario alguien que ya estaba cargado. */
export async function aplicarEnvio(id: string): Promise<{ error?: string }> {
  await exigirPermiso("operativa", "editar");
  const supabase = await crearClienteServidor();
  const { data: envio } = await supabase.from("personal_envios").select("persona_id, datos").eq("id", id).eq("estado", "cambios").maybeSingle();
  if (!envio?.persona_id) return { error: "Envío no encontrado" };
  const datos = envio.datos as DatosPersona;
  // Solo se pasan los campos que vinieron con algo (no se borra lo que ya estaba).
  const cambios = Object.fromEntries(CAMPOS_PERSONA.map((c) => [c.id, datos[c.id]]).filter(([, v]) => v !== null && v !== ""));
  const { error } = await supabase.from("personal").update(cambios).eq("id", envio.persona_id);
  if (error) return { error: "No se pudieron aplicar los datos" };
  await supabase.from("personal_envios").update({ estado: "aplicado" }).eq("id", id);
  refresh();
  return {};
}

export async function descartarEnvio(id: string): Promise<{ error?: string }> {
  await exigirPermiso("operativa", "editar");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("personal_envios").update({ estado: "descartado" }).eq("id", id).select("id");
  if (!data?.length) return { error: "No se pudo descartar" };
  refresh();
  return {};
}

// ─── Formulario público ──────────────────────────────────────────────────

const nuevoToken = () => randomBytes(24).toString("base64url");

/** Crea el formulario (la primera vez), lo abre/cierra o genera un link nuevo. Devuelve el link. */
export async function configurarFormulario(accion: "crear" | "abrir" | "cerrar" | "renovar"): Promise<{ url?: string; error?: string }> {
  await exigirPermiso("operativa", "editar");
  const supabase = await crearClienteServidor();
  const { data: actual } = await supabase.from("formulario_personal").select("token").eq("unico", true).maybeSingle();
  let token = actual?.token;
  if (!actual) {
    token = nuevoToken();
    const { error } = await supabase.from("formulario_personal").insert({ token, abierto: true });
    if (error) return { error: "No se pudo crear el formulario" };
  } else {
    const cambios = accion === "renovar" ? { token: (token = nuevoToken()) } : accion === "crear" ? {} : { abierto: accion === "abrir" };
    const { error } = await supabase.from("formulario_personal").update(cambios).eq("unico", true);
    if (error) return { error: "No se pudo actualizar el formulario" };
  }
  refresh();
  return { url: `${await urlBase()}/p/alta/${token}` };
}

/**
 * Lo manda el empleado desde el link público (sin usuario). Un DNI nuevo se
 * carga directo; si el DNI ya existe, queda para que la productora lo revise.
 */
export async function enviarFormularioPersonal(token: string, _previo: EstadoFormEmpleado, formData: FormData): Promise<EstadoFormEmpleado> {
  const valores = valoresDe(formData);
  // Campo trampa: invisible para las personas; si viene con algo es un robot.
  if (valores.sitio_web) return { ok: "¡Gracias! Recibimos tus datos." };

  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return { error: "El formulario no existe" };
  const admin = crearClienteAdmin();
  const { data: formulario } = await admin.from("formulario_personal").select("abierto").eq("token", token).maybeSingle();
  if (!formulario) return { error: "El formulario no existe" };
  if (!formulario.abierto) return { error: "El formulario está cerrado. Consultá con la productora." };

  const datos = esquemaPersona.safeParse(valores);
  if (!datos.success) return { error: datos.error.issues[0].message, valores };

  const { data: existente } = await admin.from("personal").select("id").eq("dni", datos.data.dni).maybeSingle();
  if (existente) {
    const { error } = await admin.from("personal_envios").insert({ persona_id: existente.id, datos: datos.data, estado: "cambios" });
    if (error) return { error: "No se pudieron enviar los datos. Probá de nuevo.", valores };
  } else {
    const { data: nueva, error } = await admin.from("personal").insert(datos.data).select("id").single();
    if (error || !nueva) return { error: "No se pudieron enviar los datos. Probá de nuevo.", valores };
    await admin.from("personal_envios").insert({ persona_id: nueva.id, datos: datos.data, estado: "nuevo" });
  }
  return { ok: "¡Gracias! Recibimos tus datos." };
}

// ─── Seguros por evento ──────────────────────────────────────────────────

export async function agregarConvocados(eventoId: string, personas: string[]): Promise<{ error?: string }> {
  await exigirPermiso("operativa", "editar");
  if (!esUuid(eventoId) || !personas.every(esUuid)) return { error: "Datos inválidos" };
  if (!personas.length) return {};
  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("convocados")
    .upsert(personas.map((persona_id) => ({ evento_id: eventoId, persona_id, origen: "manual" })), { onConflict: "evento_id,persona_id", ignoreDuplicates: true });
  if (error) return { error: "No se pudieron agregar" };
  refresh();
  return {};
}

export async function quitarConvocado(id: string): Promise<{ error?: string }> {
  await exigirPermiso("operativa", "editar");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("convocados").delete().eq("id", id).select("id");
  if (!data?.length) return { error: "No se pudo quitar" };
  refresh();
  return {};
}

export async function cambiarConvocado(id: string, cambio: { seguro?: EstadoSeguro; puesto?: string; poliza_id?: string | null }): Promise<{ error?: string }> {
  await exigirPermiso("operativa", "editar");
  if (cambio.seguro && !ESTADOS_SEGURO.some((e) => e.id === cambio.seguro)) return { error: "Estado inválido" };
  const fila = { ...cambio, ...(cambio.puesto !== undefined ? { puesto: cambio.puesto.trim().slice(0, 80) || null } : {}) };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("convocados").update(fila).eq("id", id).select("id");
  if (!data?.length) return { error: "No se pudo actualizar" };
  refresh();
  return {};
}

/** Marca a todos los del evento con el estado de seguro dado (y la póliza, si se cubren). */
export async function marcarTodos(eventoId: string, seguro: EstadoSeguro, polizaId: string | null): Promise<{ error?: string }> {
  await exigirPermiso("operativa", "editar");
  if (!esUuid(eventoId) || (polizaId && !esUuid(polizaId))) return { error: "Datos inválidos" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("convocados").update({ seguro, ...(seguro === "cubierto" ? { poliza_id: polizaId } : {}) }).eq("evento_id", eventoId);
  if (error) return { error: "No se pudo actualizar" };
  refresh();
  return {};
}

const esquemaPoliza = z.object({
  aseguradora: z.string().trim().min(1, "Falta la aseguradora").max(100),
  numero: z.string().trim().max(60).optional().transform((v) => v || null),
  vigencia_desde: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional().transform((v) => v || null),
  vigencia_hasta: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional().transform((v) => v || null),
});

/** Tipo real del archivo por sus primeros bytes. */
function tipoArchivo(d: Buffer): { tipo: string; extension: string } | null {
  if (d.subarray(0, 4).toString("latin1") === "%PDF") return { tipo: "application/pdf", extension: "pdf" };
  if (d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff) return { tipo: "image/jpeg", extension: "jpg" };
  if (d.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { tipo: "image/png", extension: "png" };
  return null;
}

export async function guardarPoliza(eventoId: string, _previo: EstadoFormEmpleado, formData: FormData): Promise<EstadoFormEmpleado> {
  await exigirPermiso("operativa", "editar");
  if (!esUuid(eventoId)) return { error: "Evento inválido" };
  const valores = valoresDe(formData);
  const datos = esquemaPoliza.safeParse(valores);
  if (!datos.success) return { error: datos.error.issues[0].message, valores };

  let archivo: { archivo_path: string; archivo_tipo: string } | null = null;
  const subido = formData.get("archivo");
  if (subido instanceof File && subido.size > 0) {
    if (subido.size > 10 * 1024 * 1024) return { error: "El archivo supera los 10 MB", valores };
    const bytes = Buffer.from(await subido.arrayBuffer());
    const tipo = tipoArchivo(bytes);
    if (!tipo) return { error: "Subí la póliza en PDF o foto (JPG/PNG)", valores };
    const path = `${eventoId}/${randomUUID()}.${tipo.extension}`;
    const { error } = await crearClienteAdmin().storage.from("seguros").upload(path, bytes, { contentType: tipo.tipo });
    if (error) return { error: "No se pudo guardar el archivo", valores };
    archivo = { archivo_path: path, archivo_tipo: tipo.tipo };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("polizas").insert({ ...datos.data, ...archivo, evento_id: eventoId });
  if (error) return { error: "No se pudo guardar la póliza", valores };
  refresh();
  return { ok: "Póliza cargada" };
}

export async function verPoliza(path: string): Promise<{ url?: string; error?: string }> {
  await exigirPermiso("operativa", "ver");
  // La póliza tiene que existir y ser visible para el usuario (RLS) antes de firmar el link.
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("polizas").select("id").eq("archivo_path", path).maybeSingle();
  if (!data) return { error: "Póliza no encontrada" };
  const url = await urlPoliza(path);
  return url ? { url } : { error: "No se pudo abrir el archivo" };
}
