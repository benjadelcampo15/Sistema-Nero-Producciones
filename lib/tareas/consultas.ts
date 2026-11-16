import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import type { UsuarioActual } from "@/lib/auth/sesion";
import type { Boton } from "./automatizaciones";
import type { Espacio, Etiqueta, Lista, MiembroTablero, RolTablero, Tablero, TableroResumen, Tarjeta, Usuario } from "./tipos";

const CAMPOS_TARJETA = "id, lista_id, titulo, descripcion, posicion, vence, inicio, recordatorio, portada, completada, archivada, version, es_plantilla";

/** Links temporales (1 h) para los fondos con imagen. */
export async function urlsFondos(fondos: string[]) {
  const rutas = [...new Set(fondos.filter((f) => f.startsWith("img:")).map((f) => f.slice(4)))];
  if (!rutas.length) return new Map<string, string>();
  const { data } = await crearClienteAdmin().storage.from("tareas").createSignedUrls(rutas, 3600);
  return new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [`img:${d.path}`, d.signedUrl]));
}

/** Links temporales de las imágenes de portada ("a:<id del adjunto>"). */
async function urlsPortadas(portadas: string[]) {
  const ids = [...new Set(portadas.map((p) => p.slice(2)))];
  if (!ids.length) return new Map<string, string>();
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("tareas_adjuntos").select("id, ruta").in("id", ids);
  const conRuta = (data ?? []).filter((a) => a.ruta);
  if (!conRuta.length) return new Map<string, string>();
  const { data: firmadas } = await crearClienteAdmin().storage.from("tareas").createSignedUrls(conRuta.map((a) => a.ruta as string), 3600);
  const porRuta = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
  return new Map(conRuta.map((a): [string, string] => [`a:${a.id}`, porRuta.get(a.ruta) ?? ""]).filter(([, u]) => u));
}

export async function usuariosTareas(): Promise<Usuario[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("tareas_usuarios");
  return (data ?? []) as Usuario[];
}

/** Inicio: espacios de trabajo, tableros a los que tiene acceso, favoritos y recientes. */
export async function inicioTareas(usuario: UsuarioActual) {
  const supabase = await crearClienteServidor();
  const [{ data: espacios }, { data: membresias }, { data: tableros }, { data: favoritos }, { data: recientes }] = await Promise.all([
    supabase.from("tareas_espacios").select("id, nombre, descripcion").order("nombre"),
    supabase.from("tareas_espacio_miembros").select("espacio_id, usuario_id, rol"),
    supabase.from("tareas_tableros").select("id, espacio_id, nombre, fondo, visibilidad, archivado, es_plantilla").order("nombre"),
    supabase.from("tareas_favoritos").select("tablero_id").eq("usuario_id", usuario.id),
    supabase.from("tareas_recientes").select("tablero_id, visto_en").eq("usuario_id", usuario.id).order("visto_en", { ascending: false }).limit(8),
  ]);
  const rolDe = new Map((membresias ?? []).filter((m) => m.usuario_id === usuario.id).map((m) => [m.espacio_id as string, m.rol as "admin" | "miembro"]));
  const fav = new Set((favoritos ?? []).map((f) => f.tablero_id as string));
  const vistos = new Map((recientes ?? []).map((r) => [r.tablero_id as string, r.visto_en as string]));
  const lista: TableroResumen[] = (tableros ?? []).map((t) => ({ ...(t as Omit<TableroResumen, "favorito" | "visto_en">), favorito: fav.has(t.id), visto_en: vistos.get(t.id) ?? null }));
  const urls = await urlsFondos(lista.map((t) => t.fondo));
  return {
    espacios: (espacios ?? []).map((e) => ({ ...e, rol: usuario.esAdmin ? "admin" : (rolDe.get(e.id) ?? null) })) as Espacio[],
    tableros: lista,
    miembrosEspacios: (membresias ?? []) as { espacio_id: string; usuario_id: string; rol: "admin" | "miembro" }[],
    urls: Object.fromEntries(urls) as Record<string, string>,
  };
}

