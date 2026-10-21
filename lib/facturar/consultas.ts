import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Comprobante } from "./tipos";

const CAMPOS =
  "id, entorno, estado, tipo_cbte, punto_venta, numero, fecha, concepto, doc_tipo, doc_nro, receptor_nombre, condicion_iva_receptor, items, neto, iva, total, cae, cae_vto, mensajes, transaccion_id, creado_en, evento:eventos(id, nombre)";

function normalizar(c: Comprobante): Comprobante {
  return { ...c, neto: Number(c.neto), iva: Number(c.iva), total: Number(c.total), numero: c.numero === null ? null : Number(c.numero) };
}

export async function listarComprobantes() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("comprobantes_emitidos").select(CAMPOS).order("creado_en", { ascending: false }).limit(300);
  if (error) throw new Error(`No se pudieron leer los comprobantes: ${error.message}`);
  return ((data ?? []) as unknown as Comprobante[]).map(normalizar);
}

export async function obtenerComprobante(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("comprobantes_emitidos").select(CAMPOS).eq("id", id).maybeSingle();
  return data ? normalizar(data as unknown as Comprobante) : null;
}
