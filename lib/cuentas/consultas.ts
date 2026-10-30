import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { sumar } from "@/lib/formato";
import type { Empresa } from "@/lib/empresas";
import type { MedioPago } from "@/lib/financiero/tipos";
import { nombreTipoCbte, numeroComprobante } from "@/lib/facturar/tipos";
import type { ComprobanteCuenta, CuentaCorriente, PagoCuenta, RenglonCuenta, TipoCuenta } from "./tipos";

type Movimiento = {
  id: string;
  monto: number;
  fecha: string | null;
  descripcion: string;
  proveedor_id: string | null;
  cliente_id: string | null;
  estado: "real" | "pendiente" | "proyectado";
  factura_id: string | null;
  parte_de: string | null;
  pago_id: string | null;
  medio_pago: MedioPago;
  notas: string | null;
  creado_en: string;
};

/** Cuenta corriente de un proveedor (tipo "pago") o cliente ("cobro") con una empresa. */
export async function cuentaCorriente(tipo: TipoCuenta, id: string, empresa: Empresa): Promise<CuentaCorriente> {
  const supabase = await crearClienteServidor();
  const [{ data: movs }, { data: pagos }] = await Promise.all([
    supabase.rpc("movimientos_de_cuenta", { p_tipo: tipo, p_id: id, p_empresa: empresa }),
    supabase
      .from("pagos_cuenta")
      .select("id, fecha, monto, medio_pago, notas, anulado_en")
      .eq(tipo === "pago" ? "proveedor_id" : "cliente_id", id)
      .eq("empresa", empresa)
      .order("fecha"),
  ]);
  const movimientos = ((movs ?? []) as Movimiento[]).map((m) => ({ ...m, monto: Number(m.monto) }));
  const raices = movimientos.filter((m) => !m.parte_de);

  // Nombre y fecha de cada comprobante.
  const datos = new Map<string, { fecha: string | null; nombre: string; href: string }>();
  if (tipo === "pago") {
    const ids = raices.map((m) => m.factura_id).filter((x): x is string => !!x);
    if (ids.length) {
      const { data } = await supabase.from("facturas").select("id, tipo_comprobante, punto_venta, numero, fecha_emision, archivo_nombre").in("id", ids);
      for (const f of data ?? []) {
        const nombre = [f.tipo_comprobante, f.punto_venta && f.numero ? `${f.punto_venta}-${f.numero}` : f.numero].filter(Boolean).join(" ") || f.archivo_nombre;
        const raiz = raices.find((m) => m.factura_id === f.id);
        if (raiz) datos.set(raiz.id, { fecha: f.fecha_emision, nombre, href: `/facturas/${f.id}` });
      }
    }
  } else if (raices.length) {
    const { data } = await supabase
      .from("comprobantes_emitidos")
      .select("id, tipo_cbte, punto_venta, numero, fecha, transaccion_id")
      .in("transaccion_id", raices.map((m) => m.id));
    for (const c of data ?? []) {
      datos.set(c.transaccion_id as string, { fecha: c.fecha, nombre: `${nombreTipoCbte(c.tipo_cbte)} ${c.numero ? numeroComprobante(c) : ""}`.trim(), href: `/facturar/${c.id}` });
    }
  }

  const comprobantes: ComprobanteCuenta[] = raices
    .filter((r) => r.estado !== "proyectado")
    .map((r) => {
      const familia = movimientos.filter((m) => m.id === r.id || m.parte_de === r.id);
      const pendientes = familia.filter((m) => m.estado === "pendiente");
      const d = datos.get(r.id);
      const manual = Boolean(r.proveedor_id || r.cliente_id);
      return {
        id: r.id,
        fecha: d?.fecha ?? r.fecha,
        nombre: d?.nombre ?? (manual ? `${r.descripcion} · sin factura` : r.descripcion),
        href: d?.href ?? null,
        total: sumar(familia.map((m) => m.monto)),
        pendiente: sumar(pendientes.map((m) => m.monto)),
        pendientes: pendientes.map((m) => m.id),
        borrable: manual && familia.length === 1 && r.estado === "pendiente",
      };
    })
    .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));

  // Pagos registrados acá, más lo que se marcó pagado directo en Financiero.
  const listaPagos: PagoCuenta[] = (pagos ?? []).map((p) => ({
    id: p.id,
    fecha: p.fecha,
    monto: Number(p.monto),
    medio_pago: p.medio_pago as MedioPago,
    notas: p.notas,
    anulado: p.anulado_en !== null,
  }));
  for (const m of movimientos) {
    if (m.estado === "real" && !m.pago_id && m.fecha) listaPagos.push({ id: null, fecha: m.fecha, monto: m.monto, medio_pago: m.medio_pago, notas: "Marcado como pagado en Financiero", anulado: false });
  }
  listaPagos.sort((a, b) => a.fecha.localeCompare(b.fecha));

  const extracto: RenglonCuenta[] = [
    ...comprobantes.map((c) => ({ fecha: c.fecha, detalle: c.nombre, href: c.href, debe: c.total, haber: 0, saldo: 0, pagoId: null, cargoId: c.borrable ? c.id : null })),
    ...listaPagos.map((p) => ({
      fecha: p.fecha,
      detalle: `${tipo === "pago" ? "Pago" : "Cobro"}${p.notas ? ` · ${p.notas}` : ""}`,
      href: null,
      debe: 0,
      haber: p.anulado ? 0 : p.monto,
      saldo: 0,
      pagoId: p.id,
      anulado: p.anulado,
    })),
  ].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "") || b.debe - a.debe);
  let saldo = 0;
  for (const r of extracto) {
    saldo = sumar([saldo, r.debe, -r.haber]);
    r.saldo = saldo;
  }

  const facturado = sumar(comprobantes.map((c) => c.total));
  const pendiente = sumar(comprobantes.map((c) => c.pendiente));
  return { comprobantes, pagos: listaPagos, extracto, saldo: pendiente, facturado, pagado: sumar([facturado, -pendiente]) };
}

