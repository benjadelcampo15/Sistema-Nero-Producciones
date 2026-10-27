"use server";

import { refresh } from "next/cache";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { EMPRESAS, type Empresa } from "@/lib/empresas";
import { esquemaMes } from "./tipos";

/** Guarda un mes entero de la planilla de objetivos. */
export async function guardarMes(empresa: Empresa, anio: number, mes: number, datos: unknown): Promise<{ error?: string }> {
  await exigirPermiso("objetivos", "editar");
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) return { error: "Mes inválido" };
  if (!EMPRESAS.includes(empresa)) return { error: "Empresa inválida" };
  const validos = esquemaMes.safeParse(datos);
  if (!validos.success) return { error: "Datos inválidos: revisá los montos" };
  // Filas sin detalle ni monto no se guardan.
  const limpio = {
    ...validos.data,
    ...Object.fromEntries(
      (["fees", "eventos", "salarios", "creators", "fijos", "variables"] as const).map((k) => [k, validos.data[k].filter((i) => i.detalle || i.monto)]),
    ),
    distribucion: validos.data.distribucion.filter((d) => d.detalle || d.porcentaje),
  };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("objetivos_meses").upsert({ empresa, anio, mes, datos: limpio }, { onConflict: "empresa,anio,mes" });
  if (error) return { error: "No se pudo guardar" };
  refresh();
  return {};
}
