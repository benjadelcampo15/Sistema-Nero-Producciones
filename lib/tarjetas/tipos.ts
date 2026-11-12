import { z } from "zod";
import { NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";

/** A quién se asigna un consumo: una empresa, o las dos en partes iguales ("ambas" = 50/50). */
export const EMPRESAS_TARJETA = ["nero", "ruta", "ambas"] as const;
export type EmpresaTarjeta = (typeof EMPRESAS_TARJETA)[number];
export const nombreEmpresaTarjeta = (e: EmpresaTarjeta) => (e === "ambas" ? `${NOMBRE_EMPRESA.nero} / ${NOMBRE_EMPRESA.ruta} (50/50)` : NOMBRE_EMPRESA[e]);

const centavos = (n: number) => Math.round(n * 100);

/**
 * La parte de cada empresa de un importe: entero a una, o la mitad a cada una
 * (el centavo impar va a la primera, siempre). Las dos partes suman exacto el importe.
 */
export function partesDe(importe: number, empresa: EmpresaTarjeta | null): Record<Empresa, number> {
  if (empresa === "nero") return { nero: importe, ruta: 0 };
  if (empresa === "ruta") return { nero: 0, ruta: importe };
  if (empresa !== "ambas") return { nero: 0, ruta: 0 };
  const total = centavos(importe);
  const nero = Math.sign(total) * Math.ceil(Math.abs(total) / 2);
  return { nero: nero / 100, ruta: (total - nero) / 100 };
}

export const TIPOS_MOVIMIENTO = ["consumo", "cargo", "pago"] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

/** Un renglón del resumen tal como se leyó (antes de guardarlo). */
export const esquemaLinea = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  descripcion: z.string().trim().max(300),
  cupon: z.string().trim().max(40).nullable(),
  cuota: z.number().int().positive().max(999).nullable(),
  cuotas: z.number().int().positive().max(999).nullable(),
  pesos: z.number().finite(),
  dolares: z.number().finite(),
  tipo: z.enum(TIPOS_MOVIMIENTO),
});
export type LineaTarjeta = z.infer<typeof esquemaLinea>;

export type MovimientoTarjeta = LineaTarjeta & {
  id: string;
  orden: number;
  empresa: EmpresaTarjeta | null;
  detalle: string | null;
  reparto_nero: number;
};

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * La parte fija de una descripción, para reconocer al mismo comercio en
 * otros meses: "FACEBK *SB49PAVRL2 USD 6,94" → "FACEBK";
 * "MERPAGO*ALBERDIWORKS C.01/06" → "MERPAGO ALBERDIWORKS";
 * "OPENAI *CHATGPT in1SmcnmCUSD 20,00" → "OPENAI CHATGPT".
 * Se sacan el importe en dólares, las cuotas y las palabras con números (códigos de operación).
 */
