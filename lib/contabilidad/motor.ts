// Arma los asientos automáticos a partir de los movimientos de Financiero y de
// los cheques vinculados. No toca la base: recibe los datos y devuelve asientos.
//
// Un movimiento con fecha (real o pendiente) es un asiento en su fecha:
//   ingreso: Debe contrapartida (total) · Haber cuenta de la categoría (neto) + IVA débito
//   egreso:  Debe cuenta de la categoría (neto) + IVA crédito · Haber contrapartida (total)
// La contrapartida depende del estado y del medio de pago:
//   pendiente → Deudores por ventas / Proveedores
//   real      → la cuenta bancaria del extracto si está conciliado; si no, la del medio
//               (cheques: Cheques en cartera / Cheques diferidos a pagar)
// Un cheque vinculado que ya se debitó (emitido) o se cobró (recibido) pasa de
// la cuenta de cheques al banco en su fecha de pago.
// Los proyectados y los que no tienen fecha no generan asiento.

import { sumar } from "@/lib/formato";
import type { Empresa } from "@/lib/empresas";
import type { Asiento, Aviso, Imputaciones, LineaAsiento } from "./tipos";

export type MovimientoContable = {
  id: string;
  empresa: Empresa;
  tipo: "ingreso" | "egreso";
  monto: number;
  fecha: string | null;
  descripcion: string;
  contraparte: string | null;
  medio_pago: string;
  estado: "real" | "pendiente" | "proyectado";
  facturado: boolean;
  iva: number | null;
  categoria_id: string;
  factura_id: string | null;
};

export type ChequeContable = {
  id: string;
  tipo: "emitido" | "recibido";
  estado: string;
  monto: number;
  fecha_pago: string;
  numero: string | null;
  transaccion_id: string | null;
};

export type ContextoContable = {
  /** Categoría → cuenta contable (null: sin asignar). */
  cuentaDeCategoria: Map<string, string | null>;
  imputaciones: Imputaciones;
  /** Movimiento conciliado con un extracto → cuenta contable de esa cuenta bancaria. */
  bancoConciliado: Map<string, string>;
  /** Movimientos que vienen de una factura o de un comprobante emitido: el monto ya incluye el IVA. */
  conComprobante: Set<string>;
};

const MEDIOS_CHEQUE = new Set(["cheque", "cheque_emitido", "cheque_a_emitir", "cheque_a_cobrar"]);
const ALICUOTAS = [0.21, 0.105, 0.27, 0.05, 0.025];
const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * ¿El monto del movimiento incluye el IVA? Los que vienen de Facturas o Facturar
 * guardan el total; los de la planilla, el neto con el IVA aparte. Si no hay
 * comprobante se mira la proporción: IVA = monto × 21% → aparte; IVA = monto × 21/121 → incluido.
 */
export function ivaIncluido(m: Pick<MovimientoContable, "id" | "monto" | "iva">, conComprobante: Set<string>) {
  if (conComprobante.has(m.id)) return true;
  const iva = m.iva ?? 0;
  const cerca = (valor: number) => Math.abs(valor - iva) <= Math.max(1, iva * 0.001);
  if (ALICUOTAS.some((a) => cerca(m.monto * a))) return false;
  return ALICUOTAS.some((a) => cerca((m.monto * a) / (1 + a)));
}

function contrapartida(m: MovimientoContable, c: ContextoContable): { cuenta: string; nota: string | null } {
  const im = c.imputaciones;
  if (m.estado === "pendiente") return { cuenta: m.tipo === "ingreso" ? im.deudores : im.proveedores, nota: "Pendiente" };
  if (MEDIOS_CHEQUE.has(m.medio_pago)) return { cuenta: m.tipo === "ingreso" ? im.cheques_en_cartera : im.cheques_a_pagar, nota: "Con cheque" };
  const banco = c.bancoConciliado.get(m.id);
  if (banco) return { cuenta: banco, nota: "Conciliado con extracto" };
  switch (m.medio_pago) {
    case "efectivo":
      return { cuenta: im.efectivo, nota: null };
    case "transferencia":
      return { cuenta: im.transferencia, nota: null };
    case "mercado_pago":
      return { cuenta: im.mercado_pago, nota: null };
    case "tarjeta":
      return { cuenta: m.tipo === "ingreso" ? im.tarjeta_ingreso : im.tarjeta_egreso, nota: null };
    default:
      return { cuenta: im.otro, nota: "Medio de pago sin especificar" };
  }
}

const linea = (cuenta_id: string, debe: number, haber: number, detalle: string | null = null): LineaAsiento => ({ cuenta_id, debe, haber, detalle });

