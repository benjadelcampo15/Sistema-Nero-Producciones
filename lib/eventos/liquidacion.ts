/**
 * Entradas y liquidación Isidris (como la pestaña PORCENTAJE ISIDRIS de la
 * planilla). Todo se calcula en centavos enteros: la parte de Isidris se
 * redondea y la de Nero es el resto, así Nero + Isidris = vendido, siempre.
 */

export const SECCIONES = ["entradas", "comida", "parking"] as const;
export type Seccion = (typeof SECCIONES)[number];

export type Categoria = {
  id: string;
  seccion: Seccion;
  nombre: string;
  valor: number;
  stock: number | null;
  /** Paquetes vendidos (lo que se carga). */
  cantidad: number;
  /** Entradas por paquete (VIP x2 → 2). */
  multiplicador: number;
  corona: number;
  degus: number;
  gastro: number;
  activa: boolean;
  orden: number;
};

export type Liquidacion = { pctNero: number; comida: boolean; parking: boolean; categorias: Categoria[] };

const centavos = (n: number) => Math.round(n * 100);
const pesos = (c: number) => c / 100;

export type CalculoEntrada = {
  /** Entradas vendidas = paquetes × multiplicador. */
  vendidas: number;
  vendido: number;
  proyeccion: number | null;
  base: number;
  nero: number;
  isidris: number;
  neroFinal: number;
  isidrisFinal: number;
  liquidarNero: number;
  liquidarIsidris: number;
  /** Corona + degus + gastro superan el valor de la entrada. */
  costosExcedidos: boolean;
};

export function calcularEntrada(c: Categoria, pctNero: number): CalculoEntrada {
  const valor = centavos(c.valor);
  const corona = centavos(c.corona);
  const degus = centavos(c.degus);
  const gastro = centavos(c.gastro);
  const base = valor - corona - degus - gastro;
  const isidris = Math.round((base * (100 - pctNero)) / 100);
  const nero = base - isidris;
  const neroFinal = nero + corona + degus;
  const isidrisFinal = isidris + gastro;
  const vendidas = c.cantidad * c.multiplicador;
  return {
    vendidas,
    vendido: pesos(valor * vendidas),
    proyeccion: c.stock === null ? null : pesos(valor * c.stock),
    base: pesos(base),
    nero: pesos(nero),
    isidris: pesos(isidris),
    neroFinal: pesos(neroFinal),
    isidrisFinal: pesos(isidrisFinal),
    liquidarNero: pesos(neroFinal * vendidas),
    liquidarIsidris: pesos(isidrisFinal * vendidas),
    costosExcedidos: base < 0,
  };
}

export type TotalesSeccion = { stock: number | null; vendidas: number; vendido: number; proyeccion: number };

function totalesDe(filas: Categoria[]): TotalesSeccion {
  let stock: number | null = null;
  let vendidas = 0;
  let vendido = 0;
  let proyeccion = 0;
  for (const c of filas) {
    const n = c.cantidad * c.multiplicador;
    vendidas += n;
    vendido += centavos(c.valor) * n;
    if (c.stock !== null) {
      stock = (stock ?? 0) + c.stock;
      proyeccion += centavos(c.valor) * c.stock;
    }
  }
  return { stock, vendidas, vendido: pesos(vendido), proyeccion: pesos(proyeccion) };
}

export type ResumenLiquidacion = {
  entradas: TotalesSeccion & { liquidarNero: number; liquidarIsidris: number };
  comida: TotalesSeccion;
  parking: TotalesSeccion;
  totalIsidris: number;
  /** Total Isidris / 1,21: neto de un IVA del 21% (cálculo, no un cobro). */
  netoIsidris: number;
  /** Vendido − (Nero + Isidris) en entradas: tiene que dar 0. */
  diferencia: number;
};

export function resumir(l: Liquidacion): ResumenLiquidacion {
  const de = (s: Seccion) => l.categorias.filter((c) => c.seccion === s);
  const entradas = de("entradas");
  let nero = 0;
  let isidris = 0;
  for (const c of entradas) {
    const r = calcularEntrada(c, l.pctNero);
    nero += centavos(r.liquidarNero);
    isidris += centavos(r.liquidarIsidris);
  }
  const totEntradas = totalesDe(entradas);
  const comida = totalesDe(l.comida ? de("comida") : []);
  const parking = totalesDe(l.parking ? de("parking") : []);
  const totalIsidris = isidris + centavos(comida.vendido) + centavos(parking.vendido);
  return {
    entradas: { ...totEntradas, liquidarNero: pesos(nero), liquidarIsidris: pesos(isidris) },
    comida,
    parking,
    totalIsidris: pesos(totalIsidris),
    netoIsidris: Math.round(totalIsidris / 1.21) / 100,
    diferencia: pesos(centavos(totEntradas.vendido) - nero - isidris),
  };
}

export const NOMBRE_SECCION: Record<Seccion, string> = { entradas: "Entradas", comida: "Preventa comida", parking: "Preventa parking" };
