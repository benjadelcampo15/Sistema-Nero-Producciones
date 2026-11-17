"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso, obtenerUsuario } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { EMPRESAS } from "@/lib/empresas";

/**
 * Consumido (FUDO vs consumo físico). Nada de esto descuenta stock ni toca
 * Financiero: es un control. Los permisos los valida la base (Stock editar).
 */
type Resultado = { error?: string };
const uuid = z.uuid();
const fallo = (e: { message: string } | null, defecto: string) =>
  /row-level|permission/i.test(e?.message ?? "") ? "No tenés permiso para esto" : e?.message && !/violates|syntax|function|relation|column/i.test(e.message) ? e.message : defecto;

/** Link firmado para guardar el Excel original (lo sube el navegador). */
export async function prepararArchivoFudo(nombre: string, tamano: number): Promise<Resultado & { ruta?: string; token?: string }> {
  await exigirPermiso("stock", "editar");
  if (!(tamano > 0) || tamano > 15 * 1024 * 1024) return { error: "El archivo puede pesar hasta 15 MB" };
  const ruta = `reportes/${crypto.randomUUID()}-${nombre.replace(/[^\w.-]+/g, "_").slice(-80)}`;
  const { data, error } = await crearClienteAdmin().storage.from("fudo").createSignedUploadUrl(ruta);
  return error || !data ? { error: "No se pudo preparar la subida" } : { ruta, token: data.token };
}

/** Antes de importar: qué líneas ya están en otra importación vigente del evento (y si es el mismo archivo). */
export async function revisarDuplicados(eventoId: string, huellas: string[], huellaArchivo: string) {
  await exigirPermiso("stock", "ver");
  if (!uuid.safeParse(eventoId).success) return { mismoArchivo: false, repetidas: [] as string[], vigentes: [] as { id: string; version: number; nombre_archivo: string; desde: string | null; hasta: string | null; lineas: number; coinciden: number }[] };
  const supabase = await crearClienteServidor();
  const { data: vigentes } = await supabase.from("fudo_importaciones").select("id, version, nombre_archivo, desde, hasta, lineas, huella_archivo").eq("evento_id", eventoId).eq("estado", "vigente");
  const ids = (vigentes ?? []).map((v) => v.id);
  const repetidas = new Set<string>();
  const coinciden = new Map<string, number>();
  // Por tandas (las huellas son textos largos).
  for (let i = 0; ids.length && i < huellas.length; i += 150) {
    const { data } = await supabase.from("fudo_lineas").select("huella, importacion_id").in("importacion_id", ids).in("huella", huellas.slice(i, i + 150));
    for (const d of data ?? []) {
      repetidas.add(d.huella);
      coinciden.set(d.importacion_id, (coinciden.get(d.importacion_id) ?? 0) + 1);
    }
  }
  return {
    mismoArchivo: (vigentes ?? []).some((v) => v.huella_archivo === huellaArchivo),
    repetidas: [...repetidas],
    // Primero la importación que más líneas comparte con el archivo nuevo (la candidata a reemplazar).
    vigentes: (vigentes ?? []).map((v) => ({ ...v, huella_archivo: undefined, coinciden: coinciden.get(v.id) ?? 0 })).sort((a, b) => b.coinciden - a.coinciden),
  };
}

const esquemaLinea = z.object({
  fecha: z.iso.date().nullable(),
  categoria: z.string().max(200),
  subcategoria: z.string().max(200),
  producto: z.string().trim().min(1).max(300),
  clave: z.string().min(1).max(300),
  cantidad: z.number().finite(),
  monto: z.number().finite(),
  cmv: z.number().finite().nullable(),
  huella: z.string().min(1).max(700),
});
const esquemaImportacion = z.object({
  empresa: z.enum(EMPRESAS),
  evento_id: uuid,
  nombre_archivo: z.string().max(300),
  archivo: z.string().max(400).nullable(),
  huella_archivo: z.string().min(8).max(200),
  desde: z.iso.date().nullable(),
  hasta: z.iso.date().nullable(),
  ranking_unidades: z.number().finite().nullable(),
  ranking_monto: z.number().finite().nullable(),
  ranking: z.array(z.object({ producto: z.string().max(300), clave: z.string().max(300), cantidad: z.number(), monto: z.number() })).max(5000),
  nota: z.string().max(1000).optional(),
});

/**
 * Guarda la importación. modo: "nueva" (rechaza si hay líneas repetidas),
 * "solo_nuevas" (descarta las que ya estaban) o "reemplazar" (la anterior queda
 * como historial y no cuenta más). Nunca suma una versión sobre otra.
 */
