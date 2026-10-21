export const ESTADOS_PRESUPUESTO = ["borrador", "enviado", "aceptado", "rechazado"] as const;
export type EstadoPresupuesto = (typeof ESTADOS_PRESUPUESTO)[number];

export const NOMBRE_ESTADO_PRESUPUESTO: Record<EstadoPresupuesto | "vencido", string> = {
  borrador: "Borrador",
  enviado: "Enviado",
  aceptado: "Aceptado",
  rechazado: "Rechazado",
  vencido: "Vencido",
};

export const COLOR_ESTADO_PRESUPUESTO: Record<EstadoPresupuesto | "vencido", string> = {
  borrador: "bg-stone-200 text-stone-700",
  enviado: "bg-sky-100 text-sky-800",
  aceptado: "bg-green-100 text-green-800",
  rechazado: "bg-red-100 text-red-800",
  vencido: "bg-amber-100 text-amber-800",
};

export const MODOS_IVA = [
  { id: "mas_iva", nombre: "Precios + IVA (21%)" },
  { id: "iva_incluido", nombre: "IVA incluido" },
  { id: "sin_iva", nombre: "Sin IVA" },
] as const;
export type ModoIva = (typeof MODOS_IVA)[number]["id"];

export const RUBROS_SUGERIDOS = [
  "Técnica",
  "Sonido e iluminación",
  "Artística",
  "Catering",
  "Barra",
  "Ambientación",
  "Logística",
  "Personal",
  "Seguridad",
  "Producción",
  "Otros",
];

export type ItemPresupuesto = {
  rubro: string;
  descripcion: string;
  cantidad: number;
  /** Precio unitario que ve el cliente. */
  precio: number;
  /** Costo unitario interno (el cliente no lo ve). */
  costo: number | null;
};

export type Presupuesto = {
  id: string;
  numero: number;
  token: string;
  estado: EstadoPresupuesto;
  fecha: string;
  validez_dias: number;
  cliente_nombre: string;
  cliente_cuit: string | null;
  cliente_contacto: string | null;
  cliente_email: string | null;
  cliente_telefono: string | null;
  evento_nombre: string | null;
  evento_fecha: string | null;
  evento_lugar: string | null;
  invitados: number | null;
  items: ItemPresupuesto[];
  modo_iva: ModoIva;
  descuento_pct: number;
  forma_pago: string | null;
  incluye: string | null;
  observaciones: string | null;
  enviado_en: string | null;
  visto_en: string | null;
  respondido_en: string | null;
  respondido_por: string | null;
  evento_id: string | null;
  creado_en: string;
};

const redondear = (n: number) => Math.round(n * 100) / 100;
const IVA = 0.21;

/**
 * Totales del presupuesto. Con "IVA incluido" los precios ya tienen IVA: se
 * informa cuánto IVA contienen. El costo interno se compara contra el neto.
 */
export function calcularTotales(items: ItemPresupuesto[], modoIva: ModoIva, descuentoPct: number) {
  const subtotal = redondear(items.reduce((t, i) => t + i.cantidad * i.precio, 0));
  const descuento = redondear((subtotal * descuentoPct) / 100);
  const conDescuento = redondear(subtotal - descuento);

  let neto: number;
  let iva: number;
  let total: number;
  if (modoIva === "mas_iva") {
    neto = conDescuento;
    iva = redondear(neto * IVA);
    total = redondear(neto + iva);
  } else if (modoIva === "iva_incluido") {
    total = conDescuento;
    neto = redondear(total / (1 + IVA));
    iva = redondear(total - neto);
  } else {
    neto = conDescuento;
    iva = 0;
    total = conDescuento;
  }

  const costo = redondear(items.reduce((t, i) => t + i.cantidad * (i.costo ?? 0), 0));
  const tieneCostos = items.some((i) => i.costo !== null && i.costo > 0);
  const margen = tieneCostos ? redondear(neto - costo) : null;
  const margenPct = tieneCostos && neto > 0 ? Math.round(((neto - costo) / neto) * 100) : null;

  return { subtotal, descuento, neto, iva, total, costo, margen, margenPct };
}

/** Ítems agrupados por rubro, en el orden en que aparecen. */
export function agruparPorRubro(items: ItemPresupuesto[]) {
  const grupos = new Map<string, ItemPresupuesto[]>();
  for (const it of items) {
    const rubro = it.rubro.trim() || "General";
    grupos.set(rubro, [...(grupos.get(rubro) ?? []), it]);
  }
  return [...grupos.entries()].map(([rubro, lista]) => ({
    rubro,
    items: lista,
    subtotal: redondear(lista.reduce((t, i) => t + i.cantidad * i.precio, 0)),
  }));
}

export function numeroPresupuesto(numero: number) {
  return `P-${String(numero).padStart(4, "0")}`;
}

/** Fecha hasta la que vale el presupuesto (YYYY-MM-DD). */
export function venceEl(p: Pick<Presupuesto, "fecha" | "validez_dias">) {
  const d = new Date(`${p.fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + p.validez_dias);
  return d.toISOString().slice(0, 10);
}

/** Estado a mostrar: un enviado que pasó su validez se ve como vencido. */
export function estadoVisible(p: Pick<Presupuesto, "estado" | "fecha" | "validez_dias">, hoy: string) {
  if (p.estado === "enviado" && venceEl(p) < hoy) return "vencido" as const;
  return p.estado;
}
