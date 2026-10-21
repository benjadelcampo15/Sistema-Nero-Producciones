"use server";

import { z } from "zod";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { hoy } from "@/lib/formato";
import { venceEl } from "./tipos";

/**
 * Acción del cliente desde el link público: aceptar o rechazar.
 * No hay sesión: se valida el token y que el presupuesto siga vigente.
 */
export async function responderPresupuesto(
  token: string,
  respuesta: "aceptado" | "rechazado",
  _previo: { error?: string; ok?: boolean },
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return { error: "Link inválido" };
  const nombre = z.string().trim().min(2, "Escribí tu nombre").max(120).safeParse(formData.get("nombre"));
  if (!nombre.success) return { error: nombre.error.issues[0].message };

  const admin = crearClienteAdmin();
  const { data: p } = await admin.from("presupuestos").select("id, estado, fecha, validez_dias").eq("token", token).maybeSingle();
  if (!p || p.estado === "borrador") return { error: "Link inválido" };
  if (p.estado !== "enviado") return { error: "Este presupuesto ya fue respondido" };
  if (venceEl(p) < hoy()) return { error: "Este presupuesto está vencido. Pedinos uno actualizado." };

  const { error } = await admin
    .from("presupuestos")
    .update({ estado: respuesta, respondido_en: new Date().toISOString(), respondido_por: nombre.data })
    .eq("id", p.id)
    .eq("estado", "enviado");
  if (error) return { error: "No se pudo registrar la respuesta. Probá de nuevo." };
  return { ok: true };
}
