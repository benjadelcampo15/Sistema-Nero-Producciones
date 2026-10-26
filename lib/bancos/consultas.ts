import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hoy, sumar } from "@/lib/formato";
import { sumarDias } from "@/lib/cheques/tipos";
import type { Cuenta, MovimientoCaja, SaldoCuenta } from "./tipos";

export async function listarCuentas({ incluirInactivas = false } = {}) {
  const supabase = await crearClienteServidor();
  let consulta = supabase.from("cuentas_bancarias").select("id, nombre, banco, tipo, descubierto, activa").order("creado_en");
  if (!incluirInactivas) consulta = consulta.eq("activa", true);
  const { data, error } = await consulta;
  if (error) throw new Error(`No se pudieron leer las cuentas: ${error.message}`);
  return ((data ?? []) as Cuenta[]).map((c) => ({ ...c, descubierto: Number(c.descubierto) }));
}

/** El último saldo cargado de cada cuenta con fecha hasta `fecha` (inclusive). */
export async function saldosAFecha(fecha: string) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("saldos_bancarios")
    .select("cuenta_id, fecha, saldo")
    .lte("fecha", fecha)
    .order("fecha", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`No se pudieron leer los saldos: ${error.message}`);
  const saldos = new Map<string, SaldoCuenta>();
  for (const s of data ?? []) {
    if (!saldos.has(s.cuenta_id)) saldos.set(s.cuenta_id, { saldo: Number(s.saldo), fecha: s.fecha });
  }
  return saldos;
}

/** Total de los saldos (solo cuentas activas) y la fecha de carga más reciente entre ellos. */
export function totalSaldos(cuentas: Cuenta[], saldos: Map<string, SaldoCuenta>) {
  const cargados = cuentas.map((c) => saldos.get(c.id)).filter((s): s is SaldoCuenta => Boolean(s));
  return {
    total: sumar(cargados.map((s) => s.saldo)),
    descubierto: sumar(cuentas.map((c) => c.descubierto)),
    // La más vieja manda: desde ahí hay que sumar movimientos para llegar a hoy.
    desde: cargados.length ? cargados.map((s) => s.fecha).sort()[0] : null,
    sinCargar: cuentas.length - cargados.length,
  };
}

const LIMITE = 5000;

/**
 * Ingresos y egresos entre dos fechas (inclusive): los movimientos de
 * Financiero y, si se pide, los cheques pendientes de la sección Cheques
 * (emitidos = egreso, recibidos en cartera o depositados = ingreso).
 */
export async function movimientosEntre(desde: string, hasta: string, { proyectados = true, cheques = true } = {}) {
  const supabase = await crearClienteServidor();
  const estados = proyectados ? ["real", "pendiente", "proyectado"] : ["real", "pendiente"];
  const [trx, chq] = await Promise.all([
    supabase
      .from("transacciones")
      .select("id, tipo, monto, fecha, descripcion, contraparte, estado, categoria:categorias(nombre)")
      .is("eliminado_en", null)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .in("estado", estados)
      .order("fecha")
      .limit(LIMITE),
    cheques
      ? supabase
          .from("cheques")
          .select("id, tipo, estado, monto, fecha_pago, contraparte, banco, numero")
          .in("estado", ["pendiente", "depositado"])
          .gte("fecha_pago", desde)
          .lte("fecha_pago", hasta)
          .limit(LIMITE)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (trx.error) throw new Error(`No se pudieron leer los movimientos: ${trx.error.message}`);

  const movimientos: MovimientoCaja[] = (trx.data ?? []).map((t) => {
    const categoria = (t.categoria as unknown as { nombre: string } | null)?.nombre ?? null;
    return {
      id: t.id,
      origen: "financiero",
      fecha: t.fecha,
      tipo: t.tipo,
      monto: Number(t.monto),
      descripcion: t.descripcion,
      detalle: [t.contraparte, categoria].filter(Boolean).join(" · ") || null,
      estado: t.estado,
    };
  });
  for (const c of chq.data ?? []) {
    // Un cheque emitido depositado no existe; uno recibido depositado todavía no se acreditó.
    if (c.tipo === "emitido" && c.estado !== "pendiente") continue;
    movimientos.push({
      id: c.id,
      origen: "cheque",
      fecha: c.fecha_pago,
      tipo: c.tipo === "emitido" ? "egreso" : "ingreso",
      monto: Number(c.monto),
      descripcion: `Cheque ${c.tipo === "emitido" ? "emitido a" : "de"} ${c.contraparte}`,
      detalle: [c.banco, c.numero ? `N° ${c.numero}` : null].filter(Boolean).join(" · ") || null,
      estado: "pendiente",
    });
  }
  // Por fecha; dentro del día, primero los ingresos.
  movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.tipo === b.tipo ? 0 : a.tipo === "ingreso" ? -1 : 1));
  return { movimientos, truncado: (trx.data?.length ?? 0) >= LIMITE };
}

/**
 * Saldo de caja al empezar el día `fecha`. Parte del total de los últimos saldos
 * bancarios cargados hasta ese día y le suma los movimientos que pasaron entre
 * la carga y `fecha`. Si no hay saldos cargados antes de `fecha` (por ejemplo, un
 * cashflow desde principio de mes con saldos cargados hoy), parte de los
 * últimos cargados y va para atrás restando los movimientos del medio.
 */
export async function saldoAlInicio(fecha: string, opciones: { proyectados?: boolean; cheques?: boolean } = {}) {
  const cuentas = await listarCuentas();
  let t = totalSaldos(cuentas, await saldosAFecha(fecha));
  let haciaAtras = false;
  if (!t.desde) {
    const ultimos = totalSaldos(cuentas, await saldosAFecha(hoy()));
    if (ultimos.desde && ultimos.desde > fecha) {
      t = ultimos;
      haciaAtras = true;
    }
  }
  let saldo = t.total;
  const neto = (movimientos: { tipo: string; monto: number }[]) => sumar(movimientos.map((m) => (m.tipo === "ingreso" ? m.monto : -m.monto)));
  if (t.desde && t.desde < fecha) {
    saldo = sumar([saldo, neto((await movimientosEntre(t.desde, sumarDias(fecha, -1), opciones)).movimientos)]);
  } else if (haciaAtras && t.desde) {
    saldo = sumar([saldo, -neto((await movimientosEntre(fecha, sumarDias(t.desde, -1), opciones)).movimientos)]);
  }
  return { saldo, descubierto: t.descubierto, cargadoEl: t.desde, sinCargar: t.sinCargar, cuentas: cuentas.length };
}
