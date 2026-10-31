"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BILLETES, totalBilletes } from "./cajas";

const esUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const monto = z.number().min(0, "Los montos no pueden ser negativos").max(1e12);

export async function crearCaja(eventoId: string, nombre: string): Promise<{ error?: string }> {
  await exigirPermiso("eventos", "editar");
  const n = nombre.trim().slice(0, 60);
  if (!esUuid(eventoId) || !n) return { error: "Poné el nombre de la caja (ej. Barra 1)" };
  const supabase = await crearClienteServidor();
  const { data: actuales } = await supabase.from("cajas_evento").select("orden").eq("evento_id", eventoId);
  const { error } = await supabase
    .from("cajas_evento")
    .insert({ evento_id: eventoId, nombre: n, orden: Math.max(0, ...(actuales ?? []).map((c) => c.orden)) + 1 });
  if (error) return { error: "No se pudo agregar la caja" };
  refresh();
  return {};
}

const esquemaCaja = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre de la caja").max(60),
  responsable: z.string().trim().max(80).transform((v) => v || null),
  monto_inicial: monto,
  monto_fudo: monto.nullable(),
  efectivo_final: monto.nullable(),
  // Si viene, el efectivo final es la suma de los billetes.
  billetes: z.record(z.string(), z.number().int().min(0).max(1e6)).nullable(),
  fudo_posnet: monto.nullable(),
  posnet_cierre: monto.nullable(),
  notas: z.string().trim().max(500).transform((v) => v || null),
  /** true: la cierra · false: la reabre · undefined: no cambia. */
  cerrar: z.boolean().optional(),
});

export async function guardarCaja(id: string, datos: z.input<typeof esquemaCaja>): Promise<{ error?: string }> {
  await exigirPermiso("eventos", "editar");
  const r = esquemaCaja.safeParse(datos);
  if (!esUuid(id) || !r.success) return { error: r.success ? "Caja inválida" : r.error.issues[0].message };
  const { cerrar, billetes, ...fila } = r.data;
  // Solo billetes conocidos y con cantidad.
  const conteo = billetes ? Object.fromEntries(BILLETES.map((d) => [String(d), billetes[String(d)] ?? 0]).filter(([, n]) => (n as number) > 0)) : null;
  const efectivo = conteo ? totalBilletes(conteo) : fila.efectivo_final;
  if (cerrar && efectivo === null) return { error: "Para cerrar la caja cargá el efectivo contado" };
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("cajas_evento")
    .update({
      ...fila,
      billetes: conteo,
      efectivo_final: efectivo,
      ...(cerrar === undefined ? {} : { cerrada_en: cerrar ? new Date().toISOString() : null }),
    })
    .eq("id", id)
    .select("id");
  if (!data?.length) return { error: "No se pudo guardar la caja" };
  refresh();
  return {};
}

export async function borrarCaja(id: string): Promise<{ error?: string }> {
  await exigirPermiso("eventos", "editar");
  if (!esUuid(id)) return { error: "Caja inválida" };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("cajas_evento").delete().eq("id", id).select("id");
  if (!data?.length) return { error: "No se pudo borrar la caja" };
  refresh();
  return {};
}
