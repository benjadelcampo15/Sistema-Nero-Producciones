"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { PRIMER_PERIODO_AUTOMATICO, esquemaMesRuta, periodo } from "./ruta";
import { eventosRutaDelMes } from "./ruta-consultas";

type Resultado = { error?: string };

function periodoAutomatico(anio: number, mes: number) {
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) return null;
  const p = periodo(anio, mes);
  // Los meses anteriores son el histórico de la planilla: no se recalculan ni se editan.
  return p >= PRIMER_PERIODO_AUTOMATICO ? p : null;
}

async function estaCerrado(p: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("ruta_meses").select("cerrado").eq("periodo", p).maybeSingle();
  return data?.cerrado === true;
}

/** Guarda los datos de un mes automático (fees, porcentajes, gastos, one shots, repartos). */
export async function guardarMesRuta(anio: number, mes: number, datos: unknown): Promise<Resultado> {
  await exigirPermiso("objetivos", "editar");
  const p = periodoAutomatico(anio, mes);
  if (!p) return { error: "Ese mes es histórico: no se edita" };
  const validos = esquemaMesRuta.safeParse(datos);
  if (!validos.success) return { error: "Datos inválidos: revisá los importes y porcentajes" };
  if (await estaCerrado(p)) return { error: "El mes está cerrado: reabrilo para editarlo" };

  const d = validos.data;
  // Filas vacías no se guardan.
  const limpio = {
    ...d,
    gastos_fijos: d.gastos_fijos.filter((g) => g.concepto || g.monto),
    gastos_variables: d.gastos_variables.filter((g) => g.concepto || g.monto),
    one_shots: d.one_shots.map((o) => ({ ...o, asignaciones: o.asignaciones.filter((a) => a.monto) })),
    distribucion_mensual: d.distribucion_mensual.filter((r) => r.nombre || r.porcentaje),
    distribucion_variable: d.distribucion_variable.filter((r) => r.nombre || r.porcentaje),
  };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("ruta_meses").upsert({ periodo: p, modo: "automatico", datos: limpio }, { onConflict: "periodo" });
  if (error) return { error: "No se pudo guardar" };
  refresh();
  return {};
}

/** Cierra el mes: deja de editarse y la rentabilidad variable queda con los balances de hoy. */
export async function cerrarMesRuta(anio: number, mes: number): Promise<Resultado> {
  await exigirPermiso("objetivos", "editar");
  const p = periodoAutomatico(anio, mes);
  if (!p) return { error: "Mes inválido" };
  const eventos = await eventosRutaDelMes(anio, mes);
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("ruta_meses").update({ cerrado: true, eventos_al_cierre: eventos }).eq("periodo", p).select("id");
  if (error || !data?.length) return { error: "Guardá el mes antes de cerrarlo" };
  refresh();
  return {};
}

export async function reabrirMesRuta(anio: number, mes: number): Promise<Resultado> {
  await exigirPermiso("objetivos", "editar");
  const p = periodoAutomatico(anio, mes);
  if (!p) return { error: "Mes inválido" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("ruta_meses").update({ cerrado: false, eventos_al_cierre: null }).eq("periodo", p);
  if (error) return { error: "No se pudo reabrir" };
  refresh();
  return {};
}

const nombre = z.string().trim().min(1, "Falta el nombre").max(120);

/** Alta de un cliente de fees o de un colaborador (si ya existe con ese nombre, se reactiva). */
export async function crearPersonaRuta(tipo: "cliente" | "colaborador", valor: string): Promise<{ error?: string; persona?: { id: string; nombre: string; activo: boolean } }> {
  await exigirPermiso("objetivos", "editar");
  const n = nombre.safeParse(valor);
  if (!n.success) return { error: n.error.issues[0].message };
  const tabla = tipo === "cliente" ? "ruta_clientes" : "ruta_colaboradores";
  const supabase = await crearClienteServidor();
  const { data: existente } = await supabase.from(tabla).select("id, nombre").ilike("nombre", n.data).maybeSingle();
  if (existente) {
    await supabase.from(tabla).update({ activo: true }).eq("id", existente.id);
    return { persona: { ...existente, activo: true } };
  }
  const { data, error } = await supabase.from(tabla).insert({ nombre: n.data }).select("id, nombre, activo").single();
  if (error || !data) return { error: "No se pudo crear" };
  return { persona: data };
}

/** Baja (o alta) para los meses siguientes: los meses donde ya estaba lo conservan. */
export async function cambiarActivoPersonaRuta(tipo: "cliente" | "colaborador", id: string, activo: boolean): Promise<Resultado> {
  await exigirPermiso("objetivos", "editar");
  if (!z.uuid().safeParse(id).success) return { error: "Inválido" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from(tipo === "cliente" ? "ruta_clientes" : "ruta_colaboradores").update({ activo }).eq("id", id);
  return error ? { error: "No se pudo cambiar" } : {};
}
