"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { cuitValido } from "@/lib/cuit";
import { CONDICIONES_IVA } from "@/lib/facturar/tipos";

export type EstadoCliente = { error?: string; ok?: string; id?: string; valores?: Record<string, string> };

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const esquema = z.object({
  razon_social: z.string().trim().min(1, "Falta la razón social").max(200),
  doc_tipo: z.coerce.number().refine((n) => [80, 96, 99].includes(n), "Tipo de documento inválido"),
  doc_nro: z.string().optional(),
  condicion_iva: z.coerce.number().refine((n) => CONDICIONES_IVA.some((c) => c.id === n), "Condición de IVA inválida"),
  email: z.union([z.email("Email inválido").trim(), z.literal("")]).optional().transform((v) => v || null),
  telefono: textoOpcional(40),
  domicilio: textoOpcional(200),
  notas: textoOpcional(1000),
  // Sin el campo (otros formularios) no se toca; "" = las dos empresas.
  empresa: z.enum(["", "nero", "ruta"]).optional().transform((v) => (v === undefined ? undefined : v || null)),
});

async function exigirEdicion() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturar", "editar") && !puede(usuario, "presupuestos", "editar")) {
    throw new Error("No tenés permiso para editar clientes");
  }
}

/** Valida y normaliza el documento según su tipo. */
export async function normalizarDocumento(docTipo: number, docNro: string | undefined): Promise<string | { error: string }> {
  const nro = docTipo === 99 ? "0" : (docNro ?? "").replace(/\D/g, "");
  if (docTipo === 80 && !cuitValido(nro)) return { error: "CUIT inválido" };
  if (docTipo === 96 && !/^\d{7,8}$/.test(nro)) return { error: "DNI inválido" };
  return nro;
}

export async function guardarCliente(id: string | null, _previo: EstadoCliente, formData: FormData): Promise<EstadoCliente> {
  await exigirEdicion();
  const valores = Object.fromEntries(
    [...formData.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$")),
  ) as Record<string, string>;

  const datos = esquema.safeParse(valores);
  if (!datos.success) return { error: datos.error.issues[0].message, valores };
  const doc = await normalizarDocumento(datos.data.doc_tipo, datos.data.doc_nro);
  if (typeof doc !== "string") return { error: doc.error, valores };

  const fila = { ...datos.data, doc_nro: doc };
  const supabase = await crearClienteServidor();
  const { data, error } = id
    ? await supabase.from("clientes").update(fila).eq("id", id).select("id")
    : await supabase.from("clientes").insert(fila).select("id");
  if (error || !data?.length) {
    return { error: error?.code === "23505" ? "Ya hay un cliente con ese CUIT/DNI" : "No se pudo guardar el cliente", valores };
  }
  refresh();
  return { ok: id ? "Cliente actualizado" : "Cliente agregado", id: data[0].id };
}

export async function cambiarEstadoCliente(id: string, activo: boolean): Promise<{ error?: string }> {
  await exigirEdicion();
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("clientes").update({ activo }).eq("id", id).select("id");
  if (!data?.length) return { error: "No se pudo actualizar el cliente" };
  refresh();
  return {};
}

/** Borra un cliente sin facturas; si tiene facturas emitidas, solo se puede desactivar. */
export async function borrarCliente(id: string): Promise<{ error?: string }> {
  await exigirEdicion();
  const supabase = await crearClienteServidor();
  const { count } = await supabase.from("comprobantes_emitidos").select("id", { count: "exact", head: true }).eq("cliente_id", id);
  if (count) return { error: `Tiene ${count} factura${count === 1 ? "" : "s"} emitida${count === 1 ? "" : "s"}: no se puede borrar, desactivalo.` };
  const { error } = await crearClienteAdmin().from("clientes").delete().eq("id", id);
  if (error) return { error: "No se pudo borrar el cliente" };
  refresh();
  return {};
}
