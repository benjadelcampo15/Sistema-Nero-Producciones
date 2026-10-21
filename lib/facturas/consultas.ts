import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { ESTADOS_FACTURA, type EstadoFactura, type Factura } from "./tipos";

const CAMPOS =
  "id, archivo_path, archivo_nombre, archivo_tipo, estado, error, datos_ia, proveedor_ia, tipo_comprobante, punto_venta, numero, fecha_emision, cuit_emisor, razon_social_emisor, cuit_receptor, razon_social_receptor, neto, iva, total, duplicada_de, creado_en";

function normalizar(f: Factura): Factura {
  const n = (v: number | null) => (v === null ? null : Number(v));
  return { ...f, neto: n(f.neto), iva: n(f.iva), total: n(f.total) };
}

export function leerEstadoFactura(valor: unknown): EstadoFactura | undefined {
  return ESTADOS_FACTURA.find((e) => e === valor);
}

export async function listarFacturas(estado?: EstadoFactura) {
  const supabase = await crearClienteServidor();
  let consulta = supabase.from("facturas").select(CAMPOS).order("creado_en", { ascending: false }).limit(300);
  if (estado) consulta = consulta.eq("estado", estado);
  const { data, error } = await consulta;
  if (error) throw new Error(`No se pudieron leer las facturas: ${error.message}`);
  return ((data ?? []) as Factura[]).map(normalizar);
}

export async function contarPorEstado() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("facturas").select("estado");
  const conteo = Object.fromEntries(ESTADOS_FACTURA.map((e) => [e, 0])) as Record<EstadoFactura, number>;
  for (const f of (data ?? []) as { estado: EstadoFactura }[]) conteo[f.estado]++;
  return conteo;
}

export async function obtenerFactura(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("facturas").select(CAMPOS).eq("id", id).maybeSingle();
  return data ? normalizar(data as Factura) : null;
}

/** Movimiento creado a partir de la factura (si ya se aprobó). */
export async function obtenerMovimientoDeFactura(facturaId: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("transacciones")
    .select("id, tipo, monto, fecha, descripcion")
    .eq("factura_id", facturaId)
    .maybeSingle();
  return data as { id: string; tipo: string; monto: number; fecha: string; descripcion: string } | null;
}

/**
 * Link temporal (10 minutos) para ver el archivo. Solo se llama después de
 * comprobar que el usuario puede ver la factura (la lectura de arriba pasa por RLS).
 */
export async function urlTemporalArchivo(path: string) {
  const { data } = await crearClienteAdmin().storage.from("facturas").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
