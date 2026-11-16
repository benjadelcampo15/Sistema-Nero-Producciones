"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { after } from "next/server";
import { enviarCorreosPendientes } from "@/lib/notificaciones/correo";
import { urlBase } from "@/lib/url";
import { COLORES_PORTADA, FONDOS, LISTAS_INICIALES } from "./tipos";

/**
 * Acciones de Tareas. Los permisos los valida la base (RLS y funciones):
 * acá solo se valida la forma de los datos y se traducen los errores.
 */
type Resultado = { error?: string };

const uuid = z.uuid();
const nombre = (max: number) => z.string().trim().min(1, "Escribí un nombre").max(max);
const SIN_PERMISO = "No tenés permiso para hacer esto en este tablero";

async function db() {
  await exigirPermiso("tareas", "ver");
  return crearClienteServidor();
}
const fallo = (e: { message: string } | null, defecto: string) =>
  e?.message && !/violates|syntax|function|relation|column/i.test(e.message) ? e.message : /row-level|permission/i.test(e?.message ?? "") ? SIN_PERMISO : defecto;
/** Un update/delete que no tocó filas: no existe o no tiene permiso. */
const sinFilas = (data: unknown[] | null) => (!data?.length ? { error: SIN_PERMISO } : {});

// ─── Espacios ────────────────────────────────────────────────────────────

export async function crearEspacio(nombreEspacio: string, descripcion = ""): Promise<Resultado & { id?: string }> {
  const n = nombre(80).safeParse(nombreEspacio);
  if (!n.success) return { error: n.error.issues[0].message };
  const supabase = await db();
  const { data, error } = await supabase.rpc("tareas_crear_espacio", { p_nombre: n.data, p_descripcion: descripcion.slice(0, 500) });
  if (error) return { error: fallo(error, "No se pudo crear el espacio") };
  refresh();
  return { id: data as string };
}

