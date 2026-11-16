import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { puede, type UsuarioActual } from "@/lib/auth/sesion";
import type { MovimientoHistorial, PagoSolicitud, SolicitudPago } from "./tipos";

const CAMPOS =
  "id, numero, empresa, proveedor_id, proveedor, evento_id, monto, pagado, datos_bancarios, prioridad, motivo, estado, nota_admin, solicitado_por, creado_en, estado_en";

export type FiltrosPago = { empresa?: string; evento?: string; proveedor?: string; estado?: string; prioridad?: string; desde?: string; hasta?: string };

/** Las solicitudes que ve el usuario (Contabilidad: todas; el resto: las propias), con los filtros. */
export async function listarSolicitudesPago(filtros: FiltrosPago): Promise<SolicitudPago[]> {
  const supabase = await crearClienteServidor();
  let consulta = supabase.from("solicitudes_pago").select(CAMPOS).order("creado_en", { ascending: false }).limit(1000);
  if (filtros.empresa) consulta = consulta.eq("empresa", filtros.empresa);
  if (filtros.evento) consulta = consulta.eq("evento_id", filtros.evento);
  if (filtros.estado === "abiertas") consulta = consulta.in("estado", ["pendiente", "aprobada", "parcial"]);
  else if (filtros.estado) consulta = consulta.eq("estado", filtros.estado);
  if (filtros.prioridad) consulta = consulta.eq("prioridad", filtros.prioridad);
  if (filtros.proveedor) consulta = consulta.ilike("proveedor", `%${filtros.proveedor.replace(/[%_]/g, "")}%`);
  if (filtros.desde) consulta = consulta.gte("creado_en", `${filtros.desde}T00:00:00-03:00`);
  if (filtros.hasta) consulta = consulta.lte("creado_en", `${filtros.hasta}T23:59:59-03:00`);
  const { data, error } = await consulta;
  if (error) throw new Error(`No se pudieron leer las solicitudes de pago: ${error.message}`);
  const filas = data ?? [];
  if (!filas.length) return [];
  const { data: extra } = await supabase.rpc("datos_solicitudes_pago", { p_ids: filas.map((f) => f.id) });
  const datos = new Map(((extra ?? []) as { id: string; solicitante: string | null; evento: string | null; estado_por: string | null }[]).map((d) => [d.id, d]));
  return filas.map((f) => ({
    ...(f as Omit<SolicitudPago, "evento" | "solicitante" | "estado_por">),
    monto: Number(f.monto),
    pagado: Number(f.pagado),
    evento: datos.get(f.id)?.evento ?? null,
    solicitante: datos.get(f.id)?.solicitante ?? null,
    estado_por: datos.get(f.id)?.estado_por ?? null,
  }));
}

/** Pagos registrados e historial de una solicitud. */
export async function detalleSolicitudPago(id: string): Promise<{ pagos: PagoSolicitud[]; historial: MovimientoHistorial[] }> {
  const supabase = await crearClienteServidor();
  const [{ data: pagos }, { data: historial }] = await Promise.all([
    supabase.from("solicitudes_pago_pagos").select("id, fecha, importe, medio, observacion, comprobante_path").eq("solicitud_id", id).order("fecha"),
    supabase.rpc("historial_solicitud_pago", { p_id: id }),
  ]);
  return {
    pagos: (pagos ?? []).map((p) => ({ ...p, importe: Number(p.importe) })) as PagoSolicitud[],
    historial: (historial ?? []) as MovimientoHistorial[],
  };
}

/** Para el formulario: proveedores (con su alias / CBU) y eventos de las dos empresas. */
export async function opcionesSolicitudPago() {
  const supabase = await crearClienteServidor();
  const [{ data: proveedores }, { data: eventos }] = await Promise.all([supabase.rpc("proveedores_para_solicitud"), supabase.rpc("eventos_para_solicitud")]);
  return {
    proveedores: (proveedores ?? []) as { id: string; nombre: string; alias_cbu: string | null }[],
    eventos: (eventos ?? []) as { id: string; nombre: string; fecha: string; empresa: string }[],
  };
}

export const esContabilidad = (usuario: UsuarioActual) => puede(usuario, "pagos", "editar");

export type Notificacion = { id: string; titulo: string; detalle: string | null; href: string | null; creado_en: string };

/** Notificaciones sin leer de Solicitudes de pagos del usuario actual. */
export async function notificacionesSinLeer(): Promise<Notificacion[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("notificaciones").select("id, titulo, detalle, href, creado_en").eq("leida", false).like("href", "/solicitudes-pago%").order("creado_en", { ascending: false }).limit(50);
  return (data ?? []) as Notificacion[];
}

export async function cantidadNotificaciones(): Promise<number> {
  const supabase = await crearClienteServidor();
  const { count } = await supabase.from("notificaciones").select("id", { count: "exact", head: true }).eq("leida", false).like("href", "/solicitudes-pago%");
  return count ?? 0;
}
