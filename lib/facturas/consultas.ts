import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { hoy, sumar } from "@/lib/formato";
import { ESTADOS_FACTURA, type EstadoFactura, type Factura } from "./tipos";

const CAMPOS =
  "id, empresa, archivo_path, archivo_nombre, archivo_tipo, estado, error, datos_ia, proveedor_ia, tipo_comprobante, punto_venta, numero, fecha_emision, cuit_emisor, razon_social_emisor, cuit_receptor, razon_social_receptor, neto, iva, total, duplicada_de, creado_en, actualizado_en";

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

export type ProveedorFicha = {
  id: string;
  cuit: string | null;
  razon_social: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  alias_cbu: string | null;
  notas: string | null;
  activo: boolean;
};

const CAMPOS_PROVEEDOR = "id, cuit, razon_social, contacto, telefono, email, alias_cbu, notas, activo";

export async function listarProveedores() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("proveedores").select(CAMPOS_PROVEEDOR).order("razon_social");
  return (data ?? []) as ProveedorFicha[];
}

export async function obtenerProveedor(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("proveedores").select(CAMPOS_PROVEEDOR).eq("id", id).maybeSingle();
  return data as ProveedorFicha | null;
}

export type ResumenProveedor = { cantidad: number; total: number; ultima: string | null; mes: { cantidad: number; total: number }; anio: number };

/** Facturas aprobadas por CUIT del emisor: en total, en el mes y en el año actuales (por fecha de emisión). */
export async function resumenFacturasPorProveedor() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("facturas").select("cuit_emisor, total, fecha_emision").eq("estado", "aprobada").limit(20000);
  const mes = hoy().slice(0, 7);
  const anio = hoy().slice(0, 4);
  const resumen = new Map<string, ResumenProveedor>();
  for (const f of (data ?? []) as { cuit_emisor: string | null; total: number | null; fecha_emision: string | null }[]) {
    const cuit = (f.cuit_emisor ?? "").replace(/\D/g, "");
    if (!cuit) continue;
    const r = resumen.get(cuit) ?? { cantidad: 0, total: 0, ultima: null, mes: { cantidad: 0, total: 0 }, anio: 0 };
    const total = Number(f.total ?? 0);
    const fecha = f.fecha_emision ?? "";
    resumen.set(cuit, {
      cantidad: r.cantidad + 1,
      total: sumar([r.total, total]),
      ultima: fecha && (!r.ultima || fecha > r.ultima) ? fecha : r.ultima,
      mes: fecha.startsWith(mes) ? { cantidad: r.mes.cantidad + 1, total: sumar([r.mes.total, total]) } : r.mes,
      anio: fecha.startsWith(anio) ? sumar([r.anio, total]) : r.anio,
    });
  }
  return resumen;
}

/** Todas las facturas subidas de un CUIT emisor (cualquier estado), de la más nueva a la más vieja. */
export async function facturasDeCuit(cuit: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("facturas").select(CAMPOS).order("fecha_emision", { ascending: false, nullsFirst: false }).limit(2000);
  // El CUIT puede estar guardado con guiones: se compara solo por los números.
  return ((data ?? []) as Factura[]).filter((f) => (f.cuit_emisor ?? "").replace(/\D/g, "") === cuit).map(normalizar);
}
