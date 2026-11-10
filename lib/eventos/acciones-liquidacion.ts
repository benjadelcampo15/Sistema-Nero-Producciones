"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso, obtenerUsuario, puede } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { SECCIONES } from "./liquidacion";

/*
 * Entradas y liquidación Isidris. Ninguna de estas acciones toca Financiero:
 * es solo el cálculo de cuánto le corresponde a cada socio.
 */

type Resultado = { error?: string };
const uuid = z.uuid();

export async function activarLiquidacion(eventoId: string): Promise<Resultado> {
  await exigirPermiso("eventos", "editar");
  if (!uuid.safeParse(eventoId).success) return { error: "Evento inválido" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("liquidacion_evento").upsert({ evento_id: eventoId }, { onConflict: "evento_id", ignoreDuplicates: true });
  if (error) return { error: "No se pudo activar la sección" };
  refresh();
  return {};
}

/** Quita la sección del evento (solo si no hay ventas cargadas). */
export async function quitarLiquidacion(eventoId: string): Promise<Resultado> {
  await exigirPermiso("eventos", "editar");
  if (!uuid.safeParse(eventoId).success) return { error: "Evento inválido" };
  const supabase = await crearClienteServidor();
  const { data: vendidas } = await supabase.from("liquidacion_categorias").select("id").eq("evento_id", eventoId).gt("cantidad", 0).limit(1);
  if (vendidas?.length) return { error: "Hay ventas cargadas: poné las cantidades en 0 antes de quitar la sección" };
  const { error } = await supabase.from("liquidacion_evento").delete().eq("evento_id", eventoId);
  if (error) return { error: "No se pudo quitar la sección" };
  refresh();
  return {};
}

const esquemaConfiguracion = z.object({
  pct_nero: z.number().min(0, "El porcentaje va de 0 a 100").max(100, "El porcentaje va de 0 a 100").optional(),
  comida: z.boolean().optional(),
  parking: z.boolean().optional(),
});

export async function configurarLiquidacion(eventoId: string, datos: unknown): Promise<Resultado> {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "eventos", "editar")) return { error: "No tenés permiso para editar el evento" };
  const v = esquemaConfiguracion.safeParse(datos);
  if (!uuid.safeParse(eventoId).success || !v.success) return { error: v.success ? "Evento inválido" : v.error.issues[0].message };
  // El reparto lo cambia solo quien maneja la plata (o un administrador).
  if (v.data.pct_nero !== undefined && !usuario.esAdmin && !puede(usuario, "financiero", "editar")) {
    return { error: "Solo un administrador o alguien con permiso en Financiero puede cambiar el reparto" };
  }
  const fila = { ...v.data, ...(v.data.pct_nero !== undefined ? { pct_nero: Math.round(v.data.pct_nero * 100) / 100 } : {}) };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("liquidacion_evento").update(fila).eq("evento_id", eventoId).select("evento_id");
  if (error || !data?.length) return { error: "No se pudo guardar" };
  refresh();
  return {};
}

export async function agregarCategoria(eventoId: string, seccion: string, nombre: string): Promise<Resultado> {
  await exigirPermiso("eventos", "editar");
  const s = z.enum(SECCIONES).safeParse(seccion);
  const n = nombre.trim().slice(0, 80);
  if (!uuid.safeParse(eventoId).success || !s.success) return { error: "Datos inválidos" };
  if (!n) return { error: "Poné el nombre (ej. Preventa Corona)" };
  const supabase = await crearClienteServidor();
  const { data: actuales } = await supabase.from("liquidacion_categorias").select("orden").eq("evento_id", eventoId).eq("seccion", s.data);
  const { error } = await supabase
    .from("liquidacion_categorias")
    .insert({ evento_id: eventoId, seccion: s.data, nombre: n, orden: Math.max(0, ...(actuales ?? []).map((a) => a.orden)) + 1 });
  if (error) return { error: "No se pudo agregar" };
  refresh();
  return {};
}

const monto = z.number().min(0, "No puede ser negativo").max(1e11, "Importe demasiado grande");
const entero = z.number().int("Tiene que ser un número entero").min(0, "No puede ser negativo").max(10_000_000, "Número demasiado grande");
const CAMPOS = {
  nombre: z.string().trim().min(1, "Falta el nombre").max(80),
  valor: monto,
  stock: entero.nullable(),
  cantidad: entero,
  multiplicador: z.number().int("Tiene que ser un número entero").min(1, "Mínimo 1").max(100, "Máximo 100"),
  corona: monto,
  degus: monto,
  gastro: monto,
  activa: z.boolean(),
} as const;

/** Cambia un dato de una categoría (se guarda celda por celda). */
export async function actualizarCategoria(id: string, campo: string, valor: unknown): Promise<Resultado> {
  await exigirPermiso("eventos", "editar");
  if (!uuid.safeParse(id).success || !Object.hasOwn(CAMPOS, campo)) return { error: "Datos inválidos" };
  const v = CAMPOS[campo as keyof typeof CAMPOS].safeParse(valor);
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("liquidacion_categorias").update({ [campo]: v.data }).eq("id", id).select("id");
  if (error || !data?.length) return { error: "No se pudo guardar" };
  refresh();
  return {};
}

/** Suma ventas nuevas a las ya cargadas (o resta, para corregir), sin pisar lo que cargó otro. */
export async function sumarCantidad(id: string, cantidad: number): Promise<Resultado> {
  await exigirPermiso("eventos", "editar");
  if (!uuid.safeParse(id).success || !Number.isInteger(cantidad) || cantidad === 0 || Math.abs(cantidad) > 1_000_000) {
    return { error: "Cantidad inválida" };
  }
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("sumar_liquidacion", { p_id: id, p_cantidad: cantidad });
  if (error) return { error: "No se pudo sumar" };
  if (data === null) return { error: "No se puede restar más de lo cargado" };
  refresh();
  return {};
}

/** Borra una categoría sin ventas (si tiene ventas, se desactiva). */
export async function borrarCategoria(id: string): Promise<Resultado> {
  await exigirPermiso("eventos", "editar");
  if (!uuid.safeParse(id).success) return { error: "Datos inválidos" };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("liquidacion_categorias").delete().eq("id", id).eq("cantidad", 0).select("id");
  if (error) return { error: "No se pudo borrar" };
  if (!data?.length) return { error: "Tiene ventas cargadas: desactivala en lugar de borrarla" };
  refresh();
  return {};
}
