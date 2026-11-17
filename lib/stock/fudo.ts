/**
 * Consumido: reporte de productos de FUDO vs consumo físico (lógica compartida,
 * sin acceso a la base). El Excel de FUDO trae dos hojas:
 *   Detalle  → la fuente de las ventas (fecha, categoría, producto, cantidad, monto)
 *   Ranking  → el consolidado del período: solo para validar totales, nunca se suma.
 */

export type LineaFudo = {
  fecha: string | null;
  categoria: string;
  subcategoria: string;
  producto: string;
  clave: string;
  cantidad: number;
  monto: number;
  cmv: number | null;
  huella: string;
};
export type FilaRanking = { producto: string; clave: string; cantidad: number; monto: number };
export type LecturaFudo = {
  lineas: LineaFudo[];
  ranking: FilaRanking[];
  errores: string[];
  avisos: string[];
  desde: string | null;
  hasta: string | null;
  hojas: { detalle: string | null; ranking: string | null };
};

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Nombre de producto normalizado (para reconocerlo en otras importaciones y en las recetas). */
export const claveProducto = (s: string) => sinAcentos(String(s)).toUpperCase().replace(/\s+/g, " ").trim();
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** "$ 1.234,50", "1234.5", 1234.5 → número (null si no es un número). */
export function numeroFudo(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v ?? "").replace(/[$\s%]/g, "").trim();
  if (!t) return null;
  const limpio = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^-?\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Fecha de una celda (Date, "31/10/2026", "2026-10-31" o número de serie de Excel) → "AAAA-MM-DD". */
