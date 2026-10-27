import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Empresa } from "@/lib/empresas";
import { MES_VACIO, esquemaMes, type DatosMes } from "./tipos";

/** Los meses cargados de un año (mes 1-12 → datos). */
export async function mesesDelAnio(empresa: Empresa, anio: number) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("objetivos_meses").select("mes, datos").eq("empresa", empresa).eq("anio", anio);
  if (error) throw new Error(`No se pudieron leer los objetivos: ${error.message}`);
  const meses = new Map<number, DatosMes>();
  for (const f of data ?? []) {
    const datos = esquemaMes.safeParse(f.datos);
    meses.set(f.mes, datos.success ? datos.data : MES_VACIO);
  }
  return meses;
}

/** Años que tienen algo cargado (para elegir). */
export async function aniosConDatos(empresa: Empresa) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("objetivos_meses").select("anio").eq("empresa", empresa).limit(1000);
  return [...new Set((data ?? []).map((f) => f.anio))].sort((a, b) => b - a);
}
