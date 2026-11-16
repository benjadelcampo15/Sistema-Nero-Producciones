"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import type { Boton, Ejecucion, Recurrente, Regla } from "./automatizaciones";

/**
 * Tareas (orden 3): automatizaciones, botones, recurrentes, plantillas,
 * importación desde Trello y búsquedas. Los permisos los valida la base.
 */
type Resultado = { error?: string };

const uuid = z.uuid();
const valido = (...ids: (string | null | undefined)[]) => ids.every((i) => !!i && uuid.safeParse(i).success);
const SIN_PERMISO = "No tenés permiso para hacer esto en este tablero";
async function db() {
  await exigirPermiso("tareas", "ver");
  return crearClienteServidor();
}
const fallo = (e: { message: string } | null, defecto: string) =>
  /row-level|permission/i.test(e?.message ?? "") ? SIN_PERMISO : e?.message && !/violates|syntax|function|relation|column/i.test(e.message) ? e.message : defecto;

// ─── Automatizaciones ───────────────────────────────────────────────────

const esquemaDisparador = z.object({
  tipo: z.enum(["movida_a", "creada_en", "etiqueta_agregada", "miembro_agregado", "checklist_completa", "completada", "vence_en", "vencida"]),
  dato: uuid.nullable().optional(),
  dias: z.number().int().min(0).max(60).optional(),
});
const esquemaAccion = z.object({
  tipo: z.enum(["completar", "descompletar", "mover", "agregar_miembro", "quitar_miembro", "agregar_etiqueta", "quitar_etiqueta", "notificar", "vencimiento", "quitar_vencimiento", "archivar"]),
  lista_id: uuid.optional(),
  arriba: z.boolean().optional(),
  usuario_id: z.union([uuid, z.literal("miembros")]).optional(),
  etiqueta_id: uuid.optional(),
  mensaje: z.string().max(200).optional(),
  dias: z.number().int().min(0).max(365).optional(),
});
const esquemaAccionTablero = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("crear_tarjeta"), lista_id: uuid, titulo: z.string().trim().min(1).max(500), miembros: z.array(uuid).max(20).optional() }),
  z.object({ tipo: z.literal("mover_lista"), desde: uuid, hacia: uuid }),
  z.object({ tipo: z.literal("archivar_completadas"), lista_id: uuid.optional() }),
]);
const esquemaRegla = z.object({
  nombre: z.string().trim().min(1, "Poné un nombre").max(200),
  disparador: esquemaDisparador,
  acciones: z.array(esquemaAccion).min(1, "Agregá al menos una acción").max(10),
});

/** Reglas, botones, recurrentes y las últimas ejecuciones de un tablero. */
export async function automatizacionesTablero(tableroId: string) {
  if (!valido(tableroId)) return null;
  const supabase = await db();
  const [{ data: reglas }, { data: botones }, { data: recurrentes }, { data: log }] = await Promise.all([
    supabase.from("tareas_reglas").select("id, nombre, activa, disparador, acciones, ejecuciones, ultima_ejecucion, ultimo_error").eq("tablero_id", tableroId).order("creado_en"),
    supabase.from("tareas_botones").select("id, nombre, ambito, acciones").eq("tablero_id", tableroId).order("creado_en"),
    supabase.from("tareas_recurrentes").select("id, lista_id, titulo, descripcion, miembros, etiquetas, checklists, frecuencia, dias, fechas, hora, activa, proxima").eq("tablero_id", tableroId).order("creado_en"),
    supabase.from("tareas_reglas_log").select("id, regla_id, boton_id, tarjeta_id, ok, detalle, creado_en").eq("tablero_id", tableroId).order("creado_en", { ascending: false }).limit(60),
  ]);
  return {
    reglas: (reglas ?? []) as Regla[],
    botones: (botones ?? []) as Boton[],
    recurrentes: (recurrentes ?? []) as Recurrente[],
    log: (log ?? []) as Ejecucion[],
  };
}

