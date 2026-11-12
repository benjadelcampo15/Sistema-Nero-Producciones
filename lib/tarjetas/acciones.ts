"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { EMPRESAS, NOMBRE_EMPRESA } from "@/lib/empresas";
import { formatoPesos } from "@/lib/formato";
import { leerResumenPdf } from "./leer-pdf";
import { obtenerResumen, listarReglas } from "./consultas";
import { EMPRESAS_TARJETA, claveDescripcion, esquemaLinea, huella, mesDelResumen, reglaPara, TIPOS_MOVIMIENTO } from "./tipos";

type Resultado = { error?: string; ok?: string };

const TAMANO_MAXIMO = 10 * 1024 * 1024;
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const uuid = z.uuid();

function archivoDe(formData: FormData) {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elegí el PDF del resumen" };
  if (archivo.size > TAMANO_MAXIMO) return { error: "El archivo pesa más de 10 MB" };
  if (archivo.type !== "application/pdf" && !archivo.name.toLowerCase().endsWith(".pdf")) return { error: "Tiene que ser un PDF" };
  return { archivo };
}

/** Lee el resumen con la IA (no guarda nada: se revisa antes de importar). */
export async function leerResumen(formData: FormData) {
  await exigirPermiso("financiero", "editar");
  const r = archivoDe(formData);
  if ("error" in r) return { error: r.error };
  try {
    const leido = await leerResumenPdf({ datos: Buffer.from(await r.archivo.arrayBuffer()), tipo: "application/pdf", nombre: r.archivo.name });
    return { leido };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer el PDF" };
  }
}

const importe = z.number().finite().nullable();
const esquemaImportacion = z.object({
  tarjeta: z.string().trim().min(1, "Falta el nombre de la tarjeta").max(60),
  fecha_cierre: fecha,
  vencimiento: fecha.nullable(),
  cotizacion_usd: z.number().positive("La cotización tiene que ser mayor a cero").nullable(),
  saldo_anterior_ars: importe,
  saldo_anterior_usd: importe,
  saldo_actual_ars: importe,
  saldo_actual_usd: importe,
  total_consumos_ars: importe,
  total_consumos_usd: importe,
  lineas: z.array(esquemaLinea).min(1, "El resumen no tiene movimientos").max(3000),
});

/**
 * Guarda el resumen y sus renglones. Los que ya estaban en otro resumen de la
 * misma tarjeta no se repiten; los consumos se asignan con las reglas aprendidas.
 */
export async function importarResumen(formData: FormData): Promise<{ error?: string; id?: string; nuevas?: number; repetidas?: number }> {
  await exigirPermiso("financiero", "editar");
  const r = archivoDe(formData);
  if ("error" in r) return { error: r.error };
  let crudo: unknown;
  try {
    crudo = JSON.parse(String(formData.get("datos") ?? ""));
  } catch {
    return { error: "Datos inválidos" };
  }
  const v = esquemaImportacion.safeParse(crudo);
  if (!v.success) return { error: v.error.issues[0].message };
  const { lineas, ...d } = v.data;

  const supabase = await crearClienteServidor();
  const { data: yaCargado } = await supabase.from("tarjeta_resumenes").select("id").eq("tarjeta", d.tarjeta).eq("fecha_cierre", d.fecha_cierre).maybeSingle();
  if (yaCargado) return { error: `El resumen de ${d.tarjeta} con cierre ${d.fecha_cierre.split("-").reverse().join("/")} ya está cargado` };

  // Renglones: los iguales dentro del archivo (dos consumos idénticos el mismo día) se distinguen por orden de aparición.
  const vistas = new Map<string, number>();
  const filas = lineas.map((l, orden) => {
    const base = huella(l, 0);
    const repeticion = vistas.get(base) ?? 0;
    vistas.set(base, repeticion + 1);
    return { ...l, orden, huella: huella(l, repeticion) };
  });
  const existentes = new Set<string>();
  for (let i = 0; i < filas.length; i += 200) {
    const { data } = await supabase
      .from("tarjeta_movimientos")
      .select("huella")
      .eq("tarjeta", d.tarjeta)
      .in("huella", filas.slice(i, i + 200).map((f) => f.huella));
    for (const e of data ?? []) existentes.add(e.huella as string);
  }
  const nuevas = filas.filter((f) => !existentes.has(f.huella));
  if (!nuevas.length) return { error: "Todos los renglones de este resumen ya estaban cargados en otro resumen de la tarjeta" };

  const path = `${randomUUID()}.pdf`;
  const admin = crearClienteAdmin();
  const { error: errorArchivo } = await admin.storage.from("tarjetas").upload(path, r.archivo, { contentType: "application/pdf" });

  const { data: resumen, error } = await supabase
    .from("tarjeta_resumenes")
    .insert({ ...d, archivo_nombre: r.archivo.name.slice(0, 200), archivo_path: errorArchivo ? null : path })
    .select("id")
    .single();
  if (error || !resumen) {
    if (!errorArchivo) await admin.storage.from("tarjetas").remove([path]);
    return { error: "No se pudo guardar el resumen" };
  }

  const reglas = await listarReglas();
  const aGuardar = nuevas.map((f) => {
    const regla = f.tipo === "consumo" ? reglaPara(f.descripcion, reglas) : null;
    return { resumen_id: resumen.id, tarjeta: d.tarjeta, ...f, empresa: regla?.empresa ?? null, detalle: regla?.detalle ?? null };
  });
  for (let i = 0; i < aGuardar.length; i += 500) {
    const { error: errorLineas } = await supabase.from("tarjeta_movimientos").insert(aGuardar.slice(i, i + 500));
    if (errorLineas) {
      await supabase.from("tarjeta_resumenes").delete().eq("id", resumen.id);
      if (!errorArchivo) await admin.storage.from("tarjetas").remove([path]);
      return { error: "No se pudieron guardar los renglones del resumen" };
    }
  }
  refresh();
  return { id: resumen.id, nuevas: nuevas.length, repetidas: filas.length - nuevas.length };
}

