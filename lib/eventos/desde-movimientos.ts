import type { Gasto, Ingreso, Planilla } from "./planilla";

/** Sector de la planilla según la categoría del movimiento de Financiero. */
const SECTOR_DE_CATEGORIA: Record<string, string> = {
  "Artística": "Artística",
  "Técnica": "Técnica",
  "Logística": "Infraestructura",
  "Producción": "Infraestructura",
  "Mobiliario": "Infraestructura",
  "Marketing": "Contenido y activaciones",
  "Activaciones": "Contenido y activaciones",
  "Staff": "Recursos humanos",
  "Sueldos": "Recursos humanos",
  "Seguridad": "Recursos humanos",
  "Mercadería": "Mercadería",
  "Proveedores": "Mercadería",
  "Impuestos": "Seguros y aranceles",
  "Seguros": "Seguros y aranceles",
};

/**
 * Para los gastos con una categoría genérica ("Eventos", "Otros gastos"…), el
 * sector sale de la descripción. Se prueban en orden: la primera que coincide.
 */
const SECTOR_DE_DESCRIPCION: [RegExp, string][] = [
  [/CATERING|GASTRO|JAMONERIA|ALIMENTOS/, "Gastronomía"],
  [/INSUMOS|HIELO|AGUA|PRECINTO|COPON|VASO|LIBRERIA|BIDON|COMBUSTIBLE|MACETA|ARAMAYO|BOLOGNESA|REMERA/, "Mercadería"],
  [/TOTEM|IMPRESION|SENALETICA|VIA PUBLICA|PRENSA|VINILO|GABRIEL|INFLUENCER|CONTENIDO|FOTO|VIDEO/, "Contenido y activaciones"],
  [/BANO|FLETE|ESTRUCTURA|MURO|JUEGO|GENERADOR|CARPA|VALLA/, "Infraestructura"],
  [/\bC?DJ\b|ARTIST|BANDA|SHOW/, "Artística"],
  [/AMBULANCIA|TICKETERA|SADAIC|CAPIF|SEGURO/, "Seguros y aranceles"],
  [/PERSONAL|PEROSNAL|COORDINACION|PROMOTOR|RPP|RRPP|GUARDA ?ROPA|MINNIONS|ARMADO|VIATICO|COMIDA|DESAYUNO|ALOJAMIENTO|LIMPIEZA|SEGURIDAD/, "Recursos humanos"],
];

function sectorDe(m: MovimientoParaPlanilla) {
  const porCategoria = SECTOR_DE_CATEGORIA[m.categoria.nombre];
  if (porCategoria) return porCategoria;
  const texto = `${m.descripcion} ${m.contraparte ?? ""}`.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return SECTOR_DE_DESCRIPCION.find(([patron]) => patron.test(texto))?.[1] ?? "";
}

/** Lo mínimo de un movimiento que hace falta para armar la planilla. */
export type MovimientoParaPlanilla = {
  tipo: "ingreso" | "egreso";
  monto: number;
  iva: number | null;
  descripcion: string;
  contraparte: string | null;
  estado: "real" | "pendiente" | "proyectado";
  facturado: boolean;
  categoria: { nombre: string };
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Tipo de factura según la proporción de IVA sobre el neto (21 %, 10,5 % o 27 %). */
function tipoFactura(neto: number, iva: number) {
  if (!iva || !neto) return "";
  const proporcion = iva / neto;
  if (Math.abs(proporcion - 0.21) < 0.01) return "A21";
  if (Math.abs(proporcion - 0.105) < 0.01) return "A105";
  if (Math.abs(proporcion - 0.27) < 0.01) return "A27";
  return "A21";
}

const detalle = (m: MovimientoParaPlanilla) =>
  (m.contraparte && !m.descripcion.toLowerCase().includes(m.contraparte.toLowerCase()) ? `${m.descripcion} (${m.contraparte})` : m.descripcion).slice(0, 200);

/**
 * Arma la planilla del evento con sus movimientos de Financiero: los ingresos
 * como ingresos y los egresos en el sector de su categoría. Lo ya pagado
 * (estado real) queda como seña; lo pendiente, como diferencia a pagar.
 */
export function planillaDesdeMovimientos(movimientos: MovimientoParaPlanilla[], base: Planilla): Planilla {
  const ingresos: Ingreso[] = movimientos
    .filter((m) => m.tipo === "ingreso")
    .map((m) => {
      const iva = r2(m.iva ?? 0);
      return { detalle: detalle(m), neto: r2(m.monto - iva), iva, bruto: r2(m.monto), factura: m.facturado, pagado: m.estado === "real" };
    });
  const gastos: Gasto[] = movimientos
    .filter((m) => m.tipo === "egreso")
    .map((m) => {
      const iva = r2(m.iva ?? 0);
      const neto = r2(m.monto - iva);
      return {
        sector: sectorDe(m),
        detalle: detalle(m),
        neto,
        tipo_factura: tipoFactura(neto, iva),
        iva,
        urgente: false,
        sena: m.estado === "real" ? r2(m.monto) : 0,
        datos_bancarios: "",
      };
    });
  return { ...base, ingresos, gastos };
}
