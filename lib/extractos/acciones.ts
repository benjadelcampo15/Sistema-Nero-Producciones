"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { EMPRESAS } from "@/lib/empresas";
import { leerExtractoPdf } from "./leer-pdf";
import { obtenerConciliacion } from "./consultas";
import { esquemaFormato, esquemaLinea, huella } from "./tipos";

type Resultado = { error?: string; ok?: string };

const TAMANO_MAXIMO = 10 * 1024 * 1024;
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function archivoDe(formData: FormData) {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elegí el archivo del extracto" };
  if (archivo.size > TAMANO_MAXIMO) return { error: "El archivo pesa más de 10 MB" };
  return { archivo };
}

/** Lee un extracto en PDF con la IA (no guarda nada: se revisa antes de importar). */
export async function leerPdf(formData: FormData) {
  await exigirPermiso("financiero", "editar");
  const r = archivoDe(formData);
  if ("error" in r) return { error: r.error };
  if (r.archivo.type !== "application/pdf") return { error: "Tiene que ser un PDF" };
  try {
    const leido = await leerExtractoPdf({ datos: Buffer.from(await r.archivo.arrayBuffer()), tipo: "application/pdf", nombre: r.archivo.name });
    return { leido };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer el PDF" };
  }
}

const esquemaImportacion = z.object({
  cuenta_id: z.uuid("Elegí la cuenta"),
  origen: z.enum(["planilla", "pdf"]),
  desde: fecha,
  hasta: fecha,
  saldo_inicial: z.number().nullable(),
  saldo_final: z.number().nullable(),
  actualizar_saldo: z.boolean(),
  formato: esquemaFormato.nullable(),
  lineas: z.array(esquemaLinea).min(1, "El extracto no tiene movimientos").max(5000),
});