/** El resumen todavía se puede tocar (no pasó a Financiero). */
async function resumenEditable(id: string) {
  if (!uuid.safeParse(id).success) return { error: "Resumen inválido" };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("tarjeta_resumenes").select("id, financiero_en").eq("id", id).maybeSingle();
  if (!data) return { error: "Resumen no encontrado" };
  if (data.financiero_en) return { error: "Este resumen ya pasó a Financiero: deshacé el pase para modificarlo" };
  return { supabase };
}

const esquemaDatosResumen = z.object({
  cotizacion_usd: z.number().positive("La cotización tiene que ser mayor a cero").nullable(),
  vencimiento: fecha.nullable(),
});

export async function actualizarResumen(id: string, datos: unknown): Promise<Resultado> {
  await exigirPermiso("financiero", "editar");
  const v = esquemaDatosResumen.safeParse(datos);
  if (!v.success) return { error: v.error.issues[0].message };
  const r = await resumenEditable(id);
  if ("error" in r) return { error: r.error };
  const { error } = await r.supabase.from("tarjeta_resumenes").update(v.data).eq("id", id);
  if (error) return { error: "No se pudo guardar" };
  refresh();
  return {};
}

const esquemaAsignacion = z.object({
  empresa: z.enum(EMPRESAS_TARJETA).nullable().optional(),
  detalle: z.string().trim().max(60).nullable().optional(),
  reparto_nero: z.number().min(0).max(100).optional(),
  tipo: z.enum(TIPOS_MOVIMIENTO).optional(),
});

/**
 * Cambia la empresa, el detalle, el reparto o el tipo de un renglón. Al
 * asignar un consumo se aprende la regla (por la parte fija de la
 * descripción). Si ese comercio ya se había asignado a la otra empresa, la
 * regla queda "para las dos": recuerda el detalle pero la empresa se elige a mano.
 * Devuelve cuántos consumos iguales siguen sin asignar (para ofrecer asignarlos juntos).
 */