export function armarAsientos(movimientos: MovimientoContable[], cheques: ChequeContable[], c: ContextoContable) {
  const asientos: Asiento[] = [];
  const im = c.imputaciones;
  let sinCuenta = 0;
  let sinMedio = 0;
  const conAsientoDeCheque = new Map<string, MovimientoContable>();

  for (const m of movimientos) {
    if (!m.fecha || m.estado === "proyectado" || m.monto <= 0) continue;

    const iva = m.facturado && m.iva && m.iva > 0 ? redondear(m.iva) : 0;
    const incluido = iva > 0 && ivaIncluido(m, c.conComprobante);
    const total = incluido ? m.monto : sumar([m.monto, iva]);
    const neto = incluido ? sumar([m.monto, -iva]) : m.monto;

    let cuentaResultado = c.cuentaDeCategoria.get(m.categoria_id) ?? null;
    if (!cuentaResultado) {
      sinCuenta++;
      cuentaResultado = m.tipo === "ingreso" ? im.ingresos_a_clasificar : im.egresos_a_clasificar;
    }
    const contra = contrapartida(m, c);
    if (contra.cuenta === im.otro && m.estado === "real") sinMedio++;
    if (m.estado === "real" && MEDIOS_CHEQUE.has(m.medio_pago)) conAsientoDeCheque.set(m.id, m);

    const lineas =
      m.tipo === "ingreso"
        ? [linea(contra.cuenta, total, 0), linea(cuentaResultado, 0, neto), ...(iva ? [linea(im.iva_debito, 0, iva)] : [])]
        : [linea(cuentaResultado, neto, 0), ...(iva ? [linea(im.iva_credito, iva, 0)] : []), linea(contra.cuenta, 0, total)];

    const notas = [contra.nota, iva ? (incluido ? "IVA incluido en el monto" : "IVA aparte del monto") : null].filter(Boolean);
    asientos.push({
      id: `mov:${m.id}`,
      empresa: m.empresa,
      fecha: m.fecha,
      descripcion: m.contraparte ? `${m.descripcion} · ${m.contraparte}` : m.descripcion,
      origen: "movimiento",
      origenId: m.id,
      nota: notas.length ? notas.join(" · ") : null,
      lineas,
    });
  }

  let chequesSinAsiento = 0;
  const deEstaEmpresa = new Set(movimientos.map((m) => m.id));
  for (const ch of cheques) {
    const salio = ch.tipo === "emitido" && ch.estado === "debitado";
    const entro = ch.tipo === "recibido" && ch.estado === "cobrado";
    if (!salio && !entro) continue;
    const m = ch.transaccion_id ? conAsientoDeCheque.get(ch.transaccion_id) : undefined;
    if (!m) {
      if (ch.transaccion_id && deEstaEmpresa.has(ch.transaccion_id)) chequesSinAsiento++;
      continue;
    }
    const banco = c.bancoConciliado.get(m.id) ?? im.transferencia;
    const numero = ch.numero ? ` N° ${ch.numero}` : "";
    asientos.push({
      id: `chq:${ch.id}`,
      empresa: m.empresa,
      fecha: ch.fecha_pago,
      descripcion: salio ? `Débito del cheque${numero} · ${m.descripcion}` : `Cobro del cheque${numero} · ${m.descripcion}`,
      origen: "cheque",
      origenId: ch.id,
      nota: null,
      lineas: salio ? [linea(im.cheques_a_pagar, ch.monto, 0), linea(banco, 0, ch.monto)] : [linea(banco, ch.monto, 0), linea(im.cheques_en_cartera, 0, ch.monto)],
    });
  }

  const avisos: Aviso[] = [];
  if (sinCuenta) avisos.push({ texto: "movimientos de categorías sin cuenta contable van a “a clasificar”", cantidad: sinCuenta, href: "/contabilidad/imputacion" });
  if (sinMedio) avisos.push({ texto: "movimientos reales sin medio de pago van a “Fondos a identificar”", cantidad: sinMedio });
  if (chequesSinAsiento)
    avisos.push({ texto: "cheques debitados o cobrados cuyo movimiento no está como real con medio cheque: no generan el pase al banco", cantidad: chequesSinAsiento, href: "/cheques" });
  return { asientos, avisos };
}

/** Orden del libro diario: por fecha; el mismo día, primero los automáticos y después los manuales. */
export function ordenarAsientos(asientos: Asiento[]) {
  const peso = { movimiento: 0, cheque: 1, manual: 2 } as const;
  return [...asientos].sort((a, b) => a.fecha.localeCompare(b.fecha) || peso[a.origen] - peso[b.origen] || a.id.localeCompare(b.id));
}