/** Guarda el extracto y sus movimientos. Los que ya estaban (de otro extracto de la misma cuenta) no se repiten. */
export async function importarExtracto(formData: FormData): Promise<{ error?: string; id?: string; nuevas?: number; repetidas?: number }> {
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
  const d = v.data;
  if (d.hasta < d.desde) return { error: "El período del extracto es inválido" };

  const supabase = await crearClienteServidor();
  const { data: cuenta } = await supabase.from("cuentas_bancarias").select("id").eq("id", d.cuenta_id).maybeSingle();
  if (!cuenta) return { error: "Cuenta no encontrada" };

  // Archivo original.
  const extension = r.archivo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${d.cuenta_id}/${randomUUID()}.${extension}`;
  const admin = crearClienteAdmin();
  const { error: errorArchivo } = await admin.storage.from("extractos").upload(path, r.archivo, { contentType: r.archivo.type || "application/octet-stream" });

  const { data: extracto, error } = await supabase
    .from("extractos")
    .insert({
      cuenta_id: d.cuenta_id,
      desde: d.desde,
      hasta: d.hasta,
      saldo_inicial: d.saldo_inicial,
      saldo_final: d.saldo_final,
      archivo_nombre: r.archivo.name.slice(0, 200),
      archivo_path: errorArchivo ? null : path,
      origen: d.origen,
    })
    .select("id")
    .single();
  if (error || !extracto) {
    if (!errorArchivo) await admin.storage.from("extractos").remove([path]);
    return { error: "No se pudo guardar el extracto" };
  }

  // Movimientos: mismo día, importe, concepto y saldo repetidos en el archivo se distinguen por orden de aparición.
  const vistas = new Map<string, number>();
  const filas = d.lineas.map((l, orden) => {
    const base = huella(l, 0);
    const repeticion = vistas.get(base) ?? 0;
    vistas.set(base, repeticion + 1);
    return { extracto_id: extracto.id, cuenta_id: d.cuenta_id, orden, ...l, huella: huella(l, repeticion) };
  });
  const { data: existentes } = await supabase.from("extracto_lineas").select("huella").eq("cuenta_id", d.cuenta_id).in("huella", filas.map((f) => f.huella));
  const ya = new Set((existentes ?? []).map((e) => e.huella));
  const nuevas = filas.filter((f) => !ya.has(f.huella));
  if (!nuevas.length) {
    await supabase.from("extractos").delete().eq("id", extracto.id);
    if (!errorArchivo) await admin.storage.from("extractos").remove([path]);
    return { error: "Todos los movimientos de este archivo ya estaban cargados en otro extracto de la cuenta" };
  }
  for (let i = 0; i < nuevas.length; i += 500) {
    const { error: errorLineas } = await supabase.from("extracto_lineas").insert(nuevas.slice(i, i + 500));
    if (errorLineas) {
      await supabase.from("extractos").delete().eq("id", extracto.id);
      if (!errorArchivo) await admin.storage.from("extractos").remove([path]);
      return { error: "No se pudieron guardar los movimientos del extracto" };
    }
  }

  // Recordar cómo se lee la planilla de esta cuenta, y el saldo del último día.
  if (d.formato) await supabase.from("cuentas_bancarias").update({ formato_extracto: d.formato }).eq("id", d.cuenta_id);
  if (d.actualizar_saldo && d.saldo_final !== null) {
    await supabase.from("saldos_bancarios").upsert({ cuenta_id: d.cuenta_id, fecha: d.hasta, saldo: d.saldo_final }, { onConflict: "cuenta_id,fecha" });
  }
  refresh();
  return { id: extracto.id, nuevas: nuevas.length, repetidas: filas.length - nuevas.length };
}

async function lineaPendiente(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("extracto_lineas").select("id, fecha, monto, concepto, estado, cuenta_id").eq("id", id).maybeSingle();
  return data;
}

/**
 * Concilia una línea del banco con un movimiento de Financiero del mismo
 * tipo e importe. Si el movimiento estaba pendiente o proyectado, pasa a real
 * con la fecha del banco (es cuando se cobró o pagó de verdad).
 */
async function vincular(lineaId: string, transaccionId: string): Promise<Resultado> {
  const linea = await lineaPendiente(lineaId);
  if (!linea || linea.estado !== "pendiente") return { error: "La línea ya no está pendiente" };
  if (!z.uuid().safeParse(transaccionId).success) return { error: "Movimiento inválido" };
  const supabase = await crearClienteServidor();
  const { data: t } = await supabase.from("transacciones").select("id, tipo, monto, estado").eq("id", transaccionId).is("eliminado_en", null).maybeSingle();
  if (!t) return { error: "Movimiento no encontrado" };
  const monto = Number(linea.monto);
  if (t.tipo !== (monto > 0 ? "ingreso" : "egreso") || Math.abs(Number(t.monto) - Math.abs(monto)) >= 0.01) {
    return { error: "El movimiento no tiene el mismo tipo e importe que la línea del banco" };
  }
  const { data: ok, error } = await supabase
    .from("extracto_lineas")
    .update({ estado: "conciliada", transaccion_id: t.id })
    .eq("id", linea.id)
    .eq("estado", "pendiente")
    .select("id");
  if (error?.code === "23505") return { error: "Ese movimiento ya está conciliado con otra línea" };
  if (error || !ok?.length) return { error: "No se pudo conciliar" };
  if (t.estado !== "real") await supabase.from("transacciones").update({ estado: "real", fecha: linea.fecha }).eq("id", t.id);
  return {};
}

export async function conciliarLinea(lineaId: string, transaccionId: string): Promise<Resultado> {
  await exigirPermiso("financiero", "editar");
  const r = await vincular(lineaId, transaccionId);
  if (!r.error) refresh();
  return r;
}

/** Confirma de una vez todas las sugerencias (mismo importe y tipo, fecha cercana) del extracto. */
export async function confirmarSugerencias(extractoId: string): Promise<Resultado> {
  await exigirPermiso("financiero", "editar");
  const c = await obtenerConciliacion(extractoId);
  if (!c) return { error: "Extracto no encontrado" };
  let hechas = 0;
  const errores: string[] = [];
  for (const l of c.lineas) {
    if (l.estado !== "pendiente" || !l.sugerido) continue;
    const r = await vincular(l.id, l.sugerido);
    if (r.error) errores.push(r.error);
    else hechas++;
  }
  refresh();
  return errores.length ? { error: `Se conciliaron ${hechas}; ${errores.length} no se pudieron (${errores[0]})` } : { ok: `Se conciliaron ${hechas} movimientos` };
}

/** Vuelve la línea a pendiente (el movimiento queda como está). */
export async function deshacerLinea(lineaId: string): Promise<Resultado> {
  await exigirPermiso("financiero", "editar");
  if (!z.uuid().safeParse(lineaId).success) return { error: "Inválido" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("extracto_lineas").update({ estado: "pendiente", transaccion_id: null, nota: null }).eq("id", lineaId);
  if (error) return { error: "No se pudo deshacer" };
  refresh();
  return {};
}

/** Línea que no va a Financiero (p. ej. transferencia entre cuentas propias). */
export async function ignorarLinea(lineaId: string, nota: string): Promise<Resultado> {
  await exigirPermiso("financiero", "editar");
  const linea = await lineaPendiente(lineaId);
  if (!linea || linea.estado !== "pendiente") return { error: "La línea ya no está pendiente" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("extracto_lineas").update({ estado: "ignorada", nota: nota.trim().slice(0, 300) || null }).eq("id", lineaId);
  if (error) return { error: "No se pudo ignorar" };
  refresh();
  return {};
}

const esquemaCrear = z.object({
  lineas: z.array(z.uuid()).min(1, "Elegí al menos una línea").max(500),
  categoria_id: z.uuid("Elegí la categoría"),
  empresa: z.enum(EMPRESAS),
  descripcion: z.string().trim().max(200).optional(),
});

/**
 * Crea en Financiero los movimientos de líneas del banco que no estaban
 * cargados (comisiones, impuestos, transferencias) y los deja conciliados.
 */
export async function crearDesdeLineas(datos: unknown): Promise<Resultado> {
  await exigirPermiso("financiero", "editar");
  const v = esquemaCrear.safeParse(datos);
  if (!v.success) return { error: v.error.issues[0].message };
  const d = v.data;
  const supabase = await crearClienteServidor();
  const [{ data: lineas }, { data: categoria }] = await Promise.all([
    supabase.from("extracto_lineas").select("id, fecha, monto, concepto, estado, cuenta:cuentas_bancarias(nombre, tipo)").in("id", d.lineas),
    supabase.from("categorias").select("id, tipo").eq("id", d.categoria_id).maybeSingle(),
  ]);
  if (!categoria) return { error: "Categoría no encontrada" };
  const pendientes = (lineas ?? []).filter((l) => l.estado === "pendiente");
  if (!pendientes.length) return { error: "Las líneas ya no están pendientes" };
  if (pendientes.some((l) => (Number(l.monto) > 0 ? "ingreso" : "egreso") !== categoria.tipo)) {
    return { error: `La categoría es de ${categoria.tipo === "ingreso" ? "ingresos" : "egresos"}: elegí solo líneas de ese tipo` };
  }

  let hechas = 0;
  for (const l of pendientes) {
    const cuenta = l.cuenta as unknown as { nombre: string; tipo: string };
    const monto = Number(l.monto);
    const { data: t, error } = await supabase
      .from("transacciones")
      .insert({
        empresa: d.empresa,
        tipo: monto > 0 ? "ingreso" : "egreso",
        monto: Math.abs(monto),
        fecha: l.fecha,
        descripcion: (d.lineas.length === 1 && d.descripcion ? d.descripcion : l.concepto || "Movimiento bancario").slice(0, 200),
        categoria_id: d.categoria_id,
        medio_pago: cuenta.tipo === "billetera" ? "mercado_pago" : cuenta.tipo === "efectivo" ? "efectivo" : "transferencia",
        estado: "real",
        facturado: false,
        notas: `Desde el extracto de ${cuenta.nombre}`,
      })
      .select("id")
      .single();
    if (error || !t) continue;
    const { error: errorLinea } = await supabase.from("extracto_lineas").update({ estado: "conciliada", transaccion_id: t.id }).eq("id", l.id).eq("estado", "pendiente");
    if (errorLinea) {
      // Si la línea cambió mientras tanto, el movimiento recién creado no queda suelto.
      await supabase.from("transacciones").update({ eliminado_en: new Date().toISOString() }).eq("id", t.id);
      continue;
    }
    hechas++;
  }
  refresh();
  return hechas === pendientes.length ? { ok: `Se cargaron ${hechas} movimientos en Financiero` } : { error: `Se cargaron ${hechas} de ${pendientes.length}` };
}

/** Borra el extracto y sus líneas. Los movimientos de Financiero quedan (solo se pierde la conciliación). */
export async function borrarExtracto(id: string): Promise<Resultado> {
  await exigirPermiso("financiero", "editar");
  if (!z.uuid().safeParse(id).success) return { error: "Inválido" };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("extractos").select("archivo_path").eq("id", id).maybeSingle();
  const { error } = await supabase.from("extractos").delete().eq("id", id);
  if (error) return { error: "No se pudo borrar el extracto" };
  if (data?.archivo_path) await crearClienteAdmin().storage.from("extractos").remove([data.archivo_path]);
  refresh();
  return {};
}