export async function editarEspacio(id: string, nombreEspacio: string): Promise<Resultado> {
  const n = nombre(80).safeParse(nombreEspacio);
  if (!n.success || !uuid.safeParse(id).success) return { error: "Nombre inválido" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_espacios").update({ nombre: n.data }).eq("id", id).select("id");
  if (error) return { error: fallo(error, "No se pudo guardar") };
  refresh();
  return sinFilas(data);
}

/** Agrega, cambia el rol o (rol null) quita a un integrante del espacio. */
export async function miembroEspacio(espacioId: string, usuarioId: string, rol: "admin" | "miembro" | null): Promise<Resultado> {
  if (!uuid.safeParse(espacioId).success || !uuid.safeParse(usuarioId).success) return { error: "Datos inválidos" };
  const supabase = await db();
  if (rol === null) {
    const { data: admins } = await supabase.from("tareas_espacio_miembros").select("usuario_id").eq("espacio_id", espacioId).eq("rol", "admin");
    if (admins?.length === 1 && admins[0].usuario_id === usuarioId) return { error: "El espacio tiene que tener al menos un administrador" };
    const { data, error } = await supabase.from("tareas_espacio_miembros").delete().eq("espacio_id", espacioId).eq("usuario_id", usuarioId).select("usuario_id");
    if (error) return { error: fallo(error, "No se pudo quitar") };
    refresh();
    return sinFilas(data);
  }
  const { error } = await supabase.from("tareas_espacio_miembros").upsert({ espacio_id: espacioId, usuario_id: usuarioId, rol }, { onConflict: "espacio_id,usuario_id" });
  if (error) return { error: fallo(error, "No se pudo guardar") };
  refresh();
  return {};
}

// ─── Tableros ────────────────────────────────────────────────────────────

const esquemaTablero = z.object({
  espacio_id: uuid,
  nombre: nombre(120),
  fondo: z.string().refine((f) => Object.hasOwn(FONDOS, f.replace(/^c:/, "")), "Fondo inválido"),
  visibilidad: z.enum(["privado", "espacio"]),
  descripcion: z.string().max(4000).default(""),
  miembros: z.array(uuid).max(100).default([]),
});

export async function crearTablero(datos: z.input<typeof esquemaTablero>): Promise<Resultado & { id?: string }> {
  const v = esquemaTablero.safeParse(datos);
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await db();
  const { data, error } = await supabase.rpc("tareas_crear_tablero", {
    p_espacio: v.data.espacio_id,
    p_nombre: v.data.nombre,
    p_fondo: v.data.fondo,
    p_visibilidad: v.data.visibilidad,
    p_descripcion: v.data.descripcion,
    p_listas: LISTAS_INICIALES,
    p_miembros: v.data.miembros,
  });
  if (error) return { error: fallo(error, "No se pudo crear el tablero") };
  return { id: data as string };
}

const esquemaCambiosTablero = z
  .object({
    nombre: nombre(120),
    descripcion: z.string().max(4000).nullable(),
    fondo: z.string().refine((f) => Object.hasOwn(FONDOS, f.replace(/^c:/, "")), "Fondo inválido"),
    visibilidad: z.enum(["privado", "espacio"]),
    archivado: z.boolean(),
    espacio_id: uuid,
  })
  .partial();

export async function editarTablero(id: string, cambios: z.input<typeof esquemaCambiosTablero>): Promise<Resultado> {
  const v = esquemaCambiosTablero.safeParse(cambios);
  if (!v.success || !uuid.safeParse(id).success) return { error: v.error?.issues[0].message ?? "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_tableros").update(v.data).eq("id", id).select("id");
  if (error) return { error: fallo(error, "No se pudo guardar") };
  refresh();
  return sinFilas(data);
}

const IMAGENES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Fondo con imagen propia (JPG, PNG o WEBP, hasta 8 MB). */
export async function subirFondoTablero(id: string, formulario: FormData): Promise<Resultado> {
  const archivo = formulario.get("imagen");
  if (!uuid.safeParse(id).success || !(archivo instanceof File) || !archivo.size) return { error: "Elegí una imagen" };
  const ext = IMAGENES[archivo.type];
  if (!ext) return { error: "La imagen tiene que ser JPG, PNG o WEBP" };
  if (archivo.size > 8 * 1024 * 1024) return { error: "La imagen pesa más de 8 MB" };
  const supabase = await db();
  const { data: rol } = await supabase.rpc("tareas_rol", { p_tablero: id });
  if (rol !== "admin") return { error: "Solo los administradores del tablero cambian el fondo" };
  const ruta = `fondos/${id}/${crypto.randomUUID()}.${ext}`;
  const admin = crearClienteAdmin();
  const { error: errorArchivo } = await admin.storage.from("tareas").upload(ruta, archivo, { contentType: archivo.type });
  if (errorArchivo) return { error: "No se pudo subir la imagen" };
  const { data: anterior } = await supabase.from("tareas_tableros").select("fondo").eq("id", id).maybeSingle();
  const { error } = await supabase.from("tareas_tableros").update({ fondo: `img:${ruta}` }).eq("id", id);
  if (error) {
    await admin.storage.from("tareas").remove([ruta]);
    return { error: fallo(error, "No se pudo guardar el fondo") };
  }
  if (anterior?.fondo?.startsWith("img:")) await admin.storage.from("tareas").remove([anterior.fondo.slice(4)]);
  refresh();
  return {};
}

export async function duplicarTablero(id: string, nombreNuevo: string, conTarjetas: boolean): Promise<Resultado & { id?: string }> {
  const n = nombre(120).safeParse(nombreNuevo);
  if (!n.success || !uuid.safeParse(id).success) return { error: "Escribí un nombre" };
  const supabase = await db();
  const { data, error } = await supabase.rpc("tareas_duplicar_tablero", { p_tablero: id, p_nombre: n.data, p_con_tarjetas: conTarjetas });
  if (error) return { error: fallo(error, "No se pudo duplicar") };
  return { id: data as string };
}

export async function eliminarTablero(id: string): Promise<Resultado> {
  if (!uuid.safeParse(id).success) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data: t } = await supabase.from("tareas_tableros").select("fondo").eq("id", id).maybeSingle();
  const { data, error } = await supabase.from("tareas_tableros").delete().eq("id", id).select("id");
  if (error) return { error: fallo(error, "No se pudo eliminar") };
  if (!data?.length) return { error: "Solo los administradores del tablero lo eliminan" };
  const admin = crearClienteAdmin();
  const { data: archivos } = await admin.storage.from("tareas").list(`fondos/${id}`);
  const rutas = (archivos ?? []).map((a) => `fondos/${id}/${a.name}`);
  if (t?.fondo?.startsWith("img:")) rutas.push(t.fondo.slice(4));
  if (rutas.length) await admin.storage.from("tareas").remove([...new Set(rutas)]);
  return {};
}

export async function marcarFavorito(id: string, favorito: boolean): Promise<Resultado> {
  if (!uuid.safeParse(id).success) return { error: "Datos inválidos" };
  const supabase = await db();
  const { error } = favorito
    ? await supabase.from("tareas_favoritos").upsert({ tablero_id: id }, { onConflict: "usuario_id,tablero_id" })
    : await supabase.from("tareas_favoritos").delete().eq("tablero_id", id);
  if (error) return { error: fallo(error, "No se pudo guardar") };
  refresh();
  return {};
}