export async function asignarMovimiento(id: string, cambios: unknown): Promise<Resultado & { iguales?: number; ambigua?: boolean }> {
  await exigirPermiso("financiero", "editar");
  if (!uuid.safeParse(id).success) return { error: "Renglón inválido" };
  const v = esquemaAsignacion.safeParse(cambios);
  if (!v.success) return { error: "Datos inválidos" };
  const supabase = await crearClienteServidor();
  const { data: m } = await supabase.from("tarjeta_movimientos").select("id, resumen_id, descripcion, tipo, empresa, detalle").eq("id", id).maybeSingle();
  if (!m) return { error: "Renglón no encontrado" };
  const r = await resumenEditable(m.resumen_id);
  if ("error" in r) return { error: r.error };

  const fila = { ...v.data, detalle: v.data.detalle === "" ? null : v.data.detalle?.toUpperCase() };
  if (fila.detalle === undefined) delete fila.detalle;
  const { error } = await supabase.from("tarjeta_movimientos").update(fila).eq("id", id);
  if (error) return { error: "No se pudo guardar" };

  const tipo = v.data.tipo ?? m.tipo;
  const clave = claveDescripcion(m.descripcion);
  if (tipo !== "consumo" || !clave || (v.data.empresa === undefined && v.data.detalle === undefined)) {
    refresh();
    return {};
  }
  const empresa = v.data.empresa !== undefined ? v.data.empresa : m.empresa;
  const detalle = fila.detalle !== undefined ? fila.detalle : m.detalle;
  const { data: previa } = await supabase.from("tarjeta_reglas").select("empresa, detalle, ambigua").eq("clave", clave).maybeSingle();
  // Mismo comercio en las dos empresas: deja de asignarse solo (solo se recuerda el detalle).
  const ambigua = !!previa && (previa.ambigua || (!!previa.empresa && !!empresa && previa.empresa !== empresa));
  await supabase
    .from("tarjeta_reglas")
    .upsert({ clave, ambigua, empresa: ambigua ? null : (empresa ?? previa?.empresa ?? null), detalle: detalle ?? previa?.detalle ?? null }, { onConflict: "clave" });
  refresh();
  if (!empresa) return { ambigua };
  return { iguales: (await igualesSinAsignar(clave, id)).length, ambigua };
}

/** Consumos sin asignar con la misma clave en los resúmenes que no pasaron a Financiero. */
async function igualesSinAsignar(clave: string, excepto: string) {
  const supabase = await crearClienteServidor();
  const { data: abiertos } = await supabase.from("tarjeta_resumenes").select("id").is("financiero_en", null);
  if (!abiertos?.length) return [];
  const { data: candidatos } = await supabase
    .from("tarjeta_movimientos")
    .select("id, descripcion")
    .in("resumen_id", abiertos.map((a) => a.id))
    .eq("tipo", "consumo")
    .is("empresa", null)
    .neq("id", excepto)
    .limit(5000);
  return (candidatos ?? []).filter((c) => claveDescripcion(c.descripcion) === clave).map((c) => c.id);
}

/** Les pone a los consumos iguales sin asignar la misma empresa y detalle que este renglón. */
export async function asignarIguales(id: string): Promise<Resultado> {
  await exigirPermiso("financiero", "editar");
  if (!uuid.safeParse(id).success) return { error: "Renglón inválido" };
  const supabase = await crearClienteServidor();
  const { data: m } = await supabase.from("tarjeta_movimientos").select("descripcion, empresa, detalle").eq("id", id).maybeSingle();
  if (!m?.empresa) return { error: "El renglón no tiene empresa" };
  const ids = await igualesSinAsignar(claveDescripcion(m.descripcion), id);
  const cambios: { empresa: string; detalle?: string } = { empresa: m.empresa };
  if (m.detalle) cambios.detalle = m.detalle;
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from("tarjeta_movimientos").update(cambios).in("id", ids.slice(i, i + 200));
    if (error) return { error: "No se pudieron asignar todos" };
  }
  refresh();
  return { ok: `Se asignaron ${ids.length} consumos` };
}

/** Aplica las reglas guardadas a los consumos sin asignar del resumen. */
export async function aplicarReglas(resumenId: string): Promise<Resultado> {
  await exigirPermiso("financiero", "editar");
  const r = await resumenEditable(resumenId);
  if ("error" in r) return { error: r.error };
  const [reglas, { data: sin }] = await Promise.all([
    listarReglas(),
    r.supabase.from("tarjeta_movimientos").select("id, descripcion").eq("resumen_id", resumenId).eq("tipo", "consumo").is("empresa", null),
  ]);
  let cuantas = 0;
  for (const m of sin ?? []) {
    const regla = reglaPara(m.descripcion, reglas);
    if (!regla?.empresa) continue;
    await r.supabase.from("tarjeta_movimientos").update({ empresa: regla.empresa, detalle: regla.detalle }).eq("id", m.id);
    cuantas++;
  }
  refresh();
  return { ok: cuantas ? `Se asignaron ${cuantas} consumos` : "No había consumos sin asignar que coincidan con una regla" };
}