export async function importarFudo(
  datos: z.input<typeof esquemaImportacion>,
  lineas: z.input<typeof esquemaLinea>[],
  modo: "nueva" | "solo_nuevas" | "reemplazar",
  reemplaza: string | null,
): Promise<Resultado & { id?: string; descartadas?: number }> {
  await exigirPermiso("stock", "editar");
  const v = esquemaImportacion.safeParse(datos);
  const l = z.array(esquemaLinea).min(1, "El reporte no tiene ventas").max(20000).safeParse(lineas);
  if (!v.success) return { error: "Datos inválidos del reporte" };
  if (!l.success) return { error: l.error.issues[0].message };
  if (modo === "reemplazar" && !uuid.safeParse(reemplaza).success) return { error: "Elegí qué importación reemplazar" };
  const supabase = await crearClienteServidor();
  const { data: evento } = await supabase.from("eventos").select("empresa").eq("id", v.data.evento_id).maybeSingle();
  if (!evento) return { error: "El evento no existe" };
  if (evento.empresa !== v.data.empresa) return { error: "El evento es de la otra empresa" };

  let aGuardar = l.data;
  let descartadas = 0;
  if (modo !== "reemplazar") {
    const r = await revisarDuplicados(v.data.evento_id, l.data.map((x) => x.huella), v.data.huella_archivo);
    if (r.mismoArchivo) return { error: "Este mismo archivo ya está importado en el evento" };
    const repetidas = new Set(r.repetidas);
    if (repetidas.size && modo === "nueva") return { error: `${repetidas.size} línea(s) ya están en otra importación del evento: elegí reemplazarla o agregar solo las nuevas` };
    aGuardar = l.data.filter((x) => !repetidas.has(x.huella));
    descartadas = l.data.length - aGuardar.length;
    if (!aGuardar.length) return { error: "Todas las líneas ya estaban importadas: no hay nada nuevo para agregar" };
  }
  const { data, error } = await supabase.rpc("fudo_importar", { p: { ...v.data, descartadas }, p_lineas: aGuardar, p_reemplaza: modo === "reemplazar" ? reemplaza : null });
  if (error) return { error: fallo(error, "No se pudo guardar la importación") };
  refresh();
  return { id: data as string, descartadas };
}

/** Anula una importación (queda en el historial, no cuenta para la comparación). */
export async function anularImportacion(id: string, motivo: string): Promise<Resultado> {
  await exigirPermiso("stock", "editar");
  if (!uuid.safeParse(id).success || !motivo.trim()) return { error: "Escribí el motivo" };
  const usuario = await obtenerUsuario();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("fudo_importaciones")
    .update({ estado: "anulada", estado_por: usuario.id, estado_en: new Date().toISOString(), nota: motivo.trim().slice(0, 1000) })
    .eq("id", id)
    .eq("estado", "vigente")
    .select("id");
  if (error) return { error: fallo(error, "No se pudo anular") };
  refresh();
  return data?.length ? {} : { error: "La importación ya no está vigente" };
}

const esquemaReceta = z.object({
  tipo: z.enum(["receta", "ignorar"]),
  nota: z.string().max(500).optional(),
  items: z.array(z.object({ producto_id: uuid, cantidad: z.number().positive("La cantidad tiene que ser mayor a cero").max(100000), detalle: z.string().max(200).optional() })).max(30),
});

