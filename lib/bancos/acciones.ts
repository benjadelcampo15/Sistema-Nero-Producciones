"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { parsearMonto } from "@/lib/formato";
import { TIPOS_CUENTA } from "./tipos";

export type EstadoFormBancos = { error?: string; ok?: string; valores?: Record<string, string> };

const esquemaCuenta = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre de la cuenta").max(100),
  banco: z.string().trim().max(100).optional().transform((v) => v || null),
  tipo: z.enum(TIPOS_CUENTA.map((t) => t.id) as [string, ...string[]]),
  descubierto: z.string().optional(),
});

const valoresDe = (formData: FormData) =>
  Object.fromEntries([...formData.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$"))) as Record<string, string>;

/** "-1.234,56" → -1234.56 (el saldo puede ser negativo si se usa el descubierto). */
function montoConSigno(texto: string) {
  const limpio = texto.trim();
  const negativo = /^-/.test(limpio);
  const valor = parsearMonto(limpio.replace(/^-/, ""));
  return valor === null ? null : negativo ? -valor : valor;
}

export async function guardarCuenta(id: string | null, _previo: EstadoFormBancos, formData: FormData): Promise<EstadoFormBancos> {
  await exigirPermiso("financiero", "editar");
  const valores = valoresDe(formData);
  const datos = esquemaCuenta.safeParse(valores);
  if (!datos.success) return { error: datos.error.issues[0].message, valores };
  const descubierto = datos.data.descubierto?.trim() ? parsearMonto(datos.data.descubierto) : 0;
  if (descubierto === null) return { error: "Descubierto inválido", valores };

  const fila = { ...datos.data, descubierto };
  const supabase = await crearClienteServidor();
  const { data, error } = id
    ? await supabase.from("cuentas_bancarias").update(fila).eq("id", id).select("id")
    : await supabase.from("cuentas_bancarias").insert(fila).select("id");
  if (error || !data?.length) return { error: "No se pudo guardar la cuenta", valores };
  refresh();
  return { ok: id ? "Cuenta actualizada" : "Cuenta agregada" };
}

export async function cambiarEstadoCuenta(id: string, activa: boolean): Promise<{ error?: string }> {
  await exigirPermiso("financiero", "editar");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("cuentas_bancarias").update({ activa }).eq("id", id).select("id");
  if (!data?.length) return { error: "No se pudo actualizar la cuenta" };
  refresh();
  return {};
}

/** Guarda los saldos del día de cada cuenta (campos saldo_<id>; vacío = no se carga). */
export async function guardarSaldos(fecha: string, _previo: EstadoFormBancos, formData: FormData): Promise<EstadoFormBancos> {
  await exigirPermiso("financiero", "editar");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida" };
  const valores = valoresDe(formData);
  const filas: { cuenta_id: string; fecha: string; saldo: number }[] = [];
  for (const [campo, texto] of Object.entries(valores)) {
    const cuenta = /^saldo_([0-9a-f-]{36})$/i.exec(campo)?.[1];
    if (!cuenta || !texto.trim()) continue;
    const saldo = montoConSigno(texto);
    if (saldo === null) return { error: `Saldo inválido: “${texto}”`, valores };
    filas.push({ cuenta_id: cuenta, fecha, saldo });
  }
  if (!filas.length) return { error: "Cargá al menos un saldo", valores };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("saldos_bancarios").upsert(filas, { onConflict: "cuenta_id,fecha" });
  if (error) return { error: "No se pudieron guardar los saldos", valores };
  refresh();
  return { ok: `${filas.length} saldo${filas.length === 1 ? "" : "s"} guardado${filas.length === 1 ? "" : "s"}` };
}