/** Mismo reparto para todos los cargos del resumen. */
export async function repartirCargos(resumenId: string, repartoNero: number): Promise<Resultado> {
  await exigirPermiso("financiero", "editar");
  if (!(repartoNero >= 0 && repartoNero <= 100)) return { error: "El reparto va de 0 a 100" };
  const r = await resumenEditable(resumenId);
  if ("error" in r) return { error: r.error };
  const { error } = await r.supabase.from("tarjeta_movimientos").update({ reparto_nero: Math.round(repartoNero * 100) / 100 }).eq("resumen_id", resumenId).eq("tipo", "cargo");
  if (error) return { error: "No se pudo guardar" };
  refresh();
  return {};
}

/** Agrega a mano un renglón que la lectura no tomó (por ejemplo en un PDF escaneado). */
export async function agregarMovimiento(resumenId: string, datos: unknown): Promise<Resultado> {
  await exigirPermiso("financiero", "editar");
  const v = esquemaLinea.safeParse(datos);
  if (!v.success) return { error: v.error.issues[0].message };
  if (!v.data.descripcion) return { error: "Falta la descripción" };
  if (!v.data.pesos && !v.data.dolares) return { error: "Falta el importe" };
  const r = await resumenEditable(resumenId);
  if ("error" in r) return { error: r.error };
  const { data: resumen } = await r.supabase.from("tarjeta_resumenes").select("tarjeta").eq("id", resumenId).single();
  const { data: ultimo } = await r.supabase.from("tarjeta_movimientos").select("orden").eq("resumen_id", resumenId).order("orden", { ascending: false }).limit(1).maybeSingle();
  const reglas = v.data.tipo === "consumo" ? await listarReglas() : [];
  const regla = reglaPara(v.data.descripcion, reglas);
  const { error } = await r.supabase.from("tarjeta_movimientos").insert({
    resumen_id: resumenId,
    tarjeta: resumen?.tarjeta,
    ...v.data,
    orden: (ultimo?.orden ?? -1) + 1,
    huella: `manual|${randomUUID()}`,
    empresa: regla?.empresa ?? null,
    detalle: regla?.detalle ?? null,
  });
  if (error) return { error: "No se pudo agregar el renglón" };
  refresh();
  return {};
}

export async function borrarMovimiento(id: string): Promise<Resultado> {
  await exigirPermiso("financiero", "editar");
  if (!uuid.safeParse(id).success) return { error: "Renglón inválido" };
  const supabase = await crearClienteServidor();
  const { data: m } = await supabase.from("tarjeta_movimientos").select("resumen_id").eq("id", id).maybeSingle();
  if (!m) return { error: "Renglón no encontrado" };
  const r = await resumenEditable(m.resumen_id);
  if ("error" in r) return { error: r.error };
  const { error } = await supabase.from("tarjeta_movimientos").delete().eq("id", id);
  if (error) return { error: "No se pudo borrar" };
  refresh();
  return {};
}

