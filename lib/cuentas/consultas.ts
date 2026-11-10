import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { sumar } from "@/lib/formato";
import type { Empresa } from "@/lib/empresas";
import type { MedioPago } from "@/lib/financiero/tipos";
import { nombreTipoCbte, numeroComprobante } from "@/lib/facturar/tipos";
import type { ComprobanteCuenta, CuentaCorriente, PagoCuenta, RenglonCuenta, ResumenEventoCuenta, TipoCuenta } from "./tipos";

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
  evento_id: string | null;
  planilla_ref: string | null;
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

  // Nombres de los eventos de donde vienen los movimientos (con la clave secreta: quien ve la cuenta puede no ver Eventos).
  const idsEventos = [...new Set(movimientos.map((m) => m.evento_id).filter((x): x is string => !!x))];
  const nombreEvento = new Map<string, string>();
  if (idsEventos.length) {
    const { data } = await crearClienteAdmin().from("eventos").select("id, nombre").in("id", idsEventos);
    for (const e of data ?? []) nombreEvento.set(e.id as string, e.nombre as string);
  }
  const eventoDe = (id: string | null) => (id ? { id, nombre: nombreEvento.get(id) ?? "Evento" } : undefined);

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
      // Los gastos de la planilla de un evento se cambian desde la planilla (no son editables acá).
      const deLaPlanilla = Boolean(r.planilla_ref);
      const manual = Boolean(r.proveedor_id || r.cliente_id) && !deLaPlanilla;
      const evento = eventoDe(r.evento_id);
      const fecha = d?.fecha ?? (fechaOriginal.has(r.id) ? fechaOriginal.get(r.id)! : r.fecha);
      const total = sumar(familia.map((m) => m.monto));
      return {
        id: r.id,
        fecha,
        // En la planilla el saldo de un gasto con seña se llama "… · saldo": acá la fila es el gasto entero.
        nombre: `${d?.nombre ?? (manual ? `${r.descripcion} · sin factura` : deLaPlanilla ? r.descripcion.replace(/ · saldo$/, "") : r.descripcion)}${evento ? ` · ${evento.nombre}` : ""}`,
        href: d?.href ?? (deLaPlanilla && evento ? `/eventos/${evento.id}` : null),
        evento,
        deLaPlanilla,
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
  // Eventos que cubre cada pago (por lo que se le imputó).
  const eventosDePago = new Map<string, string[]>();
  const idsPagos = listaPagos.map((p) => p.id).filter((x): x is string => !!x);
  if (idsPagos.length) {
    const eventoMovimiento = new Map(movimientos.map((m) => [m.id, m.evento_id]));
    const { data } = await supabase.from("pago_aplicaciones").select("pago_id, transaccion_id").in("pago_id", idsPagos);
    for (const a of data ?? []) {
      const ev = eventoMovimiento.get(a.transaccion_id as string);
      if (!ev) continue;
      const lista = eventosDePago.get(a.pago_id as string) ?? [];
      if (!lista.includes(ev)) lista.push(ev);
      eventosDePago.set(a.pago_id as string, lista);
    }
  }
  const extrasPagos: { pago: PagoCuenta; eventos: string[]; planilla?: { id: string; nombre: string } }[] = [];
  for (const m of movimientos) {
    if (m.estado === "real" && !m.pago_id) {
      const evento = eventoDe(m.evento_id);
      const pago = {
        id: null,
        fecha: m.fecha,
        monto: m.monto,
        medio_pago: m.medio_pago,
        notas: m.planilla_ref ? `Seña / pagado desde la planilla${evento ? ` de ${evento.nombre}` : ""}` : "Marcado como pagado en Financiero",
      };
      listaPagos.push(pago);
      extrasPagos.push({ pago, eventos: m.evento_id ? [m.evento_id] : [], planilla: m.planilla_ref ? evento : undefined });
    }
  }
  listaPagos.sort((a, b) => porFecha(a.fecha, b.fecha));

  const extracto: RenglonCuenta[] = [
    ...comprobantes.map((c) => ({
      fecha: c.fecha,
      detalle: c.nombre,
      href: c.href,
      debe: c.total,
      haber: 0,
      saldo: 0,
      cargo: c.cargo,
      eventos: c.evento ? [c.evento.id] : [],
      planilla: c.deLaPlanilla ? c.evento : undefined,
    })),
    ...listaPagos.map((p) => {
      const extra = extrasPagos.find((x) => x.pago === p);
      return {
        fecha: p.fecha,
        detalle: `${tipo === "pago" ? "Pago" : "Cobro"}${p.notas ? ` · ${p.notas}` : ""}`,
        href: null,
        debe: 0,
        haber: p.monto,
        saldo: 0,
        pago: p.id ? { ...p, id: p.id } : undefined,
        enFinanciero: !p.id && !extra?.planilla,
        planilla: extra?.planilla,
        eventos: p.id ? (eventosDePago.get(p.id) ?? []) : (extra?.eventos ?? []),
      };
    }),
  ].sort((a, b) => porFecha(a.fecha, b.fecha) || b.debe - a.debe);
  let saldo = 0;
  for (const r of extracto) {
    saldo = sumar([saldo, r.debe, -r.haber]);
    r.saldo = saldo;
  }

  const facturado = sumar(comprobantes.map((c) => c.total));
  const pendiente = sumar(comprobantes.map((c) => c.pendiente));
  // Lo de cada evento: su deuda, lo pagado y lo que falta (de los comprobantes que vienen de él).
  const porEvento = new Map<string, ResumenEventoCuenta>();
  for (const c of comprobantes) {
    if (!c.evento) continue;
    const e = porEvento.get(c.evento.id) ?? { ...c.evento, total: 0, pagado: 0, pendiente: 0 };
    e.total = sumar([e.total, c.total]);
    e.pendiente = sumar([e.pendiente, c.pendiente]);
    e.pagado = sumar([e.total, -e.pendiente]);
    porEvento.set(c.evento.id, e);
  }
  const eventos = [...porEvento.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { comprobantes, pagos: listaPagos, extracto, saldo: pendiente, facturado, pagado: sumar([facturado, -pendiente]), eventos };
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
