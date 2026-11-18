"use server";

import { guardarConVersion, type Version } from "@/lib/version";
import { refresh } from "next/cache";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { EMPRESAS, type Empresa } from "@/lib/empresas";
import { esquemaMes } from "./tipos";

/** Guarda un mes entero de la planilla de objetivos. */
export async function guardarMes(empresa: Empresa, anio: number, mes: number, datos: unknown, version?: Version, forzar = false): Promise<{ error?: string; conflicto?: boolean; version?: Version }> {
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
  // Si otra persona guardó el mes mientras se editaba, no se pisa: se avisa.
  const g = await guardarConVersion(supabase, "objetivos_meses", { empresa, anio, mes }, { datos: limpio }, version, forzar);
  if (g.conflicto) return { conflicto: true, error: "Otra persona guardó cambios en este mes mientras editabas" };
  if (g.error) return { error: "No se pudo guardar" };
  refresh();
  return { version: g.version };
}
