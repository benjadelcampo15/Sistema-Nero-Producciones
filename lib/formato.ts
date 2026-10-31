const ZONA = "America/Argentina/Buenos_Aires";

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

export function formatoPesos(monto: number) {
  return pesos.format(monto);
}

/** "2026-10-21" → "21/10/2026" (sin pasar por Date para no correr el día por zona horaria). */
export function formatoFecha(fecha: string) {
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

/** Un instante (timestamp) como "31/10/2026 16:05", en hora de Argentina. */
export function formatoFechaHora(instante: string) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date(instante))
    .replace(",", "");
}

/** Fecha de hoy en Argentina como "YYYY-MM-DD". */
export function hoy() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
}

const dos = (n: number) => String(n).padStart(2, "0");
const ultimoDia = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();

/** Rango desde el primer día de un mes hasta el último de otro (meses 1-12; se normalizan desbordes). */
function rangoMeses(anio: number, mesInicio: number, mesFin: number) {
  const inicio = new Date(Date.UTC(anio, mesInicio - 1, 1));
  const fin = new Date(Date.UTC(anio, mesFin - 1, 1));
  const [ai, mi] = [inicio.getUTCFullYear(), inicio.getUTCMonth() + 1];
  const [af, mf] = [fin.getUTCFullYear(), fin.getUTCMonth() + 1];
  return { desde: `${ai}-${dos(mi)}-01`, hasta: `${af}-${dos(mf)}-${dos(ultimoDia(af, mf))}` };
}

/** Primer y último día del mes actual en Argentina. */
export function mesActual() {
  const [anio, mes] = hoy().split("-").map(Number);
  return rangoMeses(anio, mes, mes);
}

export type Periodo = { nombre: string; desde: string; hasta: string };

/** Atajos de período para los filtros. */
export function periodosRapidos(): Periodo[] {
  const [anio, mes] = hoy().split("-").map(Number);
  return [
    { nombre: "Este mes", ...rangoMeses(anio, mes, mes) },
    { nombre: "Mes anterior", ...rangoMeses(anio, mes - 1, mes - 1) },
    { nombre: "Últimos 3 meses", ...rangoMeses(anio, mes - 2, mes) },
    { nombre: "Este año", ...rangoMeses(anio, 1, 12) },
  ];
}

/**
 * Interpreta montos escritos a la argentina o con punto decimal:
 * "1.234,56" → 1234.56 · "1234,5" → 1234.5 · "1234.56" → 1234.56 · "1.500" → 1500
 */
export function parsearMonto(texto: string): number | null {
  let limpio = texto.replace(/[\s$]/g, "");
  if (!limpio) return null;

  if (limpio.includes(",")) {
    limpio = limpio.replace(/\./g, "").replace(",", ".");
  } else if (!/^\d+\.\d{1,2}$/.test(limpio)) {
    // Sin coma, los puntos son separadores de miles (salvo "1234.5" / "1234.56").
    limpio = limpio.replace(/\./g, "");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  const valor = Number(limpio);
  return Number.isFinite(valor) ? valor : null;
}

/** Suma en centavos para evitar errores de redondeo de punto flotante. */
export function sumar(montos: number[]) {
  return montos.reduce((total, m) => total + Math.round(m * 100), 0) / 100;
}

/** Desde el primer día del mes actual hasta el último día de `meses` meses después (Argentina). */
export function proximosMeses(meses: number) {
  const [anio, mes] = hoy().split("-").map(Number);
  return rangoMeses(anio, mes, mes + meses - 1);
}
