"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { EMPRESAS } from "@/lib/empresas";
import { sumar } from "@/lib/formato";
import { CLAVES_IMPUTACION, codigoPadre } from "./tipos";

export type EstadoFormContable = { error?: string; ok?: string; valores?: Record<string, string> };

const valoresDe = (formData: FormData) =>
  Object.fromEntries([...formData.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$"))) as Record<string, string>;

const esquemaCuenta = z.object({
  codigo: z
    .string()
    .trim()
    .regex(/^[1-5](\.[0-9]{1,3})*$/, "El código va con números separados por puntos y empieza con 1 a 5 (ej.: 5.2.09)"),
  nombre: z.string().trim().min(1, "Falta el nombre").max(120),
  imputable: z.string().optional().transform((v) => v === "on"),
});

/** Alta de una cuenta (el código no se cambia después) o cambio de nombre / imputable. */
export async function guardarCuentaContable(id: string | null, _previo: EstadoFormContable, formData: FormData): Promise<EstadoFormContable> {
  await exigirPermiso("financiero", "editar");
  const valores = valoresDe(formData);
  const datos = esquemaCuenta.safeParse(valores);
  if (!datos.success) return { error: datos.error.issues[0].message, valores };
  const { codigo, nombre, imputable } = datos.data;
  const supabase = await crearClienteServidor();

  if (id) {
    const { data: actual } = await supabase.from("cuentas_contables").select("id, codigo, imputable").eq("id", id).maybeSingle();
    if (!actual) return { error: "La cuenta no existe", valores };
    if (actual.imputable !== imputable) {
      if (!imputable) {
        const usada = await cuentaUsada(id);
        if (usada) return { error: `No puede dejar de ser imputable: ${usada}`, valores };
      } else {
        const { count } = await supabase.from("cuentas_contables").select("id", { count: "exact", head: true }).like("codigo", `${actual.codigo}.%`);
        if (count) return { error: "Tiene subcuentas: un rubro no puede ser imputable", valores };
      }
    }
    const { data, error } = await supabase.from("cuentas_contables").update({ nombre, imputable }).eq("id", id).select("id");
    if (error || !data?.length) return { error: "No se pudo guardar la cuenta", valores };
    refresh();
    return { ok: "Cuenta actualizada" };
  }

  const padre = codigoPadre(codigo);
  if (padre) {
    const { data: rubro } = await supabase.from("cuentas_contables").select("id, imputable").eq("codigo", padre).maybeSingle();
    if (!rubro) return { error: `No existe el rubro ${padre}: creálo primero`, valores };
    if (rubro.imputable) return { error: `${padre} es una cuenta imputable: para tener subcuentas tiene que ser un rubro`, valores };
  }
  const { error } = await supabase.from("cuentas_contables").insert({ codigo, nombre, imputable });
  if (error) return { error: error.code === "23505" ? `Ya existe una cuenta con el código ${codigo}` : "No se pudo crear la cuenta", valores };
  refresh();
  return { ok: `Cuenta ${codigo} creada` };
}

/** Por qué una cuenta no se puede desactivar o volver rubro (null: no está en uso). */
async function cuentaUsada(id: string) {
  const supabase = await crearClienteServidor();
  const [{ count: lineas }, { count: categorias }, { count: bancos }, { count: claves }] = await Promise.all([
    supabase.from("asiento_lineas").select("id", { count: "exact", head: true }).eq("cuenta_id", id),
    supabase.from("categorias").select("id", { count: "exact", head: true }).eq("cuenta_contable_id", id),
    supabase.from("cuentas_bancarias").select("id", { count: "exact", head: true }).eq("cuenta_contable_id", id),
    supabase.from("imputaciones").select("clave", { count: "exact", head: true }).eq("cuenta_id", id),
  ]);
  if (lineas) return "tiene asientos manuales";
  if (categorias || bancos || claves) return "está asignada en la imputación automática";
  return null;
}

export async function cambiarEstadoCuentaContable(id: string, activa: boolean): Promise<{ error?: string }> {
  await exigirPermiso("financiero", "editar");
  if (!activa) {
    const usada = await cuentaUsada(id);
    if (usada) return { error: `No se puede desactivar: ${usada}` };
  }
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("cuentas_contables").update({ activa }).eq("id", id).select("id");
  if (!data?.length) return { error: "No se pudo actualizar la cuenta" };
  refresh();
  return {};
}

/** Guarda la imputación: campos cat_<id>, banco_<id> y clave_<clave> con el id de la cuenta. */
export async function guardarImputacion(_previo: EstadoFormContable, formData: FormData): Promise<EstadoFormContable> {
  await exigirPermiso("financiero", "editar");
  const valores = valoresDe(formData);
  const supabase = await crearClienteServidor();
  const { data: cuentas } = await supabase.from("cuentas_contables").select("id").eq("imputable", true).eq("activa", true);
  const validas = new Set((cuentas ?? []).map((c) => c.id));
  const uuid = /^[0-9a-f-]{36}$/i;

  const categorias: { id: string; cuenta: string | null }[] = [];
  const bancos: { id: string; cuenta: string | null }[] = [];
  const claves: { clave: string; cuenta_id: string }[] = [];
  for (const [campo, valor] of Object.entries(valores)) {
    const cuenta = valor || null;
    if (cuenta && !validas.has(cuenta)) return { error: "Hay una cuenta que no es imputable o está desactivada", valores };
    if (campo.startsWith("cat_") && uuid.test(campo.slice(4))) categorias.push({ id: campo.slice(4), cuenta });
    else if (campo.startsWith("banco_") && uuid.test(campo.slice(6))) bancos.push({ id: campo.slice(6), cuenta });
    else if (campo.startsWith("clave_")) {
      const clave = campo.slice(6);
      if (!CLAVES_IMPUTACION.some((c) => c.clave === clave)) continue;
      if (!cuenta) return { error: "Todas las cuentas de medios de pago, pendientes, IVA y “a clasificar” son obligatorias", valores };
      claves.push({ clave, cuenta_id: cuenta });
    }
  }

  const resultados = await Promise.all([
    ...categorias.map((c) => supabase.from("categorias").update({ cuenta_contable_id: c.cuenta }).eq("id", c.id)),
    ...bancos.map((b) => supabase.from("cuentas_bancarias").update({ cuenta_contable_id: b.cuenta }).eq("id", b.id)),
    ...(claves.length ? [supabase.from("imputaciones").upsert(claves)] : []),
  ]);
  if (resultados.some((r) => r.error)) return { error: "No se pudo guardar todo: revisá y volvé a guardar", valores };
  refresh();
  return { ok: "Imputación guardada" };
}

const esquemaAsiento = z.object({
  empresa: z.enum(EMPRESAS),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Falta la fecha"),
  descripcion: z.string().trim().min(1, "Falta la descripción").max(300),
  lineas: z
    .array(
      z.object({
        cuenta_id: z.uuid("Elegí la cuenta de cada línea"),
        debe: z.number().min(0).max(1e12),
        haber: z.number().min(0).max(1e12),
        detalle: z.string().trim().max(200).nullable(),
      }),
    )
    .min(2, "El asiento necesita al menos dos líneas"),
});
export type DatosAsiento = z.input<typeof esquemaAsiento>;

export async function guardarAsiento(id: string | null, datos: DatosAsiento): Promise<{ error?: string; id?: string }> {
  await exigirPermiso("financiero", "editar");
  const r = esquemaAsiento.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0].message };
  const lineas = r.data.lineas.map((l) => ({ ...l, debe: Math.round(l.debe * 100) / 100, haber: Math.round(l.haber * 100) / 100 }));
  if (lineas.some((l) => (l.debe > 0) === (l.haber > 0))) return { error: "Cada línea va con un importe en el debe o en el haber (no en los dos)" };
  const debe = sumar(lineas.map((l) => l.debe));
  const haber = sumar(lineas.map((l) => l.haber));
  if (debe !== haber) return { error: "El asiento no balancea: el total del debe tiene que ser igual al del haber" };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("guardar_asiento", {
    p_id: id,
    p_asiento: { empresa: r.data.empresa, fecha: r.data.fecha, descripcion: r.data.descripcion },
    p_lineas: lineas,
  });
  if (error) return { error: error.message.startsWith("El asiento") || error.message.startsWith("Hay una cuenta") ? error.message : "No se pudo guardar el asiento" };
  refresh();
  return { id: data as string };
}

export async function borrarAsiento(id: string): Promise<{ error?: string }> {
  await exigirPermiso("financiero", "editar");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("asientos").delete().eq("id", id).select("id");
  if (!data?.length) return { error: "No se pudo borrar el asiento" };
  return {};
}
