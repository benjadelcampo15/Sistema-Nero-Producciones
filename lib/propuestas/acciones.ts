"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { EMPRESAS } from "@/lib/empresas";
import { parsearMonto } from "@/lib/formato";
import { ESTADOS_PROPUESTA, esquemaPropuesta } from "./tipos";

/**
 * Propuestas de pago. Solo guardan la planificación: ninguna de estas acciones
 * toca Financiero, cuentas corrientes, saldos ni Solicitudes de pagos.
 */

const uuid = z.uuid();

export type EstadoFormularioPropuesta = { error?: string };

/** "+ Nueva propuesta de pagos": crea y abre la propuesta. */
export async function crearPropuesta(_previo: EstadoFormularioPropuesta, form: FormData): Promise<EstadoFormularioPropuesta> {
  await exigirPermiso("financiero", "editar");
  const disponibleTexto = String(form.get("disponible") ?? "").trim();
  const disponible = disponibleTexto ? parsearMonto(disponibleTexto) : 0;
  const v = z
    .object({
      nombre: z.string().trim().min(1, "Poné un nombre a la propuesta").max(200),
      empresa: z.enum(EMPRESAS),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí la fecha"),
      disponible: z.number({ message: "El importe disponible no es válido" }).min(0, "El importe disponible no puede ser negativo").max(1e13),
      observaciones: z.string().max(2000),
      clave_envio: z.uuid(),
    })
    .safeParse({
      nombre: form.get("nombre"),
      empresa: form.get("empresa"),
      fecha: form.get("fecha"),
      disponible: disponible ?? NaN,
      observaciones: String(form.get("observaciones") ?? ""),
      clave_envio: form.get("clave_envio"),
    });
  if (!v.success) return { error: v.error.issues[0]?.message ?? "Revisá los datos" };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("crear_propuesta_pago", { p: v.data });
  if (error || !data) return { error: "No se pudo crear la propuesta" };
  redirect(`/propuestas-pago/${data}`);
}

export type ResultadoGuardar = { error?: string; conflicto?: boolean; version?: string };

/** Guarda la propuesta entera (datos y pagos en su orden). Si otro guardó en el medio, avisa en lugar de pisar. */
export async function guardarPropuesta(id: string, datos: unknown, version: string, forzar = false): Promise<ResultadoGuardar> {
  await exigirPermiso("financiero", "editar");
  if (!uuid.safeParse(id).success) return { error: "Propuesta inválida" };
  const v = esquemaPropuesta.safeParse(datos);
  if (!v.success) return { error: v.error.issues[0]?.message ?? "Revisá los datos de la propuesta" };
  if (new Set(v.data.items.map((i) => i.id)).size !== v.data.items.length) return { error: "Hay pagos repetidos" };
  const solicitudes = v.data.items.map((i) => i.solicitud_id).filter(Boolean);
  if (new Set(solicitudes).size !== solicitudes.length) return { error: "La misma solicitud de pago está dos veces en la propuesta" };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("guardar_propuesta_pago", { p_id: id, p: v.data, p_version: version, p_forzar: forzar });
  if (error) {
    if (error.message.includes("CONFLICTO")) return { conflicto: true, error: "Otra persona guardó cambios en esta propuesta mientras editabas" };
    return { error: error.message.startsWith("Solo se modifican") || error.message.startsWith("La misma") ? error.message : "No se pudo guardar la propuesta" };
  }
  refresh();
  return { version: data as string };
}

export async function cambiarEstadoPropuesta(id: string, estado: string): Promise<{ error?: string }> {
  await exigirPermiso("financiero", "editar");
  if (!uuid.safeParse(id).success || !ESTADOS_PROPUESTA.includes(estado as never)) return { error: "Datos inválidos" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cambiar_estado_propuesta_pago", { p_id: id, p_estado: estado });
  if (error) return { error: "No se pudo cambiar el estado" };
  refresh();
  return {};
}

/** Copia la propuesta (datos y pagos) como borrador nuevo para probar otra alternativa. */
export async function duplicarPropuesta(id: string, nombre: string, clave: string): Promise<{ error?: string }> {
  await exigirPermiso("financiero", "editar");
  if (!uuid.safeParse(id).success || !uuid.safeParse(clave).success) return { error: "Datos inválidos" };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("duplicar_propuesta_pago", { p_id: id, p_nombre: nombre.trim().slice(0, 200), p_clave: clave });
  if (error || !data) return { error: "No se pudo duplicar la propuesta" };
  redirect(`/propuestas-pago/${data}`);
}

export async function eliminarPropuesta(id: string): Promise<{ error?: string }> {
  await exigirPermiso("financiero", "editar");
  if (!uuid.safeParse(id).success) return { error: "Propuesta inválida" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("eliminar_propuesta_pago", { p_id: id });
  if (error) return { error: error.message.startsWith("Solo se eliminan") ? error.message : "No se pudo eliminar la propuesta" };
  redirect("/propuestas-pago");
}
