import { z } from "zod";

/** Un movimiento leído del extracto. monto > 0: crédito (entra plata); < 0: débito. */
export type LineaLeida = { fecha: string; concepto: string; referencia: string | null; monto: number; saldo: number | null };

export const esquemaLinea = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  concepto: z.string().trim().max(300),
  referencia: z.string().trim().max(100).nullable(),
  monto: z.number().min(-1e13).max(1e13).refine((n) => n !== 0, "Monto en cero"),
  saldo: z.number().min(-1e13).max(1e13).nullable(),
});

/** Qué columna de la planilla del banco es cada dato (por el texto del título). */
export const CAMPOS = ["fecha", "concepto", "referencia", "debito", "credito", "importe", "saldo"] as const;
export type Campo = (typeof CAMPOS)[number];
export const NOMBRE_CAMPO: Record<Campo, string> = {
  fecha: "Fecha",
  concepto: "Concepto",
  referencia: "Referencia / comprobante",
  debito: "Débito",
  credito: "Crédito",
  importe: "Importe (con signo)",
  saldo: "Saldo",
};

export const esquemaFormato = z.object({
  columnas: z.partialRecord(z.enum(CAMPOS), z.string().max(200)),
  // Algunos bancos muestran los débitos en positivo en una sola columna de importe.
  invertir: z.boolean().default(false),
});
export type FormatoExtracto = z.infer<typeof esquemaFormato>;

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Adivina el campo por el título de la columna. */
export function campoDeTitulo(titulo: string): Campo | null {
  const t = sinAcentos(titulo);
  if (!t) return null;
  if (/^fecha|fecha (de )?(mov|oper|valor)/.test(t)) return "fecha";
  if (/saldo/.test(t)) return "saldo";
  if (/debito|debe\b|egreso|retiro|cargo/.test(t)) return "debito";
  if (/credito|haber\b|ingreso|deposito|abono/.test(t)) return "credito";
  if (/importe|monto|valor\b/.test(t)) return "importe";
  if (/concepto|descrip|detalle|movimiento|leyenda/.test(t)) return "concepto";
  if (/referencia|comprobante|nro|numero|cod/.test(t)) return "referencia";
  return null;
}

/**
 * "1.234,56" · "1,234.56" · "-1.234" · "(1.234,56)" · "$ 1.234,56" → número.
 * El último separador con 1 o 2 decimales es el decimal.
 */
export function leerNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  let t = String(v ?? "").trim();
  if (!t || t === "-") return null;
  const negativo = /^\(.*\)$/.test(t) || /^-|-$/.test(t.replace(/\s/g, ""));
  t = t.replace(/[^\d.,]/g, "");
  if (!t) return null;
  const ultimoPunto = t.lastIndexOf(".");
  const ultimaComa = t.lastIndexOf(",");
  const sep = Math.max(ultimoPunto, ultimaComa);
  const decimales = sep >= 0 ? t.length - sep - 1 : 0;
  let entero = t;
  let fraccion = "";
  // Hay decimal si el último separador deja 1 o 2 dígitos (o si hay los dos separadores).
  if (sep >= 0 && (decimales <= 2 || (ultimoPunto >= 0 && ultimaComa >= 0))) {
    entero = t.slice(0, sep);
    fraccion = t.slice(sep + 1);
  }
  const n = Number(`${entero.replace(/[.,]/g, "")}.${fraccion || "0"}`);
  if (!Number.isFinite(n)) return null;
  return Math.round((negativo ? -n : n) * 100) / 100;
}

const dos = (n: number) => String(n).padStart(2, "0");

/** Fecha de Excel (Date o número de serie), "dd/mm/aaaa", "dd-mm-aa" o "aaaa-mm-dd" → "aaaa-mm-dd". */
export function leerFecha(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${dos(v.getMonth() + 1)}-${dos(v.getDate())}`;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
  }
  const t = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return valida(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
  if (m) return valida(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}
function valida(a: number, mes: number, d: number) {
  const f = new Date(Date.UTC(a, mes - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === mes - 1 && f.getUTCDate() === d ? `${a}-${dos(mes)}-${dos(d)}` : null;
}

/** Busca la fila de títulos (la primera, entre las 40 de arriba, con fecha y algún importe). */
export function filaDeTitulos(filas: unknown[][]) {
  return filas.slice(0, 40).findIndex((f) => {
    const campos = f.map((c) => campoDeTitulo(String(c ?? "")));
    return campos.includes("fecha") && campos.some((c) => c === "debito" || c === "credito" || c === "importe");
  });
}

/** Arma los movimientos con el formato elegido. Las filas sin fecha válida o sin importe se saltean. */
export function armarLineas(filas: unknown[][], iTitulos: number, formato: FormatoExtracto) {
  const titulos = filas[iTitulos].map((c) => String(c ?? "").trim());
  const col = (campo: Campo) => {
    const titulo = formato.columnas[campo];
    return titulo ? titulos.indexOf(titulo) : -1;
  };
  const c = Object.fromEntries(CAMPOS.map((k) => [k, col(k)])) as Record<Campo, number>;
  const lineas: LineaLeida[] = [];
  let salteadas = 0;
  for (const f of filas.slice(iTitulos + 1)) {
    if (!f.some((x) => String(x ?? "").trim())) continue;
    const fecha = c.fecha >= 0 ? leerFecha(f[c.fecha]) : null;
    let monto: number | null = null;
    if (c.importe >= 0) {
      const n = leerNumero(f[c.importe]);
      monto = n === null ? null : formato.invertir ? -n : n;
    } else {
      const deb = c.debito >= 0 ? leerNumero(f[c.debito]) : null;
      const cre = c.credito >= 0 ? leerNumero(f[c.credito]) : null;
      if (deb || cre) monto = Math.round(((cre ? Math.abs(cre) : 0) - (deb ? Math.abs(deb) : 0)) * 100) / 100;
    }
    if (!fecha || !monto) {
      salteadas++;
      continue;
    }
    lineas.push({
      fecha,
      concepto: c.concepto >= 0 ? String(f[c.concepto] ?? "").trim().slice(0, 300) : "",
      referencia: c.referencia >= 0 ? String(f[c.referencia] ?? "").trim().slice(0, 100) || null : null,
      monto,
      saldo: c.saldo >= 0 ? leerNumero(f[c.saldo]) : null,
    });
  }
  return { lineas, salteadas };
}

/**
 * Control del extracto: si trae saldos, cada saldo tiene que ser el anterior
 * más el movimiento (en el orden del archivo, ascendente o descendente).
 */
export function controlarSaldos(lineas: LineaLeida[]) {
  const conSaldo = lineas.filter((l) => l.saldo !== null);
  if (conSaldo.length < 2) return { verificable: false as const };
  const cierra = (lista: LineaLeida[]) =>
    lista.slice(1).filter((l, i) => Math.abs((lista[i].saldo as number) + l.monto - (l.saldo as number)) > 0.05).length;
  const errAsc = cierra(conSaldo);
  const errDesc = cierra([...conSaldo].reverse());
  return { verificable: true as const, errores: Math.min(errAsc, errDesc), descendente: errDesc < errAsc };
}

/** Para no cargar dos veces el mismo movimiento si se suben extractos que se pisan. */
export const huella = (l: LineaLeida, repeticion: number) => [l.fecha, l.monto.toFixed(2), sinAcentos(l.concepto), l.saldo?.toFixed(2) ?? "", repeticion].join("|");

export type EstadoLinea = "pendiente" | "conciliada" | "ignorada";
