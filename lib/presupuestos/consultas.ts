import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import type { Presupuesto } from "./tipos";

const CAMPOS =
  "id, numero, token, estado, fecha, validez_dias, cliente_nombre, cliente_cuit, cliente_contacto, cliente_email, cliente_telefono, evento_nombre, evento_fecha, evento_lugar, invitados, items, modo_iva, descuento_pct, forma_pago, incluye, observaciones, enviado_en, visto_en, respondido_en, respondido_por, evento_id, creado_en";

function normalizar(p: Presupuesto): Presupuesto {
  return {
    ...p,
    numero: Number(p.numero),
    descuento_pct: Number(p.descuento_pct),
    items: (p.items ?? []).map((i) => ({ ...i, cantidad: Number(i.cantidad), precio: Number(i.precio), costo: i.costo === null ? null : Number(i.costo) })),
  };
}

export async function listarPresupuestos() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("presupuestos").select(CAMPOS).order("creado_en", { ascending: false }).limit(300);
  if (error) throw new Error(`No se pudieron leer los presupuestos: ${error.message}`);
  return ((data ?? []) as Presupuesto[]).map(normalizar);
}

export async function obtenerPresupuesto(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("presupuestos").select(CAMPOS).eq("id", id).maybeSingle();
  return data ? normalizar(data as Presupuesto) : null;
}

/**
 * Vista pública del cliente: busca por token con la clave secreta (no hay
 * sesión). Solo se usa en /p/presupuesto/[token].
 */
export async function obtenerPresupuestoPublico(token: string) {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  const { data } = await crearClienteAdmin().from("presupuestos").select(CAMPOS).eq("token", token).neq("estado", "borrador").maybeSingle();
  return data ? normalizar(data as Presupuesto) : null;
}
