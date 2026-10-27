"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hoy, parsearMonto } from "@/lib/formato";
import { DIAS_AVISO, ESTADOS, sumarDias, type EstadoCheque, type TipoCheque } from "./tipos";
import { EMPRESAS } from "@/lib/empresas";

export type EstadoFormCheque = { error?: string; ok?: string; valores?: Record<string, string> };

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const fechaOpcional = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
  .optional()
  .transform((v) => v || null);

const esquema = z.object({
  empresa: z.enum(EMPRESAS, "Elegí la empresa"),
  contraparte: z.string().trim().min(1, "Falta a quién se le dio / quién lo dio").max(200),
  cuit: textoOpcional(20),
  banco: textoOpcional(100),
  numero: textoOpcional(40),
  monto: z.string().min(1, "Falta el monto"),
  fecha_emision: fechaOpcional,
  fecha_pago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Falta la fecha de pago"),
  electronico: z.string().optional(),
  evento_id: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || null),
  notas: textoOpcional(1000),
});

export async function guardarCheque(
  id: string | null,
  tipo: TipoCheque,
  _previo: EstadoFormCheque,
  formData: FormData,
): Promise<EstadoFormCheque> {
  await exigirPermiso("cheques", "editar");
  const valores = Object.fromEntries(
    [...formData.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$")),
  ) as Record<string, string>;

  const datos = esquema.safeParse(valores);
  if (!datos.success) return { error: datos.error.issues[0].message, valores };
  const monto = parsearMonto(datos.data.monto);
  if (monto === null || monto <= 0) return { error: "Monto inválido", valores };
  const { fecha_emision, fecha_pago } = datos.data;
  if (fecha_emision && fecha_emision > fecha_pago) return { error: "La fecha de pago no puede ser anterior a la de emisión", valores };

  const fila = { ...datos.data, monto, electronico: datos.data.electronico === "on" };
  const supabase = await crearClienteServidor();
  const { data, error } = id
    ? await supabase
        .from("cheques")
        // Si se corrió la fecha de pago más adelante, el aviso se vuelve a mandar.
        .update(fecha_pago > sumarDias(hoy(), DIAS_AVISO) ? { ...fila, aviso_enviado_en: null } : fila)
        .eq("id", id)
        .select("id")
    : await supabase.from("cheques").insert({ ...fila, tipo }).select("id");
  if (error || !data?.length) return { error: "No se pudo guardar el cheque", valores };
  refresh();
  return { ok: id ? "Cheque actualizado" : "Cheque agregado" };
}

export async function cambiarEstadoCheque(id: string, tipo: TipoCheque, estado: EstadoCheque): Promise<{ error?: string }> {
  await exigirPermiso("cheques", "editar");
  if (!ESTADOS[tipo].some((e) => e.id === estado)) return { error: "Estado inválido" };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("cheques").update({ estado }).eq("id", id).eq("tipo", tipo).select("id");
  if (!data?.length) return { error: "No se pudo cambiar el estado" };
  refresh();
  return {};
}

/** Solo para cargas equivocadas: un cheque real que no va se anula. */
export async function borrarCheque(id: string): Promise<{ error?: string }> {
  await exigirPermiso("cheques", "editar");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("cheques").delete().eq("id", id).select("id");
  if (!data?.length) return { error: "No se pudo borrar el cheque" };
  refresh();
  return {};
}
