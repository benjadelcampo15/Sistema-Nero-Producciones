import { z } from "zod";
import type { Planilla } from "@/lib/eventos/planilla";

/**
 * Tratamiento de IVA de una solicitud (precio de VENTA a Quilmes). El % es el
 * IVA débito sobre el neto; "factura" indica si se factura (paga IIBB).
 */
export const TIPOS_IVA_VENTA = [
  { id: "A21", nombre: "Factura A 21%", iva: 21, factura: true },
  { id: "A105", nombre: "Factura A 10,5%", iva: 10.5, factura: true },
  { id: "A27", nombre: "Factura A 27%", iva: 27, factura: true },
  { id: "exento", nombre: "Factura sin IVA (exento)", iva: 0, factura: true },
  { id: "sin", nombre: "Sin factura", iva: 0, factura: false },
] as const;
export type TipoIvaVenta = (typeof TIPOS_IVA_VENTA)[number]["id"];
export const tipoIva = (id: string) => TIPOS_IVA_VENTA.find((t) => t.id === id) ?? TIPOS_IVA_VENTA[0];

const r2 = (n: number) => Math.round(n * 100) / 100;
const suma = (v: number[]) => r2(v.reduce((s, x) => s + x, 0));

export const esquemaSolicitud = z.object({
  id: z.uuid(),
  detalle: z.string().trim().max(300),
  neto: z.number().min(-1e13).max(1e13),
  tipo_iva: z.enum(TIPOS_IVA_VENTA.map((t) => t.id) as [TipoIvaVenta, ...TipoIvaVenta[]]),
  iva: z.number().min(-1e13).max(1e13),
});
export const esquemaSolicitudes = z.array(esquemaSolicitud).max(300);
export type Solicitud = z.infer<typeof esquemaSolicitud>;

/** IVA débito que corresponde al neto según el tratamiento elegido. */
export const ivaSugerido = (neto: number, tipo: string) => r2((neto * tipoIva(tipo).iva) / 100);
export const totalSolicitud = (s: Pick<Solicitud, "neto" | "iva">) => r2(s.neto + s.iva);

/** Totales del presupuesto comercial (lo que se le presupuesta a Quilmes). */
export function totalesSolicitudes(lista: Pick<Solicitud, "neto" | "iva" | "tipo_iva">[]) {
  const facturadas = lista.filter((s) => tipoIva(s.tipo_iva).factura);
  const sinFactura = lista.filter((s) => !tipoIva(s.tipo_iva).factura);
  return {
    neto: suma(lista.map((s) => s.neto)),
    iva: suma(lista.map((s) => s.iva)),
    total: suma(lista.map(totalSolicitud)),
    facturado: { neto: suma(facturadas.map((s) => s.neto)), iva: suma(facturadas.map((s) => s.iva)) },
    sinFactura: { neto: suma(sinFactura.map((s) => s.neto)), iva: suma(sinFactura.map((s) => s.iva)) },
  };
}

/** Renglones de Ingresos que salen solos de las Solicitudes (uno facturado y otro sin factura). */
export const INGRESO_QUILMES_FACTURADO = "quilmes-presupuesto";
export const INGRESO_QUILMES_SIN_FACTURA = "quilmes-presupuesto-sf";
export const esIngresoQuilmes = (id?: string) => id === INGRESO_QUILMES_FACTURADO || id === INGRESO_QUILMES_SIN_FACTURA;

/**
 * La planilla de un evento Quilmes con su ingreso previsto tomado de las
 * Solicitudes: reemplaza los renglones automáticos (conserva si ya se
 * cobraron) y deja los demás ingresos como están. Así el presupuesto entra una
 * sola vez a Ingresos, a IVA, a IIBB y a la rentabilidad, con los mismos cálculos de Eventos.
 */
export function conIngresosQuilmes(p: Planilla, solicitudes: Pick<Solicitud, "neto" | "iva" | "tipo_iva">[]): Planilla {
  const t = totalesSolicitudes(solicitudes);
  const previo = (id: string) => p.ingresos.find((i) => i.id === id);
  const automaticos: Planilla["ingresos"] = [];
  const agregar = (id: string, detalle: string, neto: number, iva: number, factura: boolean) => {
    const antes = previo(id);
    // Se deja aunque quede en cero si ya estaba cobrado (no se pierde esa marca).
    if (!neto && !iva && !antes?.pagado) return;
    automaticos.push({ id, detalle, neto, iva, bruto: r2(neto + iva), factura, pagado: antes?.pagado ?? false });
  };
  agregar(INGRESO_QUILMES_FACTURADO, "Presupuesto Quilmes (Solicitudes)", t.facturado.neto, t.facturado.iva, true);
  agregar(INGRESO_QUILMES_SIN_FACTURA, "Presupuesto Quilmes sin factura (Solicitudes)", t.sinFactura.neto, t.sinFactura.iva, false);
  return { ...p, ingresos: [...automaticos, ...p.ingresos.filter((i) => !esIngresoQuilmes(i.id))] };
}
