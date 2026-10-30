import { diferenciaGasto, totalGasto, type Planilla } from "./planilla";

/** Categoría de Financiero de cada sector de gastos: la primera que exista. */
const CATEGORIAS_DE_SECTOR: Record<string, string[]> = {
  "Artística": ["Artística"],
  "Técnica": ["Técnica"],
  "Infraestructura": ["Logística", "Producción"],
  "Contenido y activaciones": ["Activaciones", "Marketing"],
  "Recursos humanos": ["Staff", "Sueldos"],
  "Mercadería": ["Mercadería", "Proveedores"],
  "Gastronomía": ["Gastronomía", "Producción"],
  "Seguros y aranceles": ["Seguros", "Impuestos"],
};

export type Categoria = { id: string; nombre: string; tipo: "ingreso" | "egreso" };

/** Un movimiento de Financiero que sale de un renglón de la planilla. */
export type MovimientoDePlanilla = {
  ref: string;
  tipo: "ingreso" | "egreso";
  monto: number;
  fecha: string;
  descripcion: string;
  categoria_id: string;
  estado: "real" | "pendiente";
  facturado: boolean;
  iva: number | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Los movimientos de Financiero de la planilla de un evento:
 *   ingreso → un movimiento por lo bruto (real si está pagado; si no, pendiente)
 *   gasto   → la seña (real) y lo que falta pagar (pendiente), cada uno por su lado
 * Lo pendiente va con la fecha del evento; lo pagado, con la de hoy (si ya estaba
 * pagado conserva su fecha). Los renglones en cero no generan nada.
 */
export function movimientosDePlanilla(p: Planilla, evento: { fecha: string }, categorias: Categoria[], hoy: string): MovimientoDePlanilla[] {
  const categoria = (tipo: "ingreso" | "egreso", nombres: string[]) =>
    (nombres.map((n) => categorias.find((c) => c.tipo === tipo && c.nombre === n)).find(Boolean) ??
      categorias.find((c) => c.tipo === tipo && c.nombre === "Eventos") ??
      categorias.find((c) => c.tipo === tipo && c.nombre.startsWith("Otros")) ??
      categorias.find((c) => c.tipo === tipo))!.id;
  const movimientos: MovimientoDePlanilla[] = [];

  for (const i of p.ingresos) {
    if (!i.id || i.bruto <= 0) continue;
    movimientos.push({
      ref: `ingreso:${i.id}`,
      tipo: "ingreso",
      monto: r2(i.bruto),
      fecha: i.pagado ? hoy : evento.fecha,
      descripcion: i.detalle.trim() || "Ingreso del evento",
      categoria_id: categoria("ingreso", ["Eventos"]),
      estado: i.pagado ? "real" : "pendiente",
      facturado: i.factura,
      iva: i.factura && i.iva > 0 ? r2(i.iva) : null,
    });
  }

  for (const g of p.gastos) {
    const total = totalGasto(g);
    if (!g.id || total <= 0) continue;
    const sena = Math.min(Math.max(g.sena, 0), total);
    const resta = diferenciaGasto({ ...g, sena });
    const base = {
      tipo: "egreso" as const,
      categoria_id: categoria("egreso", CATEGORIAS_DE_SECTOR[g.sector] ?? []),
      facturado: g.tipo_factura !== "",
    };
    const nombre = g.detalle.trim() || g.sector || "Gasto del evento";
    // El IVA se reparte entre la seña y el resto según el monto de cada uno.
    const iva = (parte: number) => (g.iva > 0 ? r2((g.iva * parte) / total) : null);
    if (sena > 0) {
      movimientos.push({ ...base, ref: `gasto:${g.id}:sena`, monto: r2(sena), fecha: hoy, descripcion: resta > 0 ? `${nombre} · seña` : nombre, estado: "real", iva: iva(sena) });
    }
    if (resta > 0) {
      movimientos.push({ ...base, ref: `gasto:${g.id}:resta`, monto: r2(resta), fecha: evento.fecha, descripcion: sena > 0 ? `${nombre} · saldo` : nombre, estado: "pendiente", iva: iva(resta) });
    }
  }
  return movimientos;
}
