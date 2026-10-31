import { sumar } from "@/lib/formato";

/** Billetes que se cuentan al cerrar una caja, de mayor a menor. */
export const BILLETES = [20000, 10000, 2000, 1000, 500, 200, 100, 50, 20, 10] as const;

/** Cantidad de cada billete ("20000" → 3). */
export type Billetes = Record<string, number>;

export type Caja = {
  id: string;
  nombre: string;
  responsable: string | null;
  monto_inicial: number;
  /** Lo que Fudo dice que se cobró en efectivo. */
  monto_fudo: number | null;
  efectivo_final: number | null;
  billetes: Billetes | null;
  /** Lo que Fudo dice que se cobró con tarjeta. */
  fudo_posnet: number | null;
  /** Lo que da el cierre (lote) del posnet. */
  posnet_cierre: number | null;
  notas: string | null;
  cerrada_en: string | null;
  orden: number;
};

export const totalBilletes = (b: Billetes) => sumar(BILLETES.map((d) => d * (b[String(d)] ?? 0)));

export type Cruce = { esperado: number; contado: number; diferencia: number; resultado: "ok" | "falta" | "sobra" };

const cruce = (esperado: number, contado: number): Cruce => {
  const diferencia = sumar([contado, -esperado]);
  return { esperado, contado, diferencia, resultado: Math.abs(diferencia) < 0.01 ? "ok" : diferencia < 0 ? "falta" : "sobra" };
};

/** Efectivo: lo contado contra inicial + lo cobrado en efectivo según Fudo. null si falta algún dato. */
export function cruceEfectivo(c: Pick<Caja, "monto_inicial" | "monto_fudo" | "efectivo_final">): Cruce | null {
  if (c.monto_fudo === null || c.efectivo_final === null) return null;
  return cruce(sumar([c.monto_inicial, c.monto_fudo]), c.efectivo_final);
}

/** Posnet: el cierre del posnet contra lo cobrado con tarjeta según Fudo. null si falta algún dato. */
export function crucePosnet(c: Pick<Caja, "fudo_posnet" | "posnet_cierre">): Cruce | null {
  if (c.fudo_posnet === null || c.posnet_cierre === null) return null;
  return cruce(c.fudo_posnet, c.posnet_cierre);
}

/** La caja entera: suma los cruces que se pudieron hacer (efectivo y posnet). */
export function cruceCaja(c: Pick<Caja, "monto_inicial" | "monto_fudo" | "efectivo_final" | "fudo_posnet" | "posnet_cierre">): Cruce | null {
  const partes = [cruceEfectivo(c), crucePosnet(c)].filter((x): x is Cruce => x !== null);
  if (!partes.length) return null;
  return cruce(sumar(partes.map((p) => p.esperado)), sumar(partes.map((p) => p.contado)));
}

/** Totales de todas las cajas del evento (la diferencia suma solo los cruces hechos). */
export function totalesCajas(cajas: Caja[]) {
  const diferencias = cajas.map(cruceCaja).filter((c): c is Cruce => c !== null);
  return {
    inicial: sumar(cajas.map((c) => c.monto_inicial)),
    fudo: sumar(cajas.map((c) => c.monto_fudo ?? 0)),
    contado: sumar(cajas.map((c) => c.efectivo_final ?? 0)),
    fudoPosnet: sumar(cajas.map((c) => c.fudo_posnet ?? 0)),
    posnet: sumar(cajas.map((c) => c.posnet_cierre ?? 0)),
    diferencia: sumar(diferencias.map((c) => c.diferencia)),
    cerradas: cajas.filter((c) => c.cerrada_en).length,
  };
}

export const TEXTO_RESULTADO = { ok: "Dio bien", falta: "Faltó plata", sobra: "Sobró plata" } as const;