export async function guardarRegla(tableroId: string, id: string | null, datos: z.input<typeof esquemaRegla>): Promise<Resultado> {
  const v = esquemaRegla.safeParse(datos);
  if (!v.success) return { error: v.error.issues[0].message };
  if (!valido(tableroId) || (id && !valido(id))) return { error: "Datos inválidos" };
  const d = v.data.disparador;
  if (["movida_a", "creada_en", "etiqueta_agregada"].includes(d.tipo) && !d.dato) return { error: "Completá el disparador (lista o etiqueta)" };
  for (const a of v.data.acciones) {
    if (a.tipo === "mover" && !a.lista_id) return { error: "Elegí la lista a la que mover" };
    if (["agregar_miembro", "quitar_miembro", "notificar"].includes(a.tipo) && !a.usuario_id) return { error: "Elegí a quién" };
    if (["agregar_etiqueta", "quitar_etiqueta"].includes(a.tipo) && !a.etiqueta_id) return { error: "Elegí la etiqueta" };
    // Evita la regla que se dispara a sí misma (mover a la misma lista que la dispara).
    if (d.tipo === "movida_a" && a.tipo === "mover" && a.lista_id === d.dato) return { error: "La regla movería la tarjeta a la misma lista que la dispara" };
  }
  const supabase = await db();
  const fila = { tablero_id: tableroId, nombre: v.data.nombre, disparador: v.data.disparador, acciones: v.data.acciones };
  const { error } = id ? await supabase.from("tareas_reglas").update({ ...fila, ultimo_error: null }).eq("id", id) : await supabase.from("tareas_reglas").insert(fila);
  return error ? { error: fallo(error, "No se pudo guardar la regla") } : {};
}

