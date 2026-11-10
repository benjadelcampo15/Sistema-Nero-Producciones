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
  categoria_id: string;
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

/** De la fecha más vieja a la más nueva; lo que no tiene fecha va al final. */
const porFecha = (a: string | null, b: string | null) => (a ?? "9999").localeCompare(b ?? "9999");

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

  // Un movimiento a mano pagado entero toma la fecha del pago: la suya quedó en la imputación.
  const pagadosEnteros = raices.filter((m) => (m.proveedor_id || m.cliente_id) && m.pago_id).map((m) => m.id);
  const fechaOriginal = new Map<string, string | null>();
  if (pagadosEnteros.length) {
    const { data } = await supabase.from("pago_aplicaciones").select("transaccion_id, fecha_anterior").in("transaccion_id", pagadosEnteros);
    for (const a of data ?? []) fechaOriginal.set(a.transaccion_id as string, a.fecha_anterior as string | null);
  }

  const comprobantes: ComprobanteCuenta[] = raices
    .filter((r) => r.estado !== "proyectado")
    .map((r) => {
      const familia = movimientos.filter((m) => m.id === r.id || m.parte_de === r.id);
      const pendientes = familia.filter((m) => m.estado === "pendiente");
      const d = datos.get(r.id);
      const manual = Boolean(r.proveedor_id || r.cliente_id);
      const fecha = d?.fecha ?? (fechaOriginal.has(r.id) ? fechaOriginal.get(r.id)! : r.fecha);
      const total = sumar(familia.map((m) => m.monto));
      return {
        id: r.id,
        fecha,
        nombre: d?.nombre ?? (manual ? `${r.descripcion} · sin factura` : r.descripcion),
        href: d?.href ?? null,
        total,
        pendiente: sumar(pendientes.map((m) => m.monto)),
        pendientes: pendientes.map((m) => m.id),
        cargo: manual
          ? {
              id: r.id,
              detalle: r.descripcion,
              monto: total,
              fecha,
              categoria_id: r.categoria_id,
              conPagos: familia.length > 1 || r.estado !== "pendiente",
              pagado: sumar(familia.filter((m) => m.estado !== "pendiente").map((m) => m.monto)),
            }
          : null,
      };
    })
    .sort((a, b) => porFecha(a.fecha, b.fecha));

  // Pagos registrados acá (los eliminados no se muestran: quedan guardados para auditoría),
  // más lo que se marcó pagado directo en Financiero.
  const listaPagos: PagoCuenta[] = (pagos ?? [])
    .filter((p) => p.anulado_en === null)
    .map((p) => ({ id: p.id, fecha: p.fecha, monto: Number(p.monto), medio_pago: p.medio_pago as MedioPago, notas: p.notas }));
  for (const m of movimientos) {
    if (m.estado === "real" && !m.pago_id) listaPagos.push({ id: null, fecha: m.fecha, monto: m.monto, medio_pago: m.medio_pago, notas: "Marcado como pagado en Financiero" });
  }
  listaPagos.sort((a, b) => porFecha(a.fecha, b.fecha));

  const extracto: RenglonCuenta[] = [
    ...comprobantes.map((c) => ({ fecha: c.fecha, detalle: c.nombre, href: c.href, debe: c.total, haber: 0, saldo: 0, cargo: c.cargo })),
    ...listaPagos.map((p) => ({
      fecha: p.fecha,
      detalle: `${tipo === "pago" ? "Pago" : "Cobro"}${p.notas ? ` · ${p.notas}` : ""}`,
      href: null,
      debe: 0,
      haber: p.monto,
      saldo: 0,
      pago: p.id ? { ...p, id: p.id } : undefined,
      enFinanciero: !p.id,
    })),
  ].sort((a, b) => porFecha(a.fecha, b.fecha) || b.debe - a.debe);
  let saldo = 0;
  for (const r of extracto) {
    saldo = sumar([saldo, r.debe, -r.haber]);
    r.saldo = saldo;
  }

  const facturado = sumar(comprobantes.map((c) => c.total));
  const pendiente = sumar(comprobantes.map((c) => c.pendiente));
  return { comprobantes, pagos: listaPagos, extracto, saldo: pendiente, facturado, pagado: sumar([facturado, -pendiente]) };
}

/** Saldo pendiente de cada proveedor o cliente con una empresa (ver resumenCuentas). */
export async function saldosPendientes(tipo: TipoCuenta, empresa: Empresa) {
  const resumen = await resumenCuentas(tipo, empresa);
  return new Map([...resumen].map(([id, r]) => [id, r.saldo]));
}

/** Categorías de Financiero para los movimientos de una cuenta y la que viene elegida. */
export async function categoriasDeCuenta(tipo: TipoCuenta) {
  // Con la clave secreta: quien ve proveedores o clientes puede no ver Financiero.
  const { data } = await crearClienteAdmin()
    .from("categorias")
    .select("id, nombre")
    .eq("tipo", tipo === "pago" ? "egreso" : "ingreso")
    .eq("activa", true)
    .order("nombre");
  const lista = (data ?? []) as { id: string; nombre: string }[];
  const defecto = (lista.find((c) => c.nombre === (tipo === "pago" ? "Proveedores" : "Otros ingresos")) ?? lista[0])?.id ?? "";
  return { lista, defecto };
}

/**
 * Las cuentas corrientes con una empresa: por cada proveedor (tipo "pago") o
 * cliente ("cobro") con movimientos, su saldo pendiente. Se calcula en la base
 * (resumen_cuentas), en un solo viaje; la función verifica el permiso.
 */
export async function resumenCuentas(tipo: TipoCuenta, empresa: Empresa) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("resumen_cuentas", { p_tipo: tipo, p_empresa: empresa });
  if (error) throw new Error(`No se pudieron calcular las cuentas corrientes: ${error.message}`);
  const resumen = new Map<string, { saldo: number; movimientos: number }>();
  for (const r of (data ?? []) as { ficha: string; saldo: number | string; movimientos: number }[]) {
    resumen.set(r.ficha, { saldo: Number(r.saldo), movimientos: r.movimientos });
  }
  return resumen;
}
