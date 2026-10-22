import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";

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

/** Cantidad y total facturado (real) por cliente, para el listado. */
export async function resumenFacturacionPorCliente() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("comprobantes_emitidos")
    .select("cliente_id, total, fecha")
    .eq("estado", "emitido")
    .eq("entorno", "produccion")
    .not("cliente_id", "is", null);
  const resumen = new Map<string, { cantidad: number; total: number; ultima: string }>();
  for (const c of (data ?? []) as { cliente_id: string; total: number; fecha: string }[]) {
    const r = resumen.get(c.cliente_id) ?? { cantidad: 0, total: 0, ultima: c.fecha };
    resumen.set(c.cliente_id, {
      cantidad: r.cantidad + 1,
      total: r.total + Number(c.total),
      ultima: c.fecha > r.ultima ? c.fecha : r.ultima,
    });
  }
  return resumen;
}
