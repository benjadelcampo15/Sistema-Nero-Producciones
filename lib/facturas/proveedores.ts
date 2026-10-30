"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { cuitValido } from "@/lib/cuit";

export type EstadoProveedor = { error?: string; ok?: string; id?: string; valores?: Record<string, string> };

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const esquema = z.object({
  razon_social: z.string().trim().min(1, "Falta la razón social").max(200),
  cuit: z
    .string()
    .optional()
    .transform((v) => (v ?? "").replace(/\D/g, "") || null)
    .refine((v) => v === null || cuitValido(v), "CUIT inválido"),
  contacto: opcional(120),
  telefono: opcional(40),
  email: z.union([z.email("Email inválido").trim(), z.literal("")]).optional().transform((v) => v || null),
  alias_cbu: opcional(60),
  notas: opcional(1000),
  // Sin el campo (otros formularios) no se toca; "" = las dos empresas.
  empresa: z.enum(["", "nero", "ruta"]).optional().transform((v) => (v === undefined ? undefined : v || null)),
});

export async function guardarProveedor(id: string | null, _previo: EstadoProveedor, formData: FormData): Promise<EstadoProveedor> {
  await exigirPermiso("facturas", "editar");
  const valores = Object.fromEntries([...formData.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$"))) as Record<string, string>;
  const datos = esquema.safeParse(valores);
  if (!datos.success) return { error: datos.error.issues[0].message, valores };
  const supabase = await crearClienteServidor();
  const { data, error } = id
    ? await supabase.from("proveedores").update(datos.data).eq("id", id).select("id")
    : await supabase.from("proveedores").insert(datos.data).select("id");
  if (error || !data?.length) return { error: error?.code === "23505" ? "Ya hay un proveedor con ese CUIT" : "No se pudo guardar", valores };
  refresh();
  return { ok: id ? "Proveedor actualizado" : "Proveedor agregado", id: data[0].id };
}

/** Borra un proveedor (sus facturas no se tocan: siguen teniendo el CUIT y la razón social). */
export async function borrarProveedor(id: string): Promise<{ error?: string }> {
  await exigirPermiso("facturas", "editar");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("proveedores").delete().eq("id", id).select("id");
  if (!data?.length) return { error: "No se pudo borrar el proveedor" };
  refresh();
  return {};
}