export async function borrarRegla(id: string): Promise<Resultado> {
  await exigirPermiso("financiero", "editar");
  if (!uuid.safeParse(id).success) return { error: "Regla inválida" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("tarjeta_reglas").delete().eq("id", id);
  if (error) return { error: "No se pudo borrar la regla" };
  refresh();
  return {};
}

export async function borrarResumen(id: string): Promise<Resultado> {
  await exigirPermiso("financiero", "editar");
  const r = await resumenEditable(id);
  if ("error" in r) return { error: r.error };
  const { data } = await r.supabase.from("tarjeta_resumenes").delete().eq("id", id).select("archivo_path");
  if (!data?.length) return { error: "No se pudo borrar el resumen" };
  if (data[0].archivo_path) await crearClienteAdmin().storage.from("tarjetas").remove([data[0].archivo_path]);
  refresh();
  return {};
}

const esquemaPase = z.object({
  fecha: fecha,
  categoria_nero: uuid.nullable(),
  categoria_ruta: uuid.nullable(),
});

/**
 * Pasa el resumen a Financiero, solo cuando se confirma: un egreso pendiente
 * por empresa (sus consumos en pesos y dólares a la cotización + su parte de
 * los cargos), con medio de pago tarjeta y la fecha de vencimiento.
 */
export async function pasarAFinanciero(resumenId: string, datos: unknown): Promise<Resultado> {
  await exigirPermiso("financiero", "editar");
  const v = esquemaPase.safeParse(datos);
  if (!v.success) return { error: v.error.issues[0].message };
  const r = await resumenEditable(resumenId);
  if ("error" in r) return { error: r.error };
  const detalle = await obtenerResumen(resumenId);
  if (!detalle) return { error: "Resumen no encontrado" };
  const { resumen, totales } = detalle;
  if (totales.consumos.sin.cantidad) return { error: `Hay ${totales.consumos.sin.cantidad} consumos sin asignar: asignalos antes de pasar a Financiero` };
  if (totales.faltaCotizacion) return { error: "Hay importes en dólares: cargá la cotización antes de pasar a Financiero" };

  const supabase = r.supabase;
  const filas = [];
  for (const empresa of EMPRESAS) {
    const monto = totales.empresa[empresa];
    if (monto <= 0) continue;
    const categoria = empresa === "nero" ? v.data.categoria_nero : v.data.categoria_ruta;
    if (!categoria) return { error: `Elegí la categoría para ${NOMBRE_EMPRESA[empresa]}` };
    const { data: c } = await supabase.from("categorias").select("tipo").eq("id", categoria).maybeSingle();
    if (c?.tipo !== "egreso") return { error: "La categoría tiene que ser de egresos" };
    const consumos = totales.consumos[empresa];
    const cargos = empresa === "nero" ? totales.cargos.nero : totales.cargos.ruta;
    filas.push({
      empresa,
      tipo: "egreso",
      monto,
      fecha: v.data.fecha,
      descripcion: `Tarjeta ${resumen.tarjeta} — resumen ${mesDelResumen(resumen.fecha_cierre)}`,
      categoria_id: categoria,
      medio_pago: "tarjeta",
      estado: "pendiente",
      contraparte: resumen.tarjeta,
      notas: [
        `Consumos en pesos: ${formatoPesos(consumos.pesos)}`,
        consumos.dolares ? `Consumos en dólares: U$S ${consumos.dolares.toFixed(2)} a $${resumen.cotizacion_usd}` : null,
        `Impuestos y cargos (su parte): ${formatoPesos(cargos)}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }
  if (!filas.length) return { error: "El resumen no tiene importes para pasar" };
  const { data: creadas, error } = await supabase.from("transacciones").insert(filas).select("id");
  if (error || !creadas?.length) return { error: "No se pudieron crear los movimientos en Financiero" };
  const { error: errorMarca } = await supabase
    .from("tarjeta_resumenes")
    .update({ transacciones: creadas.map((c) => c.id), financiero_en: new Date().toISOString() })
    .eq("id", resumenId);
  if (errorMarca) {
    await supabase.from("transacciones").update({ eliminado_en: new Date().toISOString() }).in("id", creadas.map((c) => c.id));
    return { error: "No se pudo marcar el resumen como pasado" };
  }
  refresh();
  return { ok: `Se crearon ${creadas.length} movimientos pendientes en Financiero` };
}

/** Saca de Financiero lo que se creó desde el resumen (quedan eliminados, como cualquier movimiento borrado). */
export async function deshacerPase(resumenId: string): Promise<Resultado> {
  await exigirPermiso("financiero", "editar");
  if (!uuid.safeParse(resumenId).success) return { error: "Resumen inválido" };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("tarjeta_resumenes").select("transacciones, financiero_en").eq("id", resumenId).maybeSingle();
  if (!data?.financiero_en) return { error: "El resumen no está en Financiero" };
  const ids = (data.transacciones as string[]) ?? [];
  if (ids.length) {
    const { data: reales } = await supabase.from("transacciones").select("id").in("id", ids).eq("estado", "real").is("eliminado_en", null);
    if (reales?.length) return { error: "El pago de la tarjeta ya se registró en Financiero (está como real): deshacelo ahí primero" };
    const { error } = await supabase.from("transacciones").update({ eliminado_en: new Date().toISOString() }).in("id", ids).is("eliminado_en", null);
    if (error) return { error: "No se pudieron sacar los movimientos de Financiero" };
  }
  await supabase.from("tarjeta_resumenes").update({ transacciones: [], financiero_en: null }).eq("id", resumenId);
  refresh();
  return {};
}

