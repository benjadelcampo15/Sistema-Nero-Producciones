import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Cheque, TipoCheque } from "./tipos";

export const CAMPOS_CHEQUE =
  "id, tipo, estado, electronico, numero, banco, monto, fecha_emision, fecha_pago, contraparte, cuit, evento_id, notas, aviso_enviado_en, evento:eventos(id, nombre)";

export async function listarCheques(tipo: TipoCheque) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("cheques")
    .select(CAMPOS_CHEQUE)
    .eq("tipo", tipo)
    .order("fecha_pago", { ascending: true })
    .limit(500);
  if (error) throw new Error(`No se pudieron leer los cheques: ${error.message}`);
  return ((data ?? []) as unknown as Cheque[]).map((c) => ({ ...c, monto: Number(c.monto) }));
}
