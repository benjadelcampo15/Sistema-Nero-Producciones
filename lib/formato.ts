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

/** Fecha de hoy en Argentina como "YYYY-MM-DD". */
export function hoy() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
}

/** Primer y último día del mes actual en Argentina. */
export function mesActual() {
  const [anio, mes] = hoy().split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, "0");
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimoDia).padStart(2, "0")}` };
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