/** Agrega, cambia el rol o (rol null) quita a un integrante del tablero. */
export async function miembroTablero(tableroId: string, usuarioId: string, rol: "admin" | "miembro" | "observador" | null): Promise<Resultado> {
  if (!uuid.safeParse(tableroId).success || !uuid.safeParse(usuarioId).success) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data: admins } = await supabase.from("tareas_tablero_miembros").select("usuario_id").eq("tablero_id", tableroId).eq("rol", "admin");
  if (rol !== "admin" && admins?.length === 1 && admins[0].usuario_id === usuarioId) return { error: "El tablero tiene que tener al menos un administrador" };
  if (rol === null) {
    const { data, error } = await supabase.from("tareas_tablero_miembros").delete().eq("tablero_id", tableroId).eq("usuario_id", usuarioId).select("usuario_id");
    if (error) return { error: fallo(error, "No se pudo quitar") };
    refresh();
    return sinFilas(data);
  }
  const { error } = await supabase.from("tareas_tablero_miembros").upsert({ tablero_id: tableroId, usuario_id: usuarioId, rol }, { onConflict: "tablero_id,usuario_id" });
  if (error) return { error: fallo(error, "Solo los administradores del tablero administran integrantes") };
  refresh();
  return {};
}

// ─── Listas ──────────────────────────────────────────────────────────────

export async function crearLista(tableroId: string, id: string, nombreLista: string, posicion: number): Promise<Resultado> {
  const n = nombre(120).safeParse(nombreLista);
  if (!n.success || !uuid.safeParse(tableroId).success || !uuid.safeParse(id).success || !Number.isFinite(posicion)) return { error: "Escribí un nombre" };
  const supabase = await db();
  const { error } = await supabase.from("tareas_listas").insert({ id, tablero_id: tableroId, nombre: n.data, posicion });
  if (error) return { error: fallo(error, "No se pudo crear la lista") };
  return {};
}

const esquemaCambiosLista = z.object({ nombre: nombre(120), posicion: z.number().finite(), archivada: z.boolean() }).partial();

export async function editarLista(id: string, cambios: z.input<typeof esquemaCambiosLista>): Promise<Resultado> {
  const v = esquemaCambiosLista.safeParse(cambios);
  if (!v.success || !uuid.safeParse(id).success) return { error: v.error?.issues[0].message ?? "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_listas").update(v.data).eq("id", id).select("id");
  if (error) return { error: fallo(error, "No se pudo guardar la lista") };
  return sinFilas(data);
}

export async function duplicarLista(id: string, nombreNuevo: string, posicion: number): Promise<Resultado> {
  const n = nombre(120).safeParse(nombreNuevo);
  if (!n.success || !uuid.safeParse(id).success || !Number.isFinite(posicion)) return { error: "Escribí un nombre" };
  const supabase = await db();
  const { error } = await supabase.rpc("tareas_duplicar_lista", { p_lista: id, p_nombre: n.data, p_posicion: posicion });
  if (error) return { error: fallo(error, "No se pudo duplicar la lista") };
  refresh();
  return {};
}

// ─── Tarjetas ────────────────────────────────────────────────────────────

export async function crearTarjeta(listaId: string, id: string, titulo: string, posicion: number): Promise<Resultado> {
  const t = z.string().trim().min(1, "Escribí un título").max(500).safeParse(titulo);
  if (!t.success || !uuid.safeParse(listaId).success || !uuid.safeParse(id).success || !Number.isFinite(posicion)) return { error: "Escribí un título" };
  const supabase = await db();
  // tablero_id lo completa la base desde la lista.
  const { error } = await supabase.from("tareas_tarjetas").insert({ id, lista_id: listaId, tablero_id: listaId, titulo: t.data, posicion });
  if (error) return { error: fallo(error, "No se pudo crear la tarjeta") };
  return {};
}

const esquemaCambiosTarjeta = z
  .object({
    titulo: z.string().trim().min(1, "El título no puede quedar vacío").max(500),
    descripcion: z.string().max(20000).nullable(),
    vence: z.iso.datetime({ offset: true }).nullable(),
    inicio: z.iso.date().nullable(),
    recordatorio: z.number().int().min(0).max(20160).nullable(),
    portada: z
      .string()
      .refine((p) => (p.startsWith("c:") && COLORES_PORTADA.includes(p.slice(2))) || (p.startsWith("a:") && uuid.safeParse(p.slice(2)).success), "Portada inválida")
      .nullable(),
    completada: z.boolean(),
    archivada: z.boolean(),
  })
  .partial()
  .refine((c) => !c.inicio || !c.vence || c.inicio <= c.vence.slice(0, 10), "La fecha de inicio no puede ser posterior al vencimiento");