/** Guarda qué consume un producto de FUDO (o que no es mercadería). Reemplaza la composición anterior. */
export async function guardarReceta(fudoProductoId: string, datos: z.input<typeof esquemaReceta>): Promise<Resultado> {
  await exigirPermiso("stock", "editar");
  const v = esquemaReceta.safeParse(datos);
  if (!v.success || !uuid.safeParse(fudoProductoId).success) return { error: v.error?.issues[0].message ?? "Datos inválidos" };
  const ids = v.data.items.map((i) => i.producto_id);
  if (new Set(ids).size !== ids.length) return { error: "Un producto está repetido en la receta" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("fudo_productos").update({ tipo: v.data.tipo, nota: v.data.nota?.trim() || null }).eq("id", fudoProductoId);
  if (error) return { error: fallo(error, "No se pudo guardar") };
  const { data: actuales } = await supabase.from("fudo_receta_items").select("id, producto_id").eq("fudo_producto_id", fudoProductoId);
  const items = v.data.tipo === "ignorar" ? [] : v.data.items;
  const quitar = (actuales ?? []).filter((a) => !items.some((i) => i.producto_id === a.producto_id)).map((a) => a.id);
  if (quitar.length) {
    const { error: e } = await supabase.from("fudo_receta_items").delete().in("id", quitar);
    if (e) return { error: fallo(e, "No se pudo guardar") };
  }
  if (items.length) {
    const { error: e } = await supabase
      .from("fudo_receta_items")
      .upsert(items.map((i) => ({ fudo_producto_id: fudoProductoId, producto_id: i.producto_id, cantidad: i.cantidad, detalle: i.detalle?.trim() || null })), { onConflict: "fudo_producto_id,producto_id" });
    if (e) return { error: fallo(e, "No se pudo guardar la receta") };
  }
  refresh();
  return {};
}

const cantidad = z.number().min(0, "Las cantidades no pueden ser negativas").max(1e9);
const esquemaFisico = z.object({
  inicial: cantidad,
  reposiciones: cantidad,
  final: cantidad,
  mermas: cantidad,
  roturas: cantidad,
  invitaciones: cantidad,
  corregido: cantidad.nullable(),
  motivo: z.string().max(500).nullable(),
  nota: z.string().max(500).nullable(),
});

/** Conteo físico de un producto en el evento (la corrección del consumo la autoriza un administrador). */
export async function guardarFisico(eventoId: string, productoId: string, datos: z.input<typeof esquemaFisico>): Promise<Resultado> {
  await exigirPermiso("stock", "editar");
  const v = esquemaFisico.safeParse(datos);
  if (!v.success || !uuid.safeParse(eventoId).success || !uuid.safeParse(productoId).success) return { error: v.error?.issues[0].message ?? "Datos inválidos" };
  if (v.data.inicial + v.data.reposiciones - v.data.final < 0 && v.data.corregido === null) return { error: "El stock final no puede ser mayor que el inicial más las reposiciones" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("consumo_fisico").upsert({ evento_id: eventoId, producto_id: productoId, ...v.data }, { onConflict: "evento_id,producto_id" });
  if (error) return { error: fallo(error, "No se pudo guardar el conteo") };
  refresh();
  return {};
}

export async function borrarFisico(eventoId: string, productoId: string): Promise<Resultado> {
  await exigirPermiso("stock", "editar");
  if (!uuid.safeParse(eventoId).success || !uuid.safeParse(productoId).success) return { error: "Datos inválidos" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("consumo_fisico").delete().eq("evento_id", eventoId).eq("producto_id", productoId);
  if (error) return { error: fallo(error, "No se pudo borrar") };
  refresh();
  return {};
}

/**
 * Trae de Stock lo que salió de los depósitos hacia el evento, como reposiciones,
 * para los productos que todavía no tienen conteo (no pisa lo ya cargado).
 */
export async function traerDeStock(eventoId: string, salidas: Record<string, number>): Promise<Resultado & { agregados?: number }> {
  await exigirPermiso("stock", "editar");
  if (!uuid.safeParse(eventoId).success) return { error: "Datos inválidos" };
  const supabase = await crearClienteServidor();
  // Se vuelven a leer del servidor (no se confía en lo que manda la pantalla).
  const { data: movimientos } = await supabase.from("movimientos_stock").select("producto_id, cantidad").eq("evento_id", eventoId).eq("tipo", "salida");
  const total = new Map<string, number>();
  for (const m of movimientos ?? []) total.set(m.producto_id, (total.get(m.producto_id) ?? 0) + Math.abs(Number(m.cantidad)));
  const { data: ya } = await supabase.from("consumo_fisico").select("producto_id").eq("evento_id", eventoId);
  const nuevos = [...total].filter(([id]) => !(ya ?? []).some((y) => y.producto_id === id) && Object.hasOwn(salidas, id));
  if (!nuevos.length) return { agregados: 0 };
  const { error } = await supabase.from("consumo_fisico").insert(nuevos.map(([producto_id, n]) => ({ evento_id: eventoId, producto_id, reposiciones: Math.round(n * 1000) / 1000, nota: "Reposiciones traídas de las salidas de Stock al evento" })));
  if (error) return { error: fallo(error, "No se pudo traer de Stock") };
  refresh();
  return { agregados: nuevos.length };
}

export async function guardarTolerancia(empresa: string, unidades: number, pct: number): Promise<Resultado> {
  await exigirPermiso("stock", "editar");
  if (!EMPRESAS.includes(empresa as "nero") || !(unidades >= 0) || !(pct >= 0) || pct > 1000) return { error: "Datos inválidos" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("fudo_config").upsert({ empresa, tolerancia_unid: unidades, tolerancia_pct: pct }, { onConflict: "empresa" });
  if (error) return { error: fallo(error, "No se pudo guardar") };
  refresh();
  return {};
}