/**
 * Saldo pendiente de cada proveedor (tipo "pago", por id) o cliente ("cobro")
 * con una empresa. Lee con la clave secreta: llamarla después de verificar el permiso.
 */
export async function saldosPendientes(tipo: TipoCuenta, empresa: Empresa) {
  const admin = crearClienteAdmin();
  const saldos = new Map<string, number>();
  // Movimiento raíz (el de la factura) → id de la ficha.
  const duenio = new Map<string, string>();

  if (tipo === "pago") {
    const [{ data: proveedores }, { data: facturas }] = await Promise.all([
      admin.from("proveedores").select("id, cuit").not("cuit", "is", null),
      admin.from("facturas").select("id, cuit_emisor").eq("estado", "aprobada").limit(20000),
    ]);
    const porCuit = new Map((proveedores ?? []).map((p) => [p.cuit as string, p.id as string]));
    const proveedorDeFactura = new Map<string, string>();
    for (const f of facturas ?? []) {
      const p = porCuit.get((f.cuit_emisor ?? "").replace(/\D/g, ""));
      if (p) proveedorDeFactura.set(f.id, p);
    }
    const { data: raices } = await admin.from("transacciones").select("id, factura_id").not("factura_id", "is", null).eq("empresa", empresa).limit(20000);
    for (const r of raices ?? []) {
      const p = proveedorDeFactura.get(r.factura_id as string);
      if (p) duenio.set(r.id, p);
    }
  } else {
    const { data } = await admin.from("comprobantes_emitidos").select("transaccion_id, cliente_id").not("transaccion_id", "is", null).not("cliente_id", "is", null).limit(20000);
    for (const c of data ?? []) duenio.set(c.transaccion_id as string, c.cliente_id as string);
  }

  // Cargos a mano (sin factura).
  const { data: cargos } = await admin
    .from("transacciones")
    .select(`id, ${tipo === "pago" ? "proveedor_id" : "cliente_id"}`)
    .not(tipo === "pago" ? "proveedor_id" : "cliente_id", "is", null)
    .eq("empresa", empresa)
    .limit(20000);
  for (const c of (cargos ?? []) as unknown as Record<string, string>[]) duenio.set(c.id, c[tipo === "pago" ? "proveedor_id" : "cliente_id"]);

  const { data: pendientes } = await admin
    .from("transacciones")
    .select("id, monto, parte_de")
    .eq("estado", "pendiente")
    .eq("empresa", empresa)
    .is("eliminado_en", null)
    .limit(20000);
  for (const m of pendientes ?? []) {
    const ficha = duenio.get((m.parte_de as string | null) ?? m.id);
    if (ficha) saldos.set(ficha, sumar([saldos.get(ficha) ?? 0, Number(m.monto)]));
  }
  return saldos;
}
