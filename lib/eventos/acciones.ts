"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { exigirAdmin, exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { parsearMonto } from "@/lib/formato";
import { EMPRESAS } from "@/lib/empresas";
import { ESTADOS_EVENTO } from "./tipos";
import { PLANILLA_VACIA, esquemaPlanilla, type Planilla } from "./planilla";
import { planillaDesdeMovimientos } from "./desde-movimientos";

export type EstadoFormularioEvento = { error?: string; valores?: Record<string, string> };

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const esquemaEvento = z.object({
  empresa: z.enum(EMPRESAS, "Elegí la empresa"),
  nombre: z.string().trim().min(1, "Falta el nombre").max(120),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  lugar: textoOpcional(200),
  estado: z.enum(ESTADOS_EVENTO, "Estado inválido"),
  presupuesto: z.string(),
  notas: textoOpcional(1000),
});

/** Crea (id = null) o edita un evento y vuelve a su pantalla. */
export async function guardarEvento(
  id: string | null,
  _previo: EstadoFormularioEvento,
  formData: FormData,
): Promise<EstadoFormularioEvento> {
  await exigirPermiso("eventos", "editar");
  const valores = Object.fromEntries(
    [...formData.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$")),
  ) as Record<string, string>;

  const datos = esquemaEvento.safeParse(valores);
  if (!datos.success) {
    return { error: datos.error.issues[0].message, valores };
  }

  let presupuesto: number | null = null;
  if (datos.data.presupuesto.trim()) {
    presupuesto = parsearMonto(datos.data.presupuesto);
    if (presupuesto === null) {
      return { error: "Presupuesto inválido. Ejemplo: 5.000.000", valores };
    }
  }

  const fila = { ...datos.data, presupuesto };
  const supabase = await crearClienteServidor();
  const { data, error } = id
    ? await supabase.from("eventos").update(fila).eq("id", id).select("id")
    : await supabase.from("eventos").insert(fila).select("id");

  if (error || !data?.length) {
    return { error: "No se pudo guardar el evento", valores };
  }
  // Los movimientos del evento van al financiero de la empresa del evento.
  if (id) await supabase.from("transacciones").update({ empresa: fila.empresa }).eq("evento_id", id).neq("empresa", fila.empresa);

  redirect(`/eventos/${data[0].id}`);
}

/** Guarda la planilla entera del evento. */
export async function guardarPlanillaEvento(eventoId: string, datos: unknown): Promise<{ error?: string }> {
  await exigirPermiso("eventos", "editar");
  if (!/^[0-9a-f-]{36}$/i.test(eventoId)) return { error: "Evento inválido" };
  const validos = esquemaPlanilla.safeParse(datos);
  if (!validos.success) return { error: "Datos inválidos: revisá los montos" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("planillas_evento").upsert({ evento_id: eventoId, datos: validos.data }, { onConflict: "evento_id" });
  return error ? { error: "No se pudo guardar la planilla" } : {};
}

/**
 * Arma la planilla con los movimientos del evento en Financiero (ingresos y
 * gastos por sector). Conserva la alícuota, las entradas y las notas de `base`.
 * No guarda: la pantalla la muestra y se guarda con "Guardar planilla".
 */
export async function armarPlanillaDesdeMovimientos(eventoId: string, base: unknown): Promise<{ planilla?: Planilla; error?: string }> {
  await exigirPermiso("eventos", "editar");
  if (!/^[0-9a-f-]{36}$/i.test(eventoId)) return { error: "Evento inválido" };
  const actual = esquemaPlanilla.safeParse(base);
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("transacciones")
    .select("tipo, monto, iva, descripcion, contraparte, estado, facturado, categoria:categorias(nombre)")
    .eq("evento_id", eventoId)
    .is("eliminado_en", null)
    .order("fecha", { nullsFirst: false });
  if (error) return { error: "No se pudieron leer los movimientos" };
  const movimientos = (data ?? []).map((t) => ({
    ...t,
    monto: Number(t.monto),
    iva: t.iva === null ? null : Number(t.iva),
    categoria: t.categoria as unknown as { nombre: string },
  }));
  return { planilla: planillaDesdeMovimientos(movimientos, actual.success ? actual.data : PLANILLA_VACIA) };
}

/** Borra el evento (solo administradores): sus movimientos quedan, sin evento. */
export async function borrarEvento(id: string): Promise<{ error?: string }> {
  await exigirAdmin();
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("borrar_evento", { p_id: id });
  if (error) return { error: "No se pudo borrar el evento" };
  redirect("/eventos");
}
