"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { parsearMonto } from "@/lib/formato";
import { ESTADOS_MOVIMIENTO, MEDIOS_PAGO, TIPOS } from "./tipos";

export type EstadoFormulario = {
  error?: string;
  ok?: string;
  /** Lo que el usuario cargó, para no perderlo cuando hay un error (React resetea el form). */
  valores?: Record<string, string>;
};

function valoresDe(formData: FormData) {
  return Object.fromEntries(
    [...formData.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$")),
  ) as Record<string, string>;
}

const textoOpcional = z
  .string()
  .trim()
  .max(500)
  .transform((v) => v || null);

const esquemaTransaccion = z.object({
  tipo: z.enum(TIPOS, "Elegí si es ingreso o egreso"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  monto: z.string(),
  descripcion: z.string().trim().min(1, "Falta la descripción").max(200),
  categoria_id: z.uuid("Elegí una categoría"),
  evento_id: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  contraparte: textoOpcional,
  medio_pago: z.enum(MEDIOS_PAGO, "Elegí el medio de pago"),
  estado: z.enum(ESTADOS_MOVIMIENTO, "Elegí el estado"),
  // Casilla: llega "on" si está marcada y no llega si no.
  facturado: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  iva: z.string().optional().default(""),
  iibb: z.string().optional().default(""),
  notas: textoOpcional,
});

/** Solo se vuelve a pantallas propias (evita redirecciones a sitios externos). */
function destinoSeguro(valor: FormDataEntryValue | null) {
  const texto = typeof valor === "string" ? valor : "";
  return /^\/(financiero|eventos)(\/[\w-]*)*(\?[\w=&%.+-]*)?$/.test(texto) ? texto : "/financiero";
}

/** Crea (id = null) o edita una transacción. La base valida permisos con RLS. */
export async function guardarTransaccion(
  id: string | null,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuario = await obtenerUsuario();
  const valores = valoresDe(formData);

  const datos = esquemaTransaccion.safeParse(Object.fromEntries(formData));
  if (!datos.success) {
    return { error: datos.error.issues[0].message, valores };
  }
  const monto = parsearMonto(datos.data.monto);
  if (monto === null || monto <= 0) {
    return { error: "Monto inválido. Ejemplos válidos: 15000 · 15.000 · 15.000,50", valores };
  }

  const conEvento = datos.data.evento_id !== null;
  if (!puede(usuario, "financiero", "editar") && !(conEvento && puede(usuario, "eventos", "editar"))) {
    return { error: "No tenés permiso para cargar este movimiento", valores };
  }

  const iva = datos.data.iva.trim() ? parsearMonto(datos.data.iva) : null;
  const iibb = datos.data.iibb.trim() ? parsearMonto(datos.data.iibb) : null;
  if ((datos.data.iva.trim() && iva === null) || (datos.data.iibb.trim() && iibb === null)) {
    return { error: "IVA o IIBB inválido", valores };
  }

  const fila = { ...datos.data, monto, iva, iibb };
  const supabase = await crearClienteServidor();
  // Con .select() se detecta cuando RLS no deja escribir (no da error, afecta 0 filas).
  const { data: escritas, error } = id
    ? await supabase.from("transacciones").update(fila).eq("id", id).is("eliminado_en", null).select("id")
    : await supabase.from("transacciones").insert(fila).select("id");

  if (error || !escritas?.length) {
    return {
      error: error?.message.includes("categoría")
        ? "La categoría no corresponde al tipo de movimiento"
        : "No se pudo guardar el movimiento",
      valores,
    };
  }

  redirect(destinoSeguro(formData.get("volver_a")));
}

export async function eliminarTransaccion(id: string): Promise<EstadoFormulario> {
  await obtenerUsuario();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("transacciones")
    .update({ eliminado_en: new Date().toISOString() })
    .eq("id", id)
    .is("eliminado_en", null)
    .select("id");

  if (error || !data?.length) {
    return { error: "No se pudo eliminar el movimiento" };
  }
  refresh();
  return { ok: "Movimiento eliminado" };
}

const esquemaCategoria = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre").max(60),
  tipo: z.enum(TIPOS, "Elegí el tipo"),
});

export async function crearCategoria(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await obtenerUsuario();
  const datos = esquemaCategoria.safeParse(Object.fromEntries(formData));
  if (!datos.success) {
    return { error: datos.error.issues[0].message };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("categorias").insert(datos.data);
  if (error) {
    return {
      error: error.code === "23505" ? "Ya existe una categoría con ese nombre" : "No se pudo crear la categoría",
    };
  }
  refresh();
  return { ok: "Categoría creada" };
}

export async function cambiarEstadoCategoria(id: string, activa: boolean): Promise<EstadoFormulario> {
  await obtenerUsuario();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("categorias").update({ activa }).eq("id", id).select("id");
  if (error || !data?.length) {
    return { error: "No se pudo actualizar la categoría" };
  }
  refresh();
  return {};
}
