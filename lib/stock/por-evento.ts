import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Empresa } from "@/lib/empresas";
import { listarDepositos, obtenerStock } from "./consultas";

export type EventoStock = { id: string; nombre: string; fecha: string; lugar: string | null; empresa: Empresa; estado: string; tipo: string };
export type ItemStockEvento = { producto_id: string; cantidad: number | null; nota: string | null };

/** Eventos (no cancelados) con cuántos productos tiene cada uno en su lista de stock. */
export async function eventosConStock() {
  const supabase = await crearClienteServidor();
  const [{ data: eventos }, { data: items }] = await Promise.all([
    supabase.from("eventos").select("id, nombre, fecha, lugar, empresa, estado, tipo").neq("estado", "cancelado").order("fecha", { ascending: false }).limit(300),
    supabase.from("stock_evento_productos").select("evento_id"),
  ]);
  const cuenta = new Map<string, number>();
  for (const i of items ?? []) cuenta.set(i.evento_id, (cuenta.get(i.evento_id) ?? 0) + 1);
  return ((eventos ?? []) as EventoStock[]).map((e) => ({ ...e, productos: cuenta.get(e.id) ?? 0 }));
}

/** La lista de stock de un evento, con el stock actual de cada producto por depósito. */
export async function stockDelEvento(eventoId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(eventoId)) return null;
  const supabase = await crearClienteServidor();
  const [{ data: evento }, { data: items }, depositos, stock] = await Promise.all([
    supabase.from("eventos").select("id, nombre, fecha, lugar, empresa, estado, tipo").eq("id", eventoId).maybeSingle(),
    supabase.from("stock_evento_productos").select("producto_id, cantidad, nota").eq("evento_id", eventoId).order("orden"),
    listarDepositos(),
    obtenerStock(),
  ]);
  if (!evento) return null;
  const lista: ItemStockEvento[] = (items ?? []).map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad === null ? null : Number(i.cantidad), nota: i.nota }));
  return { evento: evento as EventoStock, lista, depositos, stock };
}
export type DatosStockEvento = NonNullable<Awaited<ReturnType<typeof stockDelEvento>>>;