export function fechaFudo(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const t = String(v ?? "").trim();
  let m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(t);
  if (m) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${anio}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

type Columnas = Partial<Record<"fecha" | "categoria" | "subcategoria" | "producto" | "cantidad" | "monto" | "cmv", number>>;

/** Busca la fila de encabezados (la que tiene "Producto" y "Cantidad") y a qué columna va cada dato. */
function encabezados(filas: unknown[][]): { fila: number; col: Columnas } | null {
  for (let i = 0; i < Math.min(filas.length, 30); i++) {
    const nombres = filas[i].map((c) => sinAcentos(String(c ?? "")).toLowerCase().trim());
    if (!nombres.some((n) => n.includes("producto")) || !nombres.some((n) => n.includes("cantidad"))) continue;
    const col: Columnas = {};
    nombres.forEach((n, j) => {
      if (!n) return;
      if (n.startsWith("fecha")) col.fecha ??= j;
      else if (n.startsWith("sub") && n.includes("categ")) col.subcategoria ??= j;
      else if (n.includes("categ")) col.categoria ??= j;
      else if (n.includes("producto")) col.producto ??= j;
      else if (n.includes("cantidad")) col.cantidad ??= j;
      else if ((n.includes("monto") || n.includes("ingreso")) && !n.includes("%")) col.monto ??= j;
      else if (n.includes("cmv") && !n.includes("%")) col.cmv ??= j;
    });
    return { fila: i, col };
  }
  return null;
}

const esTotal = (s: string) => /^total/i.test(s.trim());

/** Lee las dos hojas del reporte (filas como arrays de celdas, por nombre de hoja). */
export function leerReporteFudo(hojas: Record<string, unknown[][]>): LecturaFudo {
  const nombres = Object.keys(hojas);
  const buscar = (re: RegExp) => nombres.find((n) => re.test(sinAcentos(n).toLowerCase())) ?? null;
  const nDetalle = buscar(/detalle/) ?? nombres.find((n) => !/ranking/i.test(n)) ?? null;
  const nRanking = buscar(/ranking/);
  const errores: string[] = [];
  const avisos: string[] = [];
  const lineas: LineaFudo[] = [];
  const ranking: FilaRanking[] = [];

  if (!nDetalle) errores.push("No se encontró la hoja «Detalle».");
  else {
    const filas = hojas[nDetalle];
    const e = encabezados(filas);
    if (!e || e.col.producto === undefined || e.col.cantidad === undefined) errores.push("En la hoja «Detalle» no están las columnas Producto y Cantidades vendidas.");
    else {
      if (e.col.fecha === undefined) avisos.push("La hoja «Detalle» no tiene columna de fecha: las ventas quedan sin día.");
      const vistas = new Map<string, number>();
      for (let i = e.fila + 1; i < filas.length; i++) {
        const f = filas[i];
        const producto = String(f[e.col.producto] ?? "").trim();
        if (!producto || esTotal(producto)) continue;
        const cantidad = numeroFudo(f[e.col.cantidad]);
        if (cantidad === null) {
          errores.push(`Fila ${i + 1}: «${producto}» no tiene una cantidad válida.`);
          continue;
        }
        const fecha = e.col.fecha !== undefined ? fechaFudo(f[e.col.fecha]) : null;
        if (e.col.fecha !== undefined && !fecha) avisos.push(`Fila ${i + 1}: «${producto}» tiene una fecha que no se pudo leer.`);
        const monto = e.col.monto !== undefined ? (numeroFudo(f[e.col.monto]) ?? 0) : 0;
        const clave = claveProducto(producto);
        // Huella: la misma venta (día, producto, cantidad e importe). Si se repite en el archivo, se numera.
        const base = `${fecha ?? ""}|${clave}|${r3(cantidad)}|${r2(monto)}`;
        const n = (vistas.get(base) ?? 0) + 1;
        vistas.set(base, n);
        lineas.push({
          fecha,
          categoria: e.col.categoria !== undefined ? String(f[e.col.categoria] ?? "").trim() : "",
          subcategoria: e.col.subcategoria !== undefined ? String(f[e.col.subcategoria] ?? "").trim() : "",
          producto,
          clave,
          cantidad: r3(cantidad),
          monto: r2(monto),
          cmv: e.col.cmv !== undefined ? numeroFudo(f[e.col.cmv]) : null,
          huella: `${base}#${n}`,
        });
      }
      if (!lineas.length) errores.push("La hoja «Detalle» no tiene ventas.");
    }
  }

  if (!nRanking) avisos.push("No se encontró la hoja «Ranking del período»: no se pueden validar los totales.");
  else {
    const filas = hojas[nRanking];
    const e = encabezados(filas);
    if (e && e.col.producto !== undefined && e.col.cantidad !== undefined) {
      for (let i = e.fila + 1; i < filas.length; i++) {
        const f = filas[i];
        const producto = String(f[e.col.producto] ?? "").trim();
        if (!producto || esTotal(producto)) continue;
        ranking.push({
          producto,
          clave: claveProducto(producto),
          cantidad: r3(numeroFudo(f[e.col.cantidad]) ?? 0),
          monto: r2(e.col.monto !== undefined ? (numeroFudo(f[e.col.monto]) ?? 0) : 0),
        });
      }
    } else avisos.push("La hoja «Ranking» no tiene las columnas esperadas: no se validan los totales.");
  }
  if (lineas.some((l) => l.cmv) === false && lineas.length) avisos.push("El CMV del reporte está en cero: no se usa como costo.");

  const fechas = lineas.map((l) => l.fecha).filter((x): x is string => !!x).sort();
  return { lineas, ranking, errores, avisos, desde: fechas[0] ?? null, hasta: fechas.at(-1) ?? null, hojas: { detalle: nDetalle, ranking: nRanking } };
}

/** Totales del Detalle contra el Ranking (por producto y en total). */
export function validarContraRanking(lineas: LineaFudo[], ranking: FilaRanking[]) {
  const porClave = new Map<string, { cantidad: number; monto: number; nombre: string }>();
  for (const l of lineas) {
    const x = porClave.get(l.clave) ?? { cantidad: 0, monto: 0, nombre: l.producto };
    x.cantidad = r3(x.cantidad + l.cantidad);
    x.monto = r2(x.monto + l.monto);
    porClave.set(l.clave, x);
  }
  const diferencias: { producto: string; detalle: number; ranking: number; montoDetalle: number; montoRanking: number }[] = [];
  for (const r of ranking) {
    const d = porClave.get(r.clave);
    if (!d || Math.abs(d.cantidad - r.cantidad) > 0.001 || Math.abs(d.monto - r.monto) > 0.5) {
      diferencias.push({ producto: r.producto, detalle: d?.cantidad ?? 0, ranking: r.cantidad, montoDetalle: d?.monto ?? 0, montoRanking: r.monto });
    }
  }
  for (const [clave, d] of porClave) {
    if (ranking.length && !ranking.some((r) => r.clave === clave)) diferencias.push({ producto: d.nombre, detalle: d.cantidad, ranking: 0, montoDetalle: d.monto, montoRanking: 0 });
  }
  const unidades = r3(lineas.reduce((s, l) => s + l.cantidad, 0));
  const monto = r2(lineas.reduce((s, l) => s + l.monto, 0));
  const rUnidades = r3(ranking.reduce((s, r) => s + r.cantidad, 0));
  const rMonto = r2(ranking.reduce((s, r) => s + r.monto, 0));
  return { unidades, monto, rankingUnidades: rUnidades, rankingMonto: rMonto, coincide: !ranking.length || diferencias.length === 0, diferencias };
}

// ─── Comparación ─────────────────────────────────────────────────────────

export type Receta = { clave: string; nombre: string; tipo: "receta" | "ignorar"; items: { producto_id: string; cantidad: number }[] };
export type Fisico = {
  producto_id: string;
  inicial: number;
  reposiciones: number;
  final: number;
  mermas: number;
  roturas: number;
  invitaciones: number;
  corregido: number | null;
  motivo: string | null;
};
export type Producto = { id: string; nombre: string; unidad: string };
export type EstadoComparacion = "conciliado" | "diferencia" | "sin_conteo" | "sin_fudo";

/** Consumo físico de un renglón: inicial + reposiciones − final (o la corrección autorizada). */
export const consumoFisico = (f: Fisico) => (f.corregido ?? r3(f.inicial + f.reposiciones - f.final));
export const justificado = (f: Fisico) => r3(f.mermas + f.roturas + f.invitaciones);

/**
 * Comparación por producto de stock. Teórico = Σ ventas FUDO × receta.
 * Diferencia = (consumo físico − mermas/roturas/invitaciones) − teórico:
 * positiva, se consumió más de lo vendido; negativa, FUDO vendió más de lo contado.
 */
export function compararConsumo(
  lineas: Pick<LineaFudo, "clave" | "producto" | "cantidad" | "monto">[],
  recetas: Receta[],
  fisicos: Fisico[],
  productos: Producto[],
  tolerancia: { unidades: number; pct: number },
) {
  const receta = new Map(recetas.map((r) => [r.clave, r]));
  const teorico = new Map<string, number>();
  const origen = new Map<string, { producto: string; vendidas: number; porUnidad: number }[]>();
  const pendientes = new Map<string, { clave: string; producto: string; vendidas: number; monto: number }>();
  let ignoradas = 0;
  for (const l of lineas) {
    const r = receta.get(l.clave);
    if (r?.tipo === "ignorar") {
      ignoradas += l.cantidad;
      continue;
    }
    if (!r || !r.items.length) {
      const p = pendientes.get(l.clave) ?? { clave: l.clave, producto: l.producto, vendidas: 0, monto: 0 };
      p.vendidas = r3(p.vendidas + l.cantidad);
      p.monto = r2(p.monto + l.monto);
      pendientes.set(l.clave, p);
      continue;
    }
    for (const it of r.items) {
      teorico.set(it.producto_id, r3((teorico.get(it.producto_id) ?? 0) + l.cantidad * it.cantidad));
      const o = origen.get(it.producto_id) ?? [];
      const ya = o.find((x) => x.producto === r.nombre);
      if (ya) ya.vendidas = r3(ya.vendidas + l.cantidad);
      else o.push({ producto: r.nombre, vendidas: l.cantidad, porUnidad: it.cantidad });
      origen.set(it.producto_id, o);
    }
  }
  const fisico = new Map(fisicos.map((f) => [f.producto_id, f]));
  const ids = [...new Set([...teorico.keys(), ...fisico.keys()])];
  const filas = ids
    .map((id) => {
      const p = productos.find((x) => x.id === id);
      const t = teorico.get(id) ?? 0;
      const f = fisico.get(id);
      const consumo = f ? consumoFisico(f) : null;
      const just = f ? justificado(f) : 0;
      const diferencia = consumo === null ? null : r3(consumo - just - t);
      const pct = diferencia === null || !t ? null : Math.round((diferencia / t) * 10000) / 100;
      let estado: EstadoComparacion;
      if (!f) estado = "sin_conteo";
      else if (!t && !teorico.has(id)) estado = "sin_fudo";
      else if (Math.abs(diferencia!) <= tolerancia.unidades + 0.0005 || (pct !== null && Math.abs(pct) <= tolerancia.pct && tolerancia.pct > 0)) estado = "conciliado";
      else estado = "diferencia";
      return {
        producto_id: id,
        producto: p?.nombre ?? "Producto borrado",
        unidad: p?.unidad ?? "",
        teorico: t,
        consumo,
        justificado: just,
        diferencia,
        pct,
        estado,
        origen: origen.get(id) ?? [],
        corregido: f?.corregido ?? null,
      };
    })
    .sort((a, b) => a.producto.localeCompare(b.producto));
  return { filas, pendientes: [...pendientes.values()].sort((a, b) => b.vendidas - a.vendidas), ignoradas };
}

export const NOMBRE_ESTADO: Record<EstadoComparacion, string> = {
  conciliado: "Conciliado",
  diferencia: "Con diferencia",
  sin_conteo: "Sin conteo físico",
  sin_fudo: "Sin ventas en FUDO",
};
export const COLOR_ESTADO: Record<EstadoComparacion, string> = {
  conciliado: "bg-green-100 text-green-800",
  diferencia: "bg-red-100 text-red-800",
  sin_conteo: "bg-amber-100 text-amber-900",
  sin_fudo: "bg-stone-200 text-stone-700",
};
