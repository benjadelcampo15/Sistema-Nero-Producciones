"use server";

import { after } from "next/server";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { enviarCorreosPendientes } from "@/lib/notificaciones/correo";
import { urlBase } from "@/lib/url";
import { COLORES_ETIQUETA, type Actividad, type Adjunto, type Checklist, type Comentario, type DetalleTarjeta, type ItemChecklist } from "./tipos";

/**
 * Tarjetas completas (orden 2): detalle, etiquetas, checklists, adjuntos,
 * comentarios, seguidores y copias. Los permisos los valida la base (RLS);
 * el historial y los avisos los registran sus triggers.
 */
type Resultado = { error?: string };

const uuid = z.uuid();
const SIN_PERMISO = "No tenés permiso para hacer esto en este tablero";
async function db() {
  await exigirPermiso("tareas", "ver");
  return crearClienteServidor();
}
const fallo = (e: { message: string } | null, defecto: string) =>
  /row-level|permission/i.test(e?.message ?? "") ? SIN_PERMISO : e?.message && !/violates|syntax|function|relation|column/i.test(e.message) ? e.message : defecto;
const sinFilas = (data: unknown[] | null) => (!data?.length ? { error: SIN_PERMISO } : {});
const valido = (...ids: string[]) => ids.every((i) => uuid.safeParse(i).success);

/** Después de responder: manda los correos de los avisos que se generaron. */
async function correosDespues() {
  const base = await urlBase().catch(() => undefined);
  after(() => enviarCorreosPendientes(40, base).catch(() => undefined));
}

// ─── Detalle ─────────────────────────────────────────────────────────────

/** Todo lo de una tarjeta abierta: checklists, adjuntos (con links temporales), comentarios, historial y si la sigo. */
export async function detalleTarjeta(id: string): Promise<DetalleTarjeta | null> {
  if (!valido(id)) return null;
  const supabase = await db();
  const { data: auth } = await supabase.auth.getClaims();
  const [{ data: checklists }, { data: adjuntos }, { data: comentarios }, { data: actividad }, { data: sigo }] = await Promise.all([
    supabase.from("tareas_checklists").select("id, nombre, posicion, tareas_checklist_items(id, checklist_id, texto, hecho, posicion, responsable_id, vence)").eq("tarjeta_id", id).order("posicion"),
    supabase.from("tareas_adjuntos").select("id, nombre, ruta, url, mime, tamano, subido_por, creado_en").eq("tarjeta_id", id).order("creado_en", { ascending: false }),
    supabase.from("tareas_comentarios").select("id, autor_id, texto, respuesta_a, creado_en, editado_en").eq("tarjeta_id", id).order("creado_en", { ascending: false }),
    supabase.from("tareas_actividad").select("id, usuario_id, tipo, detalle, creado_en").eq("tarjeta_id", id).order("creado_en", { ascending: false }).limit(150),
    supabase.from("tareas_seguidores").select("usuario_id").eq("tarjeta_id", id).eq("usuario_id", auth?.claims?.sub ?? "").maybeSingle(),
  ]);
  const rutas = (adjuntos ?? []).filter((a) => a.ruta).map((a) => a.ruta as string);
  const { data: firmadas } = rutas.length ? await crearClienteAdmin().storage.from("tareas").createSignedUrls(rutas, 3600) : { data: [] };
  const link = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
  type FilaChecklist = { id: string; nombre: string; posicion: number; tareas_checklist_items: ItemChecklist[] };
  return {
    checklists: ((checklists ?? []) as FilaChecklist[]).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      posicion: c.posicion,
      items: [...c.tareas_checklist_items].sort((a, b) => a.posicion - b.posicion),
    })) as Checklist[],
    adjuntos: (adjuntos ?? []).map((a) => ({ ...a, enlace: a.ruta ? (link.get(a.ruta) ?? null) : a.url })) as Adjunto[],
    comentarios: (comentarios ?? []) as Comentario[],
    actividad: (actividad ?? []) as Actividad[],
    sigo: !!sigo,
  };
}

// ─── Etiquetas ───────────────────────────────────────────────────────────

const color = z.string().refine((c) => Object.hasOwn(COLORES_ETIQUETA, c), "Color inválido");

