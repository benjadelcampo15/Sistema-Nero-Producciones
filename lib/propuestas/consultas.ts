import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Empresa } from "@/lib/empresas";
import type { PrioridadPago } from "@/lib/pagos/tipos";
import type { EstadoPropuesta, PagoPropuesto, Propuesta, ResumenPropuesta, SolicitudDisponible } from "./tipos";

type Nombres = Map<string, { creador: string | null; modificador: string | null }>;

async function nombres(ids: string[]): Promise<Nombres> {
  if (!ids.length) return new Map();
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("datos_propuestas_pago", { p_ids: ids });
  return new Map(((data ?? []) as { id: string; creador: string | null; modificador: string | null }[]).map((d) => [d.id, d]));
}

/** Historial de propuestas (las de una empresa o todas), las más nuevas arriba. */
export async function listarPropuestas(filtros: { empresa?: Empresa; estado?: EstadoPropuesta }): Promise<ResumenPropuesta[]> {
  const supabase = await crearClienteServidor();
  let consulta = supabase
    .from("propuestas_pago")
    .select("id, numero, empresa, nombre, fecha, disponible, estado, actualizado_en, propuestas_pago_items (importe)")
    .is("eliminado_en", null)
    .order("fecha", { ascending: false })
    .order("numero", { ascending: false })
    .limit(500);
  if (filtros.empresa) consulta = consulta.eq("empresa", filtros.empresa);
  if (filtros.estado) consulta = consulta.eq("estado", filtros.estado);
  const { data, error } = await consulta;
  if (error) throw new Error(`No se pudieron leer las propuestas de pago: ${error.message}`);
  const filas = data ?? [];
  const n = await nombres(filas.map((f) => f.id));
  return filas.map((f) => {
    const items = (f.propuestas_pago_items ?? []) as { importe: number | string }[];
    return {
      id: f.id,
      numero: Number(f.numero),
      empresa: f.empresa as Empresa,
      nombre: f.nombre,
      fecha: f.fecha,
      disponible: Number(f.disponible),
      estado: f.estado as EstadoPropuesta,
      pagos: items.length,
      total: Math.round(items.reduce((s, i) => s + Math.round(Number(i.importe) * 100), 0)) / 100,
      creador: n.get(f.id)?.creador ?? null,
      modificador: n.get(f.id)?.modificador ?? null,
      actualizado_en: f.actualizado_en,
    };
  });
}

/** Una propuesta con sus pagos en orden. */
export async function obtenerPropuesta(id: string): Promise<Propuesta | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("propuestas_pago")
    .select(
      "id, numero, empresa, nombre, fecha, disponible, observaciones, estado, creado_en, actualizado_en, propuestas_pago_items (id, orden, proveedor, detalle, evento_id, adeudado, importe, alias_cbu, prioridad, observaciones, solicitud_id, solicitante)",
    )
    .eq("id", id)
    .is("eliminado_en", null)
    .maybeSingle();
  if (!data) return null;
  const n = await nombres([data.id]);
  const items = [...((data.propuestas_pago_items ?? []) as (Record<string, unknown> & { orden: number })[])].sort((a, b) => a.orden - b.orden);
  return {
    id: data.id,
    numero: Number(data.numero),
    empresa: data.empresa as Empresa,
    nombre: data.nombre,
    fecha: data.fecha,
    disponible: Number(data.disponible),
    observaciones: data.observaciones ?? "",
    estado: data.estado as EstadoPropuesta,
    creado_en: data.creado_en,
    actualizado_en: data.actualizado_en,
    creador: n.get(data.id)?.creador ?? null,
    modificador: n.get(data.id)?.modificador ?? null,
    items: items.map(
      (i): PagoPropuesto => ({
        id: i.id as string,
        proveedor: i.proveedor as string,
        detalle: (i.detalle as string | null) ?? "",
        evento_id: (i.evento_id as string | null) ?? null,
        adeudado: i.adeudado === null ? null : Number(i.adeudado),
        importe: Number(i.importe),
        alias_cbu: (i.alias_cbu as string | null) ?? "",
        prioridad: i.prioridad as PrioridadPago,
        observaciones: (i.observaciones as string | null) ?? "",
        solicitud_id: (i.solicitud_id as string | null) ?? null,
        solicitante: (i.solicitante as string | null) ?? null,
      }),
    ),
  };
}

export type CambioPropuesta = { accion: string; detalle: string | null; usuario: string | null; creado_en: string };

export async function historialPropuesta(id: string): Promise<CambioPropuesta[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("historial_propuesta_pago", { p_id: id });
  return (data ?? []) as CambioPropuesta[];
}

/** Solicitudes de pagos abiertas de la empresa (solo para leer y copiar sus datos). */
export async function solicitudesParaPropuesta(empresa: Empresa): Promise<SolicitudDisponible[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("solicitudes_para_propuesta", { p_empresa: empresa });
  return ((data ?? []) as (Omit<SolicitudDisponible, "monto" | "pagado" | "numero"> & { monto: string | number; pagado: string | number; numero: string | number })[]).map((s) => ({
    ...s,
    numero: Number(s.numero),
    monto: Number(s.monto),
    pagado: Number(s.pagado),
  }));
}

/** Eventos de la empresa para el selector (los más recientes primero). */
export async function eventosParaPropuesta(empresa: Empresa) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("eventos").select("id, nombre, fecha").eq("empresa", empresa).neq("estado", "cancelado").order("fecha", { ascending: false }).limit(300);
  return (data ?? []) as { id: string; nombre: string; fecha: string }[];
}

/** Proveedores cargados, para sugerir el nombre y traer su alias / CBU. */
export async function proveedoresParaPropuesta() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("proveedores_para_propuesta");
  return (data ?? []) as { nombre: string; alias_cbu: string | null }[];
}