export function claveDescripcion(descripcion: string) {
  const limpia = sinAcentos(descripcion.toUpperCase())
    .replace(/\b(USD|EUR|BRL|GBP|CLP|UYU)\s*[\d.,]+/g, " ")
    .replace(/\bC\.?\s*\d{1,3}\s*\/\s*\d{1,3}\b/g, " ")
    .replace(/[*.,;:/\\()\-_'"#]+/g, " ");
  return limpia
    .split(/\s+/)
    .filter((p) => p.length > 0 && !/\d/.test(p))
    .slice(0, 3)
    .join(" ");
}

/** "C.02/06" o "CUOTA 02/06" dentro de la descripción. */
export function cuotaDeDescripcion(descripcion: string): { cuota: number; cuotas: number } | null {
  const m = descripcion.match(/\bC(?:UOTA)?\.?\s*(\d{1,3})\s*\/\s*(\d{1,3})\b/i);
  if (!m) return null;
  const cuota = Number(m[1]);
  const cuotas = Number(m[2]);
  return cuota > 0 && cuotas >= cuota ? { cuota, cuotas } : null;
}

/** Impuestos, intereses y comisiones del banco (van aparte y se reparten entre las empresas). */
const CARGOS = [
  /IMP(UESTO)?\.?\s*(DE\s*)?SELLOS/,
  /INTERES/,
  /PUNIT/,
  /\bIVA\b/,
  /COMISION/,
  /PERCEP/,
  /\bRG\s*\d/,
  /IIBB|INGRESOS BRUTOS/,
  /IMP(UESTO)?\.?\s*PAIS/,
  /CARGO/,
  /SEGURO/,
  /MANT(ENIMIENTO)?\.?\s*(DE\s*)?CUENTA/,
];
const PAGOS = [/SU PAGO/, /^PAGO\b/, /DEVOLUCION/, /BONIFICACION/, /REINTEGRO/, /ANULACION/];

/** Tipo según la descripción (lo que leyó la IA se corrige con esto si no coincide). */
export function tipoDeDescripcion(descripcion: string, importe: number): TipoMovimiento {
  const d = sinAcentos(descripcion.toUpperCase());
  if (importe < 0 || PAGOS.some((r) => r.test(d))) return "pago";
  if (CARGOS.some((r) => r.test(d))) return "cargo";
  return "consumo";
}

/** Para reconocer el mismo renglón en dos resúmenes; los repetidos dentro del archivo se distinguen por su número de aparición. */
export const huella = (l: LineaTarjeta, repeticion: number) =>
  [l.fecha ?? "", l.pesos.toFixed(2), l.dolares.toFixed(2), sinAcentos(l.descripcion.toUpperCase()).replace(/\s+/g, " "), l.cupon ?? "", l.cuota ?? "", repeticion].join("|");

export type Regla = { id: string; clave: string; empresa: EmpresaTarjeta | null; detalle: string | null; ambigua?: boolean };

/** La regla con la clave más larga que coincide con el comienzo de la clave de la descripción. */
export function reglaPara(descripcion: string, reglas: Regla[]) {
  const clave = claveDescripcion(descripcion);
  let mejor: Regla | null = null;
  for (const r of reglas) {
    if ((clave === r.clave || clave.startsWith(r.clave + " ")) && (!mejor || r.clave.length > mejor.clave.length)) mejor = r;
  }
  return mejor;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export type Totales = {
  /**
   * Consumos de cada empresa (incluye su mitad de los compartidos), sin asignar
   * y compartidos (50/50, el total; ya repartido en nero y ruta), en pesos y en dólares.
   */
  consumos: Record<Empresa | "sin" | "ambas", { pesos: number; dolares: number; cantidad: number }>;
  cargos: { pesos: number; dolares: number; nero: number; ruta: number };
  pagos: { pesos: number; dolares: number };
  /** Lo que le toca a cada empresa en pesos (dólares a la cotización + su parte de los cargos). */
  empresa: Record<Empresa, number>;
  /** Consumos en dólares sin cotización: no se pueden pasar a pesos. */
  faltaCotizacion: boolean;
};

export function calcularTotales(movimientos: Pick<MovimientoTarjeta, "tipo" | "pesos" | "dolares" | "empresa" | "reparto_nero">[], cotizacion: number | null): Totales {
  const t: Totales = {
    consumos: {
      nero: { pesos: 0, dolares: 0, cantidad: 0 },
      ruta: { pesos: 0, dolares: 0, cantidad: 0 },
      sin: { pesos: 0, dolares: 0, cantidad: 0 },
      ambas: { pesos: 0, dolares: 0, cantidad: 0 },
    },
    cargos: { pesos: 0, dolares: 0, nero: 0, ruta: 0 },
    pagos: { pesos: 0, dolares: 0 },
    empresa: { nero: 0, ruta: 0 },
    faltaCotizacion: false,
  };
  let cargosTotal = 0;
  const enPesos = (m: { pesos: number; dolares: number }) => {
    if (m.dolares && !cotizacion) t.faltaCotizacion = true;
    return m.pesos + m.dolares * (cotizacion ?? 0);
  };
  for (const m of movimientos) {
    if (m.tipo === "pago") {
      t.pagos.pesos += m.pesos;
      t.pagos.dolares += m.dolares;
    } else if (m.tipo === "cargo") {
      t.cargos.pesos += m.pesos;
      t.cargos.dolares += m.dolares;
      const total = enPesos(m);
      cargosTotal += total;
      t.cargos.nero += (total * m.reparto_nero) / 100;
    } else {
      const c = t.consumos[m.empresa ?? "sin"];
      c.pesos += m.pesos;
      c.dolares += m.dolares;
      c.cantidad++;
      if (m.empresa === "ambas") {
        // Compartido: la mitad de los pesos y de los dólares a cada una (sin duplicar el consumo).
        const pesos = partesDe(m.pesos, "ambas");
        const dolares = partesDe(m.dolares, "ambas");
        t.consumos.nero.pesos += pesos.nero;
        t.consumos.ruta.pesos += pesos.ruta;
        t.consumos.nero.dolares += dolares.nero;
        t.consumos.ruta.dolares += dolares.ruta;
      }
      // En pesos (dólares a la cotización): el reparto se hace sobre el total, así suma exacto.
      const partes = partesDe(redondear(enPesos(m)), m.empresa);
      t.empresa.nero += partes.nero;
      t.empresa.ruta += partes.ruta;
    }
  }
  // La segunda empresa paga lo que queda: así las dos partes suman justo el total (sin perder centavos al redondear).
  t.cargos.nero = redondear(t.cargos.nero);
  t.cargos.ruta = redondear(redondear(cargosTotal) - t.cargos.nero);
  t.empresa.nero += t.cargos.nero;
  t.empresa.ruta += t.cargos.ruta;
  for (const c of Object.values(t.consumos)) {
    c.pesos = redondear(c.pesos);
    c.dolares = redondear(c.dolares);
  }
  t.cargos = { pesos: redondear(t.cargos.pesos), dolares: redondear(t.cargos.dolares), nero: redondear(t.cargos.nero), ruta: redondear(t.cargos.ruta) };
  t.pagos = { pesos: redondear(t.pagos.pesos), dolares: redondear(t.pagos.dolares) };
  t.empresa = { nero: redondear(t.empresa.nero), ruta: redondear(t.empresa.ruta) };
  return t;
}

export type Control = { moneda: "pesos" | "dolares"; concepto: string; esperado: number; calculado: number; ok: boolean };

/**
 * Controles contra los totales del PDF: saldo anterior + todos los renglones
 * = saldo actual (en cada moneda), y la suma de consumos = el total de consumos.
 */
export function controlar(
  movimientos: Pick<MovimientoTarjeta, "tipo" | "pesos" | "dolares">[],
  pdf: { saldo_anterior_ars: number | null; saldo_anterior_usd: number | null; saldo_actual_ars: number | null; saldo_actual_usd: number | null; total_consumos_ars: number | null; total_consumos_usd: number | null },
): Control[] {
  const suma = (filtro: (m: (typeof movimientos)[number]) => boolean, campo: "pesos" | "dolares") =>
    redondear(movimientos.filter(filtro).reduce((s, m) => s + m[campo], 0));
  const controles: Control[] = [];
  const agregar = (moneda: Control["moneda"], concepto: string, esperado: number | null, calculado: number) => {
    if (esperado === null) return;
    controles.push({ moneda, concepto, esperado, calculado, ok: Math.abs(esperado - calculado) < 0.05 });
  };
  agregar("pesos", "Consumos en pesos", pdf.total_consumos_ars, suma((m) => m.tipo === "consumo", "pesos"));
  agregar("dolares", "Consumos en dólares", pdf.total_consumos_usd, suma((m) => m.tipo === "consumo", "dolares"));
  if (pdf.saldo_actual_ars !== null && pdf.saldo_anterior_ars !== null) {
    agregar("pesos", "Saldo anterior + movimientos = saldo actual ($)", pdf.saldo_actual_ars, redondear(pdf.saldo_anterior_ars + suma(() => true, "pesos")));
  }
  if (pdf.saldo_actual_usd !== null && pdf.saldo_anterior_usd !== null) {
    agregar("dolares", "Saldo anterior + movimientos = saldo actual (U$S)", pdf.saldo_actual_usd, redondear(pdf.saldo_anterior_usd + suma(() => true, "dolares")));
  }
  return controles;
}

export const NOMBRE_MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** Mes del resumen: el del cierre ("Septiembre 2026"). */
export const mesDelResumen = (fechaCierre: string) => `${NOMBRE_MES[Number(fechaCierre.slice(5, 7)) - 1]} ${fechaCierre.slice(0, 4)}`;

export const formatoDolares = (n: number) =>
  `U$S ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