export async function crearEtiqueta(tableroId: string, id: string, nombre: string, colorEtiqueta: string): Promise<Resultado> {
  if (!valido(tableroId, id) || !color.safeParse(colorEtiqueta).success) return { error: "Datos inválidos" };
  const supabase = await db();
  const { error } = await supabase.from("tareas_etiquetas").insert({ id, tablero_id: tableroId, nombre: nombre.trim().slice(0, 60), color: colorEtiqueta, posicion: Date.now() % 1e9 });
  return error ? { error: fallo(error, "No se pudo crear la etiqueta") } : {};
}

export async function editarEtiqueta(id: string, nombre: string, colorEtiqueta: string): Promise<Resultado> {
  if (!valido(id) || !color.safeParse(colorEtiqueta).success) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_etiquetas").update({ nombre: nombre.trim().slice(0, 60), color: colorEtiqueta }).eq("id", id).select("id");
  return error ? { error: fallo(error, "No se pudo guardar") } : sinFilas(data);
}

export async function borrarEtiqueta(id: string): Promise<Resultado> {
  if (!valido(id)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_etiquetas").delete().eq("id", id).select("id");
  return error ? { error: fallo(error, "No se pudo borrar") } : sinFilas(data);
}

export async function etiquetarTarjeta(tarjetaId: string, etiquetaId: string, puesta: boolean): Promise<Resultado> {
  if (!valido(tarjetaId, etiquetaId)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { error } = puesta
    ? await supabase.from("tareas_tarjeta_etiquetas").upsert({ tarjeta_id: tarjetaId, etiqueta_id: etiquetaId }, { onConflict: "tarjeta_id,etiqueta_id" })
    : await supabase.from("tareas_tarjeta_etiquetas").delete().eq("tarjeta_id", tarjetaId).eq("etiqueta_id", etiquetaId);
  return error ? { error: fallo(error, "No se pudo cambiar la etiqueta") } : {};
}

// ─── Checklists ──────────────────────────────────────────────────────────

const texto = (max: number) => z.string().trim().min(1, "Escribí algo").max(max);

export async function crearChecklist(tarjetaId: string, id: string, nombre: string, posicion: number): Promise<Resultado> {
  const n = texto(200).safeParse(nombre);
  if (!n.success || !valido(tarjetaId, id)) return { error: "Escribí un nombre" };
  const supabase = await db();
  const { error } = await supabase.from("tareas_checklists").insert({ id, tarjeta_id: tarjetaId, nombre: n.data, posicion });
  return error ? { error: fallo(error, "No se pudo crear la checklist") } : {};
}

export async function editarChecklist(id: string, nombre: string): Promise<Resultado> {
  const n = texto(200).safeParse(nombre);
  if (!n.success || !valido(id)) return { error: "Escribí un nombre" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_checklists").update({ nombre: n.data }).eq("id", id).select("id");
  return error ? { error: fallo(error, "No se pudo guardar") } : sinFilas(data);
}

export async function borrarChecklist(id: string): Promise<Resultado> {
  if (!valido(id)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_checklists").delete().eq("id", id).select("id");
  return error ? { error: fallo(error, "No se pudo borrar") } : sinFilas(data);
}

export async function crearItem(checklistId: string, id: string, textoItem: string, posicion: number): Promise<Resultado> {
  const t = texto(1000).safeParse(textoItem);
  if (!t.success || !valido(checklistId, id)) return { error: "Escribí el elemento" };
  const supabase = await db();
  const { error } = await supabase.from("tareas_checklist_items").insert({ id, checklist_id: checklistId, texto: t.data, posicion });
  return error ? { error: fallo(error, "No se pudo agregar") } : {};
}

const esquemaItem = z
  .object({ texto: texto(1000), hecho: z.boolean(), posicion: z.number().finite(), responsable_id: uuid.nullable(), vence: z.iso.date().nullable() })
  .partial();

export async function editarItem(id: string, cambios: z.input<typeof esquemaItem>): Promise<Resultado> {
  const v = esquemaItem.safeParse(cambios);
  if (!v.success || !valido(id)) return { error: v.error?.issues[0].message ?? "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_checklist_items").update(v.data).eq("id", id).select("id");
  return error ? { error: fallo(error, "No se pudo guardar") } : sinFilas(data);
}

export async function borrarItem(id: string): Promise<Resultado> {
  if (!valido(id)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_checklist_items").delete().eq("id", id).select("id");
  return error ? { error: fallo(error, "No se pudo borrar") } : sinFilas(data);
}

// ─── Adjuntos ────────────────────────────────────────────────────────────

const MAXIMO = 25 * 1024 * 1024;
const extension = (nombre: string) => (/\.([a-z0-9]{1,8})$/i.exec(nombre)?.[1] ?? "bin").toLowerCase();

/**
 * Paso 1 de un archivo: verifica que pueda editar la tarjeta y da un link
 * firmado para que el navegador lo suba directo (sin pasar por el servidor).
 */
export async function prepararAdjunto(tarjetaId: string, nombre: string, tamano: number): Promise<Resultado & { ruta?: string; token?: string }> {
  if (!valido(tarjetaId) || !nombre.trim()) return { error: "Datos inválidos" };
  if (!(tamano > 0) || tamano > MAXIMO) return { error: "El archivo puede pesar hasta 25 MB" };
  const supabase = await db();
  const { data: tablero } = await supabase.rpc("tareas_tablero_de", { p_tarjeta: tarjetaId });
  const { data: puede } = tablero ? await supabase.rpc("tareas_puede_editar", { p_tablero: tablero }) : { data: false };
  if (!puede) return { error: SIN_PERMISO };
  const ruta = `adjuntos/${tablero}/${tarjetaId}/${crypto.randomUUID()}.${extension(nombre)}`;
  const { data, error } = await crearClienteAdmin().storage.from("tareas").createSignedUploadUrl(ruta);
  if (error || !data) return { error: "No se pudo preparar la subida" };
  return { ruta, token: data.token };
}

/** Paso 2: con el archivo ya subido, se registra el adjunto (si no se puede, el archivo se borra). */
export async function confirmarAdjunto(tarjetaId: string, ruta: string, nombre: string, mime: string, tamano: number): Promise<Resultado & { id?: string }> {
  if (!valido(tarjetaId) || !ruta.startsWith("adjuntos/") || !ruta.includes(`/${tarjetaId}/`) || ruta.includes("..")) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase
    .from("tareas_adjuntos")
    .insert({ tarjeta_id: tarjetaId, ruta, nombre: nombre.trim().slice(0, 300), mime: mime.slice(0, 120) || null, tamano: Math.round(tamano) })
    .select("id")
    .single();
  if (error) {
    await crearClienteAdmin().storage.from("tareas").remove([ruta]);
    return { error: fallo(error, "No se pudo adjuntar") };
  }
  return { id: data.id };
}

export async function adjuntarEnlace(tarjetaId: string, url: string, nombre: string): Promise<Resultado & { id?: string }> {
  const u = z.url({ protocol: /^https?$/ }).max(2000).safeParse(url.trim());
  if (!valido(tarjetaId) || !u.success) return { error: "Pegá un enlace válido (https://…)" };
  const supabase = await db();
  const { data, error } = await supabase
    .from("tareas_adjuntos")
    .insert({ tarjeta_id: tarjetaId, url: u.data, nombre: (nombre.trim() || u.data).slice(0, 300) })
    .select("id")
    .single();
  return error ? { error: fallo(error, "No se pudo adjuntar") } : { id: data.id };
}

export async function borrarAdjunto(id: string): Promise<Resultado> {
  if (!valido(id)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_adjuntos").delete().eq("id", id).select("ruta, tarjeta_id");
  if (error) return { error: fallo(error, "No se pudo borrar") };
  if (!data?.length) return { error: "Solo quien lo subió o un administrador del tablero puede borrarlo" };
  if (data[0].ruta) await crearClienteAdmin().storage.from("tareas").remove([data[0].ruta]);
  // Si era la portada, se saca.
  await supabase.from("tareas_tarjetas").update({ portada: null }).eq("id", data[0].tarjeta_id).eq("portada", `a:${id}`);
  return {};
}

// ─── Comentarios ─────────────────────────────────────────────────────────

/** Los @nombre del texto que corresponden a usuarios de Tareas (los nombres más largos primero). */
async function menciones(supabase: Awaited<ReturnType<typeof db>>, textoComentario: string) {
  if (!textoComentario.includes("@")) return [];
  const { data } = await supabase.rpc("tareas_usuarios");
  const usuarios = ((data ?? []) as { id: string; nombre: string }[]).sort((a, b) => b.nombre.length - a.nombre.length);
  const bajo = textoComentario.toLowerCase();
  return usuarios.filter((u) => bajo.includes(`@${u.nombre.toLowerCase()}`)).map((u) => u.id);
}

export async function comentar(tarjetaId: string, id: string, textoComentario: string, respuestaA: string | null): Promise<Resultado> {
  const t = texto(10000).safeParse(textoComentario);
  if (!t.success || !valido(tarjetaId, id) || (respuestaA && !valido(respuestaA))) return { error: "Escribí un comentario" };
  const supabase = await db();
  const mencionados = await menciones(supabase, t.data);
  const { error } = await supabase.from("tareas_comentarios").insert({ id, tarjeta_id: tarjetaId, texto: t.data, respuesta_a: respuestaA, mencionados });
  if (error) return { error: fallo(error, "No se pudo comentar") };
  await correosDespues();
  return {};
}

export async function editarComentario(id: string, textoComentario: string): Promise<Resultado> {
  const t = texto(10000).safeParse(textoComentario);
  if (!t.success || !valido(id)) return { error: "Escribí un comentario" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_comentarios").update({ texto: t.data, editado_en: new Date().toISOString() }).eq("id", id).select("id");
  return error ? { error: fallo(error, "No se pudo guardar") } : data?.length ? {} : { error: "Solo podés editar tus comentarios" };
}

export async function borrarComentario(id: string): Promise<Resultado> {
  if (!valido(id)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_comentarios").delete().eq("id", id).select("id");
  return error ? { error: fallo(error, "No se pudo borrar") } : data?.length ? {} : { error: "Solo podés borrar tus comentarios" };
}

// ─── Seguir, asignar y copiar ───────────────────────────────────────────

export async function seguirTarjeta(tarjetaId: string, seguir: boolean): Promise<Resultado> {
  if (!valido(tarjetaId)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { error } = seguir
    ? await supabase.from("tareas_seguidores").upsert({ tarjeta_id: tarjetaId }, { onConflict: "tarjeta_id,usuario_id" })
    : await supabase.from("tareas_seguidores").delete().eq("tarjeta_id", tarjetaId);
  return error ? { error: fallo(error, "No se pudo guardar") } : {};
}

/** Asigna o quita un responsable (y manda el aviso por correo si corresponde). */
export async function responsableTarjeta(tarjetaId: string, usuarioId: string, asignado: boolean): Promise<Resultado> {
  if (!valido(tarjetaId, usuarioId)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { error } = asignado
    ? await supabase.from("tareas_tarjeta_miembros").upsert({ tarjeta_id: tarjetaId, usuario_id: usuarioId }, { onConflict: "tarjeta_id,usuario_id" })
    : await supabase.from("tareas_tarjeta_miembros").delete().eq("tarjeta_id", tarjetaId).eq("usuario_id", usuarioId);
  if (error) return { error: fallo(error, "No se pudo asignar") };
  if (asignado) await correosDespues();
  return {};
}

/** Copia una tarjeta eligiendo qué conservar (los ítems de las checklists quedan sin marcar). */
export async function copiarTarjeta(
  id: string,
  nuevoId: string,
  listaId: string,
  posicion: number,
  titulo: string,
  conservar: { checklists: boolean; etiquetas: boolean; miembros: boolean },
): Promise<Resultado> {
  if (!valido(id, nuevoId, listaId) || !Number.isFinite(posicion)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { error } = await supabase.rpc("tareas_copiar_tarjeta", {
    p_tarjeta: id,
    p_nuevo: nuevoId,
    p_lista: listaId,
    p_posicion: posicion,
    p_titulo: titulo.slice(0, 500),
    p_checklists: conservar.checklists,
    p_etiquetas: conservar.etiquetas,
    p_miembros: conservar.miembros,
  });
  return error ? { error: fallo(error, "No se pudo copiar la tarjeta") } : {};
}

// ─── Notificaciones ─────────────────────────────────────────────────────

export async function marcarNotificaciones(ids: string[] | "todas"): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  let consulta = supabase.from("notificaciones").update({ leida: true }).eq("leida", false);
  if (ids !== "todas") {
    if (!ids.every((i) => valido(i))) return { error: "Datos inválidos" };
    consulta = consulta.in("id", ids);
  }
  const { error } = await consulta;
  return error ? { error: "No se pudieron marcar" } : {};
}

const esquemaPreferencias = z.object({
  asignaciones: z.boolean(),
  menciones: z.boolean(),
  comentarios: z.boolean(),
  cambios: z.boolean(),
  vencimientos: z.boolean(),
  correo: z.boolean(),
});

export async function guardarPreferencias(p: z.input<typeof esquemaPreferencias>): Promise<Resultado> {
  const v = esquemaPreferencias.safeParse(p);
  if (!v.success) return { error: "Datos inválidos" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("preferencias_notificaciones").upsert(v.data, { onConflict: "usuario_id" });
  return error ? { error: "No se pudieron guardar las preferencias" } : {};
}