/**
 * Edita una tarjeta. Con `version`, solo guarda si nadie la cambió desde que se
 * abrió (si no, avisa del conflicto en vez de pisar los cambios de otro).
 */
export async function editarTarjeta(id: string, cambios: z.input<typeof esquemaCambiosTarjeta>, version?: number): Promise<Resultado & { version?: number; conflicto?: boolean }> {
  const v = esquemaCambiosTarjeta.safeParse(cambios);
  if (!v.success || !uuid.safeParse(id).success) return { error: v.error?.issues[0].message ?? "Datos inválidos" };
  const supabase = await db();
  let consulta = supabase.from("tareas_tarjetas").update(v.data).eq("id", id);
  if (version !== undefined) consulta = consulta.eq("version", version);
  const { data, error } = await consulta.select("version");
  if (error) return { error: fallo(error, "No se pudo guardar la tarjeta") };
  if (!data?.length) {
    if (version === undefined) return { error: SIN_PERMISO };
    const { data: actual } = await supabase.from("tareas_tarjetas").select("id").eq("id", id).maybeSingle();
    return actual ? { conflicto: true, error: "Otra persona cambió esta tarjeta recién. Actualizá para ver sus cambios antes de guardar." } : { error: "La tarjeta ya no existe" };
  }
  // Los avisos que generó el cambio (fechas, completada, etc.) salen por correo después de responder.
  const base = await urlBase().catch(() => undefined);
  after(() => enviarCorreosPendientes(40, base).catch(() => undefined));
  return { version: data[0].version };
}

export async function moverTarjeta(id: string, listaId: string, posicion: number): Promise<Resultado> {
  if (!uuid.safeParse(id).success || !uuid.safeParse(listaId).success || !Number.isFinite(posicion)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_tarjetas").update({ lista_id: listaId, posicion }).eq("id", id).select("id");
  if (error) return { error: fallo(error, "No se pudo mover la tarjeta") };
  return sinFilas(data);
}

/** Copia una tarjeta (con sus responsables) debajo de la original, o en otra lista. */
export async function duplicarTarjeta(id: string, nuevoId: string, posicion: number, listaId?: string, titulo?: string): Promise<Resultado> {
  if (!uuid.safeParse(id).success || !uuid.safeParse(nuevoId).success || !Number.isFinite(posicion)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data: c } = await supabase.from("tareas_tarjetas").select("lista_id, titulo, descripcion, vence").eq("id", id).maybeSingle();
  if (!c) return { error: "La tarjeta ya no existe" };
  const destino = listaId && uuid.safeParse(listaId).success ? listaId : c.lista_id;
  const { error } = await supabase
    .from("tareas_tarjetas")
    .insert({ id: nuevoId, lista_id: destino, tablero_id: destino, titulo: titulo?.trim().slice(0, 500) || c.titulo, descripcion: c.descripcion, vence: c.vence, posicion });
  if (error) return { error: fallo(error, "No se pudo duplicar la tarjeta") };
  const { data: miembros } = await supabase.from("tareas_tarjeta_miembros").select("usuario_id").eq("tarjeta_id", id);
  if (miembros?.length) await supabase.from("tareas_tarjeta_miembros").insert(miembros.map((m) => ({ tarjeta_id: nuevoId, usuario_id: m.usuario_id })));
  return {};
}

export async function asignarTarjeta(tarjetaId: string, usuarioId: string, asignado: boolean): Promise<Resultado> {
  if (!uuid.safeParse(tarjetaId).success || !uuid.safeParse(usuarioId).success) return { error: "Datos inválidos" };
  const supabase = await db();
  const { error } = asignado
    ? await supabase.from("tareas_tarjeta_miembros").upsert({ tarjeta_id: tarjetaId, usuario_id: usuarioId }, { onConflict: "tarjeta_id,usuario_id" })
    : await supabase.from("tareas_tarjeta_miembros").delete().eq("tarjeta_id", tarjetaId).eq("usuario_id", usuarioId);
  if (error) return { error: fallo(error, "No se pudo asignar") };
  return {};
}

export async function eliminarTarjeta(id: string): Promise<Resultado> {
  if (!uuid.safeParse(id).success) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_tarjetas").delete().eq("id", id).select("id");
  if (error) return { error: fallo(error, "No se pudo eliminar") };
  return sinFilas(data);
}