/** Un tablero con todo lo que se ve: listas, tarjetas, integrantes y usuarios para asignar. */
export async function tableroCompleto(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const [{ data: t }, { data: rol }] = await Promise.all([
    supabase.from("tareas_tableros").select("id, espacio_id, nombre, descripcion, fondo, visibilidad, archivado, es_plantilla").eq("id", id).maybeSingle(),
    supabase.rpc("tareas_rol", { p_tablero: id }),
  ]);
  if (!t || !rol) return null;
  // Recurrentes, reglas por fecha y avisos de vencimiento al día (idempotente: no repite nada).
  await supabase.rpc("tareas_procesar_programadas");
  const [{ data: listas }, { data: tarjetas }, { data: asignados }, { data: miembros }, { data: fav }, { data: espacio }, usuarios, urls, { data: etiquetas }, { data: resumen }, { data: botones }] = await Promise.all([
    supabase.from("tareas_listas").select("id, nombre, posicion, archivada").eq("tablero_id", id).order("posicion"),
    supabase.from("tareas_tarjetas").select(CAMPOS_TARJETA).eq("tablero_id", id).order("posicion"),
    supabase.from("tareas_tarjeta_miembros").select("tarjeta_id, usuario_id, tareas_tarjetas!inner(tablero_id)").eq("tareas_tarjetas.tablero_id", id),
    supabase.from("tareas_tablero_miembros").select("usuario_id, rol").eq("tablero_id", id),
    supabase.from("tareas_favoritos").select("tablero_id").eq("tablero_id", id).maybeSingle(),
    supabase.from("tareas_espacios").select("id, nombre").eq("id", t.espacio_id).maybeSingle(),
    usuariosTareas(),
    urlsFondos([t.fondo]),
    supabase.from("tareas_etiquetas").select("id, nombre, color, posicion").eq("tablero_id", id).order("posicion"),
    supabase.rpc("tareas_resumen_tablero", { p_tablero: id }),
    supabase.from("tareas_botones").select("id, nombre, ambito, acciones").eq("tablero_id", id).order("creado_en"),
  ]);
  type FilaResumen = { tarjeta_id: string; items: number; hechos: number; adjuntos: number; comentarios: number; etiquetas: string[]; sigo: boolean };
  const resumenDe = new Map(((resumen ?? []) as FilaResumen[]).map((r) => [r.tarjeta_id, r]));
  const portadas = await urlsPortadas((tarjetas ?? []).map((c) => c.portada).filter((x): x is string => !!x?.startsWith("a:")));
  // Queda en recientes (no frena la carga si falla).
  void supabase.from("tareas_recientes").upsert({ tablero_id: id, visto_en: new Date().toISOString() }, { onConflict: "usuario_id,tablero_id" }).then(() => {});
  const porTarjeta = new Map<string, string[]>();
  for (const a of asignados ?? []) porTarjeta.set(a.tarjeta_id, [...(porTarjeta.get(a.tarjeta_id) ?? []), a.usuario_id]);
  const tablero: Tablero = {
    ...(t as Omit<Tablero, "rol" | "favorito" | "visto_en" | "fondoUrl">),
    rol: rol as RolTablero,
    favorito: !!fav,
    visto_en: null,
    fondoUrl: urls.get(t.fondo) ?? null,
  };
  return {
    tablero,
    espacio: espacio as { id: string; nombre: string } | null,
    listas: (listas ?? []) as Lista[],
    tarjetas: (tarjetas ?? []).map((c) => {
      const r = resumenDe.get(c.id);
      return {
        ...c,
        miembros: porTarjeta.get(c.id) ?? [],
        etiquetas: r?.etiquetas ?? [],
        resumen: { items: r?.items ?? 0, hechos: r?.hechos ?? 0, adjuntos: r?.adjuntos ?? 0, comentarios: r?.comentarios ?? 0, sigo: r?.sigo ?? false },
        portadaUrl: c.portada ? (portadas.get(c.portada) ?? null) : null,
      };
    }) as Tarjeta[],
    etiquetas: (etiquetas ?? []) as Etiqueta[],
    botones: (botones ?? []) as Boton[],
    miembros: (miembros ?? []) as MiembroTablero[],
    usuarios,
  };
}
export type DatosTablero = NonNullable<Awaited<ReturnType<typeof tableroCompleto>>>;

/** Mis tareas: las tarjetas asignadas al usuario en todos sus tableros (sin archivadas). */
export async function misTareas(usuario: UsuarioActual) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("tareas_tarjeta_miembros")
    .select(`tareas_tarjetas!inner(${CAMPOS_TARJETA}, tablero_id, tareas_listas!inner(nombre, archivada), tareas_tableros!inner(nombre, fondo, archivado))`)
    .eq("usuario_id", usuario.id);
  type Fila = Tarjeta & { tablero_id: string; tareas_listas: { nombre: string; archivada: boolean }; tareas_tableros: { nombre: string; fondo: string; archivado: boolean } };
  return ((data ?? []).map((d) => d.tareas_tarjetas) as unknown as Fila[])
    .filter((c) => !c.archivada && !c.tareas_listas.archivada && !c.tareas_tableros.archivado)
    .map((c) => ({
      id: c.id,
      titulo: c.titulo,
      vence: c.vence,
      completada: c.completada,
      tablero_id: c.tablero_id,
      tablero: c.tareas_tableros.nombre,
      fondo: c.tareas_tableros.fondo,
      lista: c.tareas_listas.nombre,
    }))
    .sort((a, b) => Number(a.completada) - Number(b.completada) || (a.vence ?? "9999").localeCompare(b.vence ?? "9999"));
}

