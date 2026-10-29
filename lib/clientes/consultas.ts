import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hoy, sumar } from "@/lib/formato";

export type Cliente = {
  id: string;
  razon_social: string;
  doc_tipo: number;
  doc_nro: string;
  condicion_iva: number;
  email: string | null;
  telefono: string | null;
  domicilio: string | null;
  notas: string | null;
  activo: boolean;
};

export async function listarClientes({ incluirInactivos = false } = {}) {
  const supabase = await crearClienteServidor();
  let consulta = supabase
    .from("clientes")
    .select("id, razon_social, doc_tipo, doc_nro, condicion_iva, email, telefono, domicilio, notas, activo")
    .order("razon_social");
  if (!incluirInactivos) consulta = consulta.eq("activo", true);
  const { data } = await consulta;
  return (data ?? []) as Cliente[];
}

export async function obtenerCliente(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("clientes")
    .select("id, razon_social, doc_tipo, doc_nro, condicion_iva, email, telefono, domicilio, notas, activo")
    .eq("id", id)
    .maybeSingle();
  return data as Cliente | null;
}

export type ResumenCliente = { cantidad: number; total: number; ultima: string; mes: { cantidad: number; total: number }; anio: number };

/** Cantidad y total facturado (real) por cliente: en total, en el mes y en el año actuales. */
export async function resumenFacturacionPorCliente() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("comprobantes_emitidos")
    .select("cliente_id, total, fecha")
    .eq("estado", "emitido")
    .eq("entorno", "produccion")
    .not("cliente_id", "is", null)
    .limit(20000);
  const mes = hoy().slice(0, 7);
  const anio = hoy().slice(0, 4);
  const resumen = new Map<string, ResumenCliente>();
  for (const c of (data ?? []) as { cliente_id: string; total: number; fecha: string }[]) {
    const r = resumen.get(c.cliente_id) ?? { cantidad: 0, total: 0, ultima: c.fecha, mes: { cantidad: 0, total: 0 }, anio: 0 };
    const total = Number(c.total);
    resumen.set(c.cliente_id, {
      cantidad: r.cantidad + 1,
      total: sumar([r.total, total]),
      ultima: c.fecha > r.ultima ? c.fecha : r.ultima,
      mes: c.fecha.startsWith(mes) ? { cantidad: r.mes.cantidad + 1, total: sumar([r.mes.total, total]) } : r.mes,
      anio: c.fecha.startsWith(anio) ? sumar([r.anio, total]) : r.anio,
    });
  }
  return resumen;
}