export async function activarRegla(id: string, activa: boolean): Promise<Resultado> {
  if (!valido(id)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_reglas").update({ activa }).eq("id", id).select("id");
  return error ? { error: fallo(error, "No se pudo guardar") } : data?.length ? {} : { error: SIN_PERMISO };
}

export async function borrarRegla(id: string): Promise<Resultado> {
  if (!valido(id)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_reglas").delete().eq("id", id).select("id");
  return error ? { error: fallo(error, "No se pudo borrar") } : data?.length ? {} : { error: SIN_PERMISO };
}

const esquemaBoton = z.discriminatedUnion("ambito", [
  z.object({ ambito: z.literal("tarjeta"), nombre: z.string().trim().min(1, "Poné un nombre").max(80), acciones: z.array(esquemaAccion).min(1, "Agregá al menos una acción").max(10) }),
  z.object({ ambito: z.literal("tablero"), nombre: z.string().trim().min(1, "Poné un nombre").max(80), acciones: z.array(esquemaAccionTablero).min(1, "Agregá al menos una acción").max(20) }),
]);

export async function guardarBoton(tableroId: string, id: string | null, datos: z.input<typeof esquemaBoton>): Promise<Resultado> {
  const v = esquemaBoton.safeParse(datos);
  if (!v.success) return { error: v.error.issues[0].message };
  if (!valido(tableroId) || (id && !valido(id))) return { error: "Datos inválidos" };
  const supabase = await db();
  const fila: { tablero_id: string; nombre: string; ambito: string; acciones: unknown[] } = { tablero_id: tableroId, ...v.data };
  const { error } = id ? await supabase.from("tareas_botones").update(fila).eq("id", id) : await supabase.from("tareas_botones").insert(fila);
  return error ? { error: fallo(error, "No se pudo guardar el botón") } : {};
}

export async function borrarBoton(id: string): Promise<Resultado> {
  if (!valido(id)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_botones").delete().eq("id", id).select("id");
  return error ? { error: fallo(error, "No se pudo borrar") } : data?.length ? {} : { error: SIN_PERMISO };
}

/** Ejecuta un botón. Devuelve un aviso si alguna acción no se pudo hacer. */
export async function usarBoton(id: string, tarjetaId?: string): Promise<Resultado & { aviso?: string }> {
  if (!valido(id) || (tarjetaId && !valido(tarjetaId))) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.rpc("tareas_ejecutar_boton", { p_boton: id, p_tarjeta: tarjetaId ?? null });
  if (error) return { error: fallo(error, "No se pudo ejecutar el botón") };
  refresh();
  return data ? { aviso: data as string } : {};
}

// ─── Recurrentes ────────────────────────────────────────────────────────

const esquemaRecurrente = z
  .object({
    lista_id: uuid,
    titulo: z.string().trim().min(1, "Poné un título").max(500),
    descripcion: z.string().max(20000).nullable().default(null),
    miembros: z.array(uuid).max(20).default([]),
    etiquetas: z.array(uuid).max(20).default([]),
    checklists: z.array(z.object({ nombre: z.string().trim().min(1).max(200), items: z.array(z.string().trim().min(1).max(1000)).max(100) })).max(10).default([]),
    frecuencia: z.enum(["diaria", "semanal", "mensual", "fechas"]),
    dias: z.array(z.number().int().min(0).max(31)).max(7).default([]),
    fechas: z.array(z.iso.date()).max(100).default([]),
    hora: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
    desde: z.iso.date(),
  })
  .refine((r) => r.frecuencia !== "semanal" || r.dias.length > 0, "Elegí al menos un día de la semana")
  .refine((r) => r.frecuencia !== "mensual" || (r.dias[0] >= 1 && r.dias[0] <= 31), "Elegí el día del mes")
  .refine((r) => r.frecuencia !== "fechas" || r.fechas.length > 0, "Agregá al menos una fecha");

/** La primera fecha (desde "desde", inclusive) que corresponde a la frecuencia. */
function primeraFecha(r: { frecuencia: string; dias: number[]; fechas: string[] }, desde: string): string | null {
  const d = new Date(`${desde}T12:00:00Z`);
  if (r.frecuencia === "fechas") return [...r.fechas].sort().find((f) => f >= desde) ?? null;
  for (let i = 0; i < 400; i++) {
    const f = new Date(d.getTime() + i * 86400000);
    const iso = f.toISOString().slice(0, 10);
    if (r.frecuencia === "diaria") return iso;
    if (r.frecuencia === "semanal" && r.dias.includes(f.getUTCDay())) return iso;
    if (r.frecuencia === "mensual") {
      const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
      if (f.getUTCDate() === Math.min(r.dias[0], ultimo)) return iso;
    }
  }
  return null;
}

export async function guardarRecurrente(tableroId: string, id: string | null, datos: z.input<typeof esquemaRecurrente>): Promise<Resultado> {
  const v = esquemaRecurrente.safeParse(datos);
  if (!v.success) return { error: v.error.issues[0].message };
  if (!valido(tableroId) || (id && !valido(id))) return { error: "Datos inválidos" };
  const { desde, ...resto } = v.data;
  const proxima = primeraFecha(resto, desde);
  if (!proxima) return { error: "No hay fechas futuras para esa frecuencia" };
  const supabase = await db();
  const fila = { tablero_id: tableroId, ...resto, proxima, activa: true };
  const { error } = id ? await supabase.from("tareas_recurrentes").update(fila).eq("id", id) : await supabase.from("tareas_recurrentes").insert(fila);
  if (error) return { error: fallo(error, "No se pudo guardar") };
  // Si la primera fecha es hoy, se crea ya.
  await supabase.rpc("tareas_procesar_programadas");
  refresh();
  return {};
}

export async function activarRecurrente(id: string, activa: boolean): Promise<Resultado> {
  if (!valido(id)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_recurrentes").update({ activa }).eq("id", id).select("id");
  return error ? { error: fallo(error, "No se pudo guardar") } : data?.length ? {} : { error: SIN_PERMISO };
}

export async function borrarRecurrente(id: string): Promise<Resultado> {
  if (!valido(id)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_recurrentes").delete().eq("id", id).select("id");
  return error ? { error: fallo(error, "No se pudo borrar") } : data?.length ? {} : { error: SIN_PERMISO };
}

// ─── Plantillas ─────────────────────────────────────────────────────────

export async function marcarPlantillaTarjeta(id: string, plantilla: boolean): Promise<Resultado> {
  if (!valido(id)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_tarjetas").update({ es_plantilla: plantilla }).eq("id", id).select("id");
  return error ? { error: fallo(error, "No se pudo guardar") } : data?.length ? {} : { error: SIN_PERMISO };
}

/** Tarjeta nueva desde una plantilla: sin fechas ni completados (es una tarea nueva). */
export async function tarjetaDesdePlantilla(plantillaId: string, nuevoId: string, listaId: string, posicion: number, titulo: string): Promise<Resultado> {
  if (!valido(plantillaId, nuevoId, listaId) || !Number.isFinite(posicion)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { error } = await supabase.rpc("tareas_copiar_tarjeta", {
    p_tarjeta: plantillaId,
    p_nuevo: nuevoId,
    p_lista: listaId,
    p_posicion: posicion,
    p_titulo: titulo.slice(0, 500),
    p_checklists: true,
    p_etiquetas: true,
    p_miembros: true,
    p_fechas: false,
  });
  return error ? { error: fallo(error, "No se pudo crear la tarjeta") } : {};
}

export async function marcarPlantillaTablero(id: string, plantilla: boolean): Promise<Resultado> {
  if (!valido(id)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.from("tareas_tableros").update({ es_plantilla: plantilla }).eq("id", id).select("id");
  if (error) return { error: fallo(error, "No se pudo guardar") };
  refresh();
  return data?.length ? {} : { error: "Solo los administradores del tablero lo cambian" };
}

/** Tablero nuevo a partir de una plantilla o copiando otro (estructura, sin fechas ni historial). */
export async function tableroDesde(origenId: string, espacioId: string, nombre: string, conTarjetas: boolean): Promise<Resultado & { id?: string }> {
  const n = z.string().trim().min(1, "Escribí un nombre").max(120).safeParse(nombre);
  if (!n.success || !valido(origenId, espacioId)) return { error: "Escribí un nombre" };
  const supabase = await db();
  const { data, error } = await supabase.rpc("tareas_tablero_desde", { p_origen: origenId, p_espacio: espacioId, p_nombre: n.data, p_con_tarjetas: conTarjetas });
  return error ? { error: fallo(error, "No se pudo crear el tablero") } : { id: data as string };
}

// ─── Importación desde Trello ───────────────────────────────────────────

/** Importaciones anteriores del mismo tablero de Trello (para avisar duplicados). */
export async function importacionesPrevias(trelloId: string, nombre: string) {
  const supabase = await db();
  const [{ data: porId }, { data: porNombre }] = await Promise.all([
    trelloId ? supabase.from("tareas_importaciones").select("id, nombre, creado_en, tablero_id").eq("trello_id", trelloId.slice(0, 64)) : Promise.resolve({ data: [] }),
    supabase.from("tareas_tableros").select("id, nombre").ilike("nombre", nombre.replace(/[%_]/g, "").slice(0, 120)),
  ]);
  return { importaciones: porId ?? [], tablerosConNombre: porNombre ?? [] };
}

/** Link firmado para guardar el archivo original de Trello (se sube directo desde el navegador). */
export async function prepararArchivoTrello(nombre: string, tamano: number): Promise<Resultado & { ruta?: string; token?: string }> {
  await exigirPermiso("tareas", "ver");
  if (!(tamano > 0) || tamano > 25 * 1024 * 1024) return { error: "El archivo puede pesar hasta 25 MB" };
  const ruta = `importaciones/${crypto.randomUUID()}-${nombre.replace(/[^\w.-]+/g, "_").slice(-80)}`;
  const { data, error } = await crearClienteAdmin().storage.from("tareas").createSignedUploadUrl(ruta);
  return error || !data ? { error: "No se pudo preparar la subida" } : { ruta, token: data.token };
}

const esquemaImportacion = z.object({
  trello_id: z.string().max(64),
  nombre: z.string().trim().min(1).max(120),
  descripcion: z.string().max(20000),
  fondo: z.string().max(40),
  miembros: z.array(uuid).max(200),
  etiquetas: z.array(z.object({ id: z.string().max(64), nombre: z.string().max(60), color: z.string().max(20) })).max(200),
  listas: z.array(z.object({ id: z.string().max(64), nombre: z.string().max(200), archivada: z.boolean() })).max(500),
  tarjetas: z
    .array(
      z.object({
        lista: z.string().max(64),
        titulo: z.string().max(2000),
        descripcion: z.string().max(20000),
        posicion: z.number().finite(),
        vence: z.string().max(40).nullable(),
        inicio: z.string().max(40).nullable(),
        completada: z.boolean(),
        archivada: z.boolean(),
        creada: z.string().max(40).nullable(),
        miembros: z.array(uuid).max(50),
        etiquetas: z.array(z.string().max(64)).max(50),
        checklists: z.array(z.object({ nombre: z.string().max(200), posicion: z.number().finite(), items: z.array(z.object({ texto: z.string().max(2000), hecho: z.boolean(), posicion: z.number().finite() })).max(500) })).max(50),
        comentarios: z.array(z.object({ autor: z.string().max(40).nullable(), texto: z.string().max(12000), fecha: z.string().max(40) })).max(1000),
        adjuntos: z.array(z.object({ nombre: z.string().max(300), url: z.string().max(2000) })).max(200),
      }),
    )
    .max(5000),
  resumen: z.record(z.string(), z.unknown()),
});

/** Crea el tablero importado en una sola operación (si algo falla, no queda nada a medias). */
export async function importarTrello(espacioId: string, datos: z.input<typeof esquemaImportacion>, archivo: string | null): Promise<Resultado & { id?: string }> {
  const v = esquemaImportacion.safeParse(datos);
  if (!v.success) return { error: `El archivo no tiene el formato esperado (${v.error.issues[0].path.join(".")})` };
  if (!valido(espacioId) || (archivo && !archivo.startsWith("importaciones/"))) return { error: "Datos inválidos" };
  const supabase = await db();
  const { data, error } = await supabase.rpc("tareas_importar_trello", { p_espacio: espacioId, p: v.data, p_archivo: archivo });
  if (error) return { error: fallo(error, `No se pudo importar: ${error.message}`) };
  refresh();
  return { id: data as string };
}

// ─── Búsquedas guardadas ────────────────────────────────────────────────

export async function guardarBusqueda(nombre: string, filtros: Record<string, string>): Promise<Resultado> {
  const n = z.string().trim().min(1, "Poné un nombre").max(80).safeParse(nombre);
  if (!n.success) return { error: "Poné un nombre" };
  const limpios = Object.fromEntries(Object.entries(filtros).filter(([k, v]) => /^[a-z]+$/.test(k) && typeof v === "string" && v.length <= 200 && v));
  const supabase = await db();
  const { error } = await supabase.from("tareas_busquedas").insert({ nombre: n.data, filtros: limpios });
  if (error) return { error: "No se pudo guardar la búsqueda" };
  refresh();
  return {};
}

export async function borrarBusqueda(id: string): Promise<Resultado> {
  if (!valido(id)) return { error: "Datos inválidos" };
  const supabase = await db();
  const { error } = await supabase.from("tareas_busquedas").delete().eq("id", id);
  if (error) return { error: "No se pudo borrar" };
  refresh();
  return {};
}

// ─── Estadísticas ───────────────────────────────────────────────────────

/** Tarjetas completadas y creadas por día (desde el historial), para el panel. Solo lectura. */
export async function evolucionTablero(tableroId: string, desde: string): Promise<{ dia: string; completadas: number; creadas: number }[]> {
  if (!valido(tableroId) || !/^\d{4}-\d{2}-\d{2}$/.test(desde)) return [];
  const supabase = await db();
  const { data } = await supabase
    .from("tareas_actividad")
    .select("tipo, creado_en")
    .eq("tablero_id", tableroId)
    .in("tipo", ["completada", "creada"])
    .gte("creado_en", `${desde}T00:00:00-03:00`)
    .limit(5000);
  const porDia = new Map<string, { completadas: number; creadas: number }>();
  for (const a of data ?? []) {
    const dia = new Date(new Date(a.creado_en).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const x = porDia.get(dia) ?? { completadas: 0, creadas: 0 };
    if (a.tipo === "completada") x.completadas++;
    else x.creadas++;
    porDia.set(dia, x);
  }
  return [...porDia.entries()].map(([dia, x]) => ({ dia, ...x })).sort((a, b) => a.dia.localeCompare(b.dia));
}