export type FiltrosBusqueda = { q?: string; tablero?: string; lista?: string; responsable?: string; etiqueta?: string; desde?: string; hasta?: string; estado?: string };
export type FilaBusqueda = {
  id: string;
  titulo: string;
  descripcion: string | null;
  tablero_id: string;
  tablero: string;
  lista_id: string;
  lista: string;
  vence: string | null;
  completada: boolean;
  miembros: string[];
  etiquetas: { nombre: string; color: string }[];
  version: number;
};

/** Búsqueda de tarjetas en todos los tableros del usuario (vista Tabla). Los permisos los aplica la base. */
export async function buscarTarjetas(f: FiltrosBusqueda) {
  const supabase = await crearClienteServidor();
  let consulta = supabase
    .from("tareas_tarjetas")
    .select(
      "id, titulo, descripcion, tablero_id, lista_id, vence, completada, version, tareas_tableros!inner(nombre, archivado), tareas_listas!inner(nombre, archivada), tareas_tarjeta_miembros(usuario_id), tareas_tarjeta_etiquetas(tareas_etiquetas(nombre, color))",
    )
    .eq("archivada", false)
    .eq("tareas_tableros.archivado", false)
    .eq("tareas_listas.archivada", false)
    .order("vence", { ascending: true, nullsFirst: false })
    .limit(500);
  const texto = f.q?.trim().replace(/[%_,()]/g, " ");
  if (texto) consulta = consulta.or(`titulo.ilike.%${texto}%,descripcion.ilike.%${texto}%`);
  if (f.tablero && /^[0-9a-f-]{36}$/i.test(f.tablero)) consulta = consulta.eq("tablero_id", f.tablero);
  if (f.lista?.trim()) consulta = consulta.ilike("tareas_listas.nombre", `%${f.lista.trim().replace(/[%_]/g, "")}%`);
  if (f.desde) consulta = consulta.gte("vence", `${f.desde}T00:00:00-03:00`);
  if (f.hasta) consulta = consulta.lte("vence", `${f.hasta}T23:59:59-03:00`);
  if (f.estado === "completadas") consulta = consulta.eq("completada", true);
  if (f.estado === "pendientes") consulta = consulta.eq("completada", false);
  if (f.estado === "vencidas") consulta = consulta.eq("completada", false).lt("vence", new Date().toISOString());
  if (f.estado === "sin_fecha") consulta = consulta.is("vence", null);
  const [{ data, error }, { data: listas }, { data: tableros }, { data: busquedas }, usuarios] = await Promise.all([
    consulta,
    supabase.from("tareas_listas").select("id, tablero_id, nombre, posicion").eq("archivada", false).order("posicion"),
    supabase.from("tareas_tableros").select("id, nombre").eq("archivado", false).order("nombre"),
    supabase.from("tareas_busquedas").select("id, nombre, filtros").order("creado_en"),
    usuariosTareas(),
  ]);
  if (error) throw new Error(`No se pudo buscar: ${error.message}`);
  type Cruda = {
    id: string;
    titulo: string;
    descripcion: string | null;
    tablero_id: string;
    lista_id: string;
    vence: string | null;
    completada: boolean;
    version: number;
    tareas_tableros: { nombre: string };
    tareas_listas: { nombre: string };
    tareas_tarjeta_miembros: { usuario_id: string }[];
    tareas_tarjeta_etiquetas: { tareas_etiquetas: { nombre: string; color: string } | null }[];
  };
  let filas: FilaBusqueda[] = ((data ?? []) as unknown as Cruda[]).map((c) => ({
    id: c.id,
    titulo: c.titulo,
    descripcion: c.descripcion,
    tablero_id: c.tablero_id,
    tablero: c.tareas_tableros.nombre,
    lista_id: c.lista_id,
    lista: c.tareas_listas.nombre,
    vence: c.vence,
    completada: c.completada,
    version: c.version,
    miembros: c.tareas_tarjeta_miembros.map((m) => m.usuario_id),
    etiquetas: c.tareas_tarjeta_etiquetas.map((e) => e.tareas_etiquetas).filter((e): e is { nombre: string; color: string } => !!e),
  }));
  if (f.responsable === "sin") filas = filas.filter((x) => !x.miembros.length);
  else if (f.responsable) filas = filas.filter((x) => x.miembros.includes(f.responsable!));
  if (f.etiqueta?.trim()) {
    const e = f.etiqueta.trim().toLowerCase();
    filas = filas.filter((x) => x.etiquetas.some((t) => t.nombre.toLowerCase().includes(e) || t.color === e));
  }
  return {
    filas,
    listas: (listas ?? []) as { id: string; tablero_id: string; nombre: string }[],
    tableros: (tableros ?? []) as { id: string; nombre: string }[],
    busquedas: (busquedas ?? []) as { id: string; nombre: string; filtros: Record<string, string> }[],
    usuarios,
  };
}
