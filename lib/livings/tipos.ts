import { z } from "zod";

/** Posiciones en proporción de la imagen del plano: 0 a 1 en cada eje. */
const coordenada = z.number().min(0).max(1);

/** Lugares del evento: el jardín (pasto) y el salón (piso gris). */
export const ESPACIOS = [
  { id: "jardin", nombre: "Jardín" },
  { id: "salon", nombre: "Salón" },
] as const;
export type Espacio = (typeof ESPACIOS)[number]["id"];
// Opcional: lo guardado antes del salón es todo del jardín.
const espacio = z.enum(["jardin", "salon"]).optional();
/** El espacio de una zona, elemento o living (sin espacio = jardín). */
export const espacioDe = (x: { espacio?: Espacio }): Espacio => x.espacio ?? "jardin";

/** De qué lado del rectángulo de livings está el escenario (los de mayor consumición van de ese lado). */
export const LADOS = [
  { id: "ninguno", nombre: "Sin escenario" },
  { id: "arriba", nombre: "Escenario arriba" },
  { id: "abajo", nombre: "Escenario abajo" },
  { id: "izquierda", nombre: "Escenario a la izquierda" },
  { id: "derecha", nombre: "Escenario a la derecha" },
] as const;
export type Lado = (typeof LADOS)[number]["id"];
const lado = z.enum(["ninguno", "arriba", "abajo", "izquierda", "derecha"]).optional();

export const esquemaZona = z.object({ id: z.string().max(40), espacio, x: coordenada, y: coordenada, w: coordenada, h: coordenada });
export const TIPOS_ELEMENTO = [
  { id: "escenario", nombre: "Escenario", color: "#3f3f46", texto: "#ffffff" },
  { id: "barra", nombre: "Barra", color: "#7c4a2d", texto: "#ffffff" },
  { id: "camino", nombre: "Camino", color: "#d6c4a0", texto: "#57534e" },
  { id: "pista", nombre: "Pista", color: "#a8a29e", texto: "#1c1917" },
  { id: "banos", nombre: "Baños", color: "#93c5fd", texto: "#1e3a8a" },
  { id: "entrada", nombre: "Entrada", color: "#fde68a", texto: "#78350f" },
  { id: "cabina", nombre: "Cabina DJ", color: "#1c1917", texto: "#ffffff" },
  { id: "arboles", nombre: "Árboles", color: "#166534", texto: "#dcfce7" },
  { id: "otro", nombre: "Otro", color: "#e7e5e4", texto: "#44403c" },
] as const;
export type TipoElemento = (typeof TIPOS_ELEMENTO)[number]["id"];

export const esquemaElemento = z.object({
  id: z.string().max(40),
  tipo: z.enum(TIPOS_ELEMENTO.map((t) => t.id) as [TipoElemento, ...TipoElemento[]]),
  espacio,
  x: coordenada,
  y: coordenada,
  w: coordenada,
  h: coordenada,
});
export const esquemaMozo = z.object({ id: z.string().max(40), nombre: z.string().trim().min(1).max(80) });
export const esquemaLiving = z.object({
  id: z.string().max(40),
  nombre: z.string().trim().min(1).max(120),
  personas: z.number().int().min(0).max(1000),
  consumicion: z.number().min(0).max(1e12),
  notas: z.string().max(500).nullable(),
  espacio,
  x: coordenada.nullable(),
  y: coordenada.nullable(),
  // Medidas del rectángulo (las calcula la distribución).
  w: coordenada.nullable().optional(),
  h: coordenada.nullable().optional(),
  mozo_id: z.string().max(40).nullable(),
});

/** Lo que se guarda del plano (la imagen va aparte). */
export const esquemaDocumento = z.object({
  tamano_living: z.number().min(0.005).max(0.3),
  proporcion: z.number().min(0.2).max(3),
  proporcion_salon: z.number().min(0.2).max(3).optional(),
  escenarios: z.object({ jardin: lado, salon: lado }).optional(),
  elementos: z.array(esquemaElemento).max(200),
  zonas: z.array(esquemaZona).max(100),
  referencia: z.object({ x: coordenada, y: coordenada }).nullable(),
  mozos: z.array(esquemaMozo).max(200),
  livings: z.array(esquemaLiving).max(1000),
});

export type Zona = z.infer<typeof esquemaZona>;
export type Elemento = z.infer<typeof esquemaElemento>;
export type Mozo = z.infer<typeof esquemaMozo>;
export type Living = z.infer<typeof esquemaLiving>;
export type DocumentoPlano = z.infer<typeof esquemaDocumento>;

/** Formas del jardín o del salón (alto / ancho). */
export const FORMAS = [
  { nombre: "Franja ancha", proporcion: 0.333 },
  { nombre: "Muy apaisado", proporcion: 0.5 },
  { nombre: "Apaisado", proporcion: 0.667 },
  { nombre: "Cuadrado", proporcion: 1 },
  { nombre: "Vertical", proporcion: 1.5 },
  { nombre: "Franja alta", proporcion: 2.5 },
];

export const PLANO_VACIO: DocumentoPlano = {
  tamano_living: 0.07,
  proporcion: 0.667,
  proporcion_salon: 0.667,
  escenarios: {},
  elementos: [],
  zonas: [],
  referencia: null,
  mozos: [],
  livings: [],
};

export const nuevoId = () => Math.random().toString(36).slice(2, 10);

/** Colores para distinguir los mozos en el plano. */
export const COLORES_MOZOS = [
  "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2",
  "#c026d3", "#65a30d", "#d97706", "#4f46e5", "#e11d48", "#0d9488",
];

export function colorMozo(mozos: Mozo[], id: string | null) {
  const i = mozos.findIndex((m) => m.id === id);
  return i < 0 ? "#78716c" : COLORES_MOZOS[i % COLORES_MOZOS.length];
}

/** "$1,2M", "$450k": la consumición abreviada para que entre en el living. */
export function consumicionCorta(monto: number) {
  if (monto >= 1e6) return `$${(monto / 1e6).toFixed(monto >= 1e7 ? 0 : 1).replace(".", ",").replace(/,0$/, "")}M`;
  if (monto >= 1e3) return `$${Math.round(monto / 1e3)}k`;
  return `$${Math.round(monto)}`;
}

/** Tamaño de un living sin medidas (agregado a mano): el de los demás, o uno por defecto. */
export function medidasPorDefecto(livings: Living[], relacion: number) {
  const con = livings.filter((l) => l.w && l.h);
  if (!con.length) return { w: 0.1, h: 0.12 / relacion };
  return { w: con.reduce((s, l) => s + l.w!, 0) / con.length, h: con.reduce((s, l) => s + l.h!, 0) / con.length };
}

const peso = (l: Living) => Math.max(1, l.personas);

/**
 * Acomoda los livings como rectángulos apilados en columnas dentro de cada
 * zona: todos los de una columna tienen el mismo ancho y el alto según la
 * cantidad de personas. Prueba con 1, 2, 3… columnas y se queda con la que
 * deja los livings más grandes (con formas razonables). Los de mayor
 * consumición van a la zona y a las columnas más cercanas al escenario, y se
 * apilan desde el lado del escenario.
 * `relacion` = alto / ancho del jardín (x e y van de 0 a 1 en cada eje).
 */
export function distribuir(livings: Living[], zonas: Zona[], relacion: number, referencia: { x: number; y: number } | null) {
  if (!zonas.length || !livings.length) return { livings: livings.map((l) => ({ ...l, x: null, y: null })), sinLugar: livings.length };
  const orden = [...livings].sort((a, b) => b.consumicion - a.consumicion || b.personas - a.personas);
  const centro = (z: Zona) => ({ x: z.x + z.w / 2, y: z.y + z.h / 2 });
  const cerca = (p: { x: number; y: number }) => (referencia ? Math.hypot(p.x - referencia.x, (p.y - referencia.y) * relacion) : 0);
  const zonasOrdenadas = referencia ? [...zonas].sort((a, b) => cerca(centro(a)) - cerca(centro(b))) : zonas;

  // Reparto entre zonas según su superficie (en personas).
  const superficie = zonasOrdenadas.reduce((s, z) => s + z.w * z.h, 0);
  const totalPersonas = orden.reduce((s, l) => s + peso(l), 0);
  const grupos: Living[][] = zonasOrdenadas.map(() => []);
  let iz = 0;
  let acumulado = 0;
  let cupo = (zonasOrdenadas[0].w * zonasOrdenadas[0].h * totalPersonas) / superficie;
  for (const l of orden) {
    while (iz < zonasOrdenadas.length - 1 && acumulado + peso(l) / 2 > cupo) {
      iz++;
      cupo += (zonasOrdenadas[iz].w * zonasOrdenadas[iz].h * totalPersonas) / superficie;
    }
    grupos[iz].push(l);
    acumulado += peso(l);
  }

  const posicion = new Map<string, { x: number; y: number; w: number; h: number }>();
  zonasOrdenadas.forEach((zona, i) => {
    for (const [id, p] of apilar(grupos[i], zona, relacion, referencia)) posicion.set(id, p);
  });
  return {
    livings: livings.map((l) => {
      const p = posicion.get(l.id);
      return p ? { ...l, ...p } : { ...l, x: null, y: null };
    }),
    sinLugar: livings.length - posicion.size,
  };
}

/** Apila los livings (ya ordenados por prioridad) en columnas dentro de una zona. */
function apilar(livings: Living[], zona: Zona, relacion: number, referencia: { x: number; y: number } | null) {
  const resultado = new Map<string, { x: number; y: number; w: number; h: number }>();
  if (!livings.length) return resultado;
  // Se trabaja en unidades del ancho del jardín en los dos ejes.
  const ancho = zona.w;
  const alto = zona.h * relacion;
  const espacio = Math.max(0.006, Math.min(ancho, alto) * 0.035);
  const promedio = livings.reduce((s, l) => s + peso(l), 0) / livings.length;

  let mejor: { columnas: Living[][]; anchoColumna: number; unidad: number; puntaje: number } | null = null;
  for (let k = 1; k <= Math.min(livings.length, 10); k++) {
    const anchoColumna = (ancho - espacio * (k + 1)) / k;
    if (anchoColumna <= 0) break;
    // Cada living a la columna con menos personas: columnas parejas.
    const columnas: Living[][] = Array.from({ length: k }, () => []);
    const suma = new Array<number>(k).fill(0);
    for (const l of livings) {
      const c = suma.indexOf(Math.min(...suma));
      columnas[c].push(l);
      suma[c] += peso(l);
    }
    // Alto por persona: el máximo con el que entra la columna más cargada.
    const unidad = Math.min(...columnas.map((col, c) => (col.length ? (alto - espacio * (col.length + 1)) / suma[c] : Infinity)));
    if (unidad <= 0) continue;
    // Más grande es mejor, pero sin livings demasiado finitos ni demasiado chatos.
    const forma = (unidad * promedio) / anchoColumna;
    const puntaje = unidad * anchoColumna * (forma > 3.5 ? 3.5 / forma : forma < 0.6 ? forma / 0.6 : 1);
    if (!mejor || puntaje > mejor.puntaje) mejor = { columnas, anchoColumna, unidad, puntaje };
  }
  if (!mejor) return resultado;

  // Columnas más cercanas al escenario primero; se apila desde el lado del escenario.
  const k = mejor.columnas.length;
  const xColumna = (i: number) => zona.x + espacio + i * (mejor!.anchoColumna + espacio);
  const posiciones = Array.from({ length: k }, (_, i) => i);
  if (referencia) posiciones.sort((a, b) => Math.abs(xColumna(a) + mejor!.anchoColumna / 2 - referencia.x) - Math.abs(xColumna(b) + mejor!.anchoColumna / 2 - referencia.x));
  const desdeAbajo = referencia !== null && referencia.y > zona.y + zona.h / 2;

  mejor.columnas.forEach((columna, c) => {
    const altos = columna.map((l) => peso(l) * mejor!.unidad);
    // El espacio que sobra se reparte parejo entre los livings.
    const hueco = (alto - altos.reduce((s, h) => s + h, 0)) / (columna.length + 1);
    let y = hueco;
    columna.forEach((l, i) => {
      const yArriba = desdeAbajo ? alto - y - altos[i] : y;
      resultado.set(l.id, {
        x: xColumna(posiciones[c]) + mejor!.anchoColumna / 2,
        y: zona.y + (yArriba + altos[i] / 2) / relacion,
        w: mejor!.anchoColumna,
        h: altos[i] / relacion,
      });
      y += altos[i] + hueco;
    });
  });
  return resultado;
}

/**
 * Reparte los livings ubicados entre los mozos: los ordena por ángulo alrededor
 * del punto de referencia (o del centro de los livings), así a cada mozo le toca
 * un sector continuo del jardín, y corta los sectores equilibrando personas.
 */
export function asignarMozos(livings: Living[], mozos: Mozo[], relacion: number, referencia: { x: number; y: number } | null) {
  const ubicados = livings.filter((l) => l.x !== null && l.y !== null);
  if (!mozos.length || !ubicados.length) return livings.map((l) => ({ ...l, mozo_id: mozos.length ? l.mozo_id : null }));

  const centro = referencia ?? {
    x: ubicados.reduce((s, l) => s + l.x!, 0) / ubicados.length,
    y: ubicados.reduce((s, l) => s + l.y!, 0) / ubicados.length,
  };
  const conAngulo = ubicados
    .map((l) => ({ l, a: Math.atan2((l.y! - centro.y) * relacion, l.x! - centro.x) }))
    .sort((p, q) => p.a - q.a);
  // Arranca después del hueco más grande entre ángulos, para no partir un grupo de livings.
  let inicio = 0;
  let hueco = -1;
  conAngulo.forEach((p, i) => {
    const siguiente = conAngulo[(i + 1) % conAngulo.length].a + (i + 1 === conAngulo.length ? 2 * Math.PI : 0);
    if (siguiente - p.a > hueco) {
      hueco = siguiente - p.a;
      inicio = (i + 1) % conAngulo.length;
    }
  });
  const ordenados = [...conAngulo.slice(inicio), ...conAngulo.slice(0, inicio)].map((p) => p.l);

  // Peso: personas (mínimo 1 para que un living vacío igual cuente).
  const peso = (l: Living) => Math.max(1, l.personas);
  const total = ordenados.reduce((s, l) => s + peso(l), 0);
  const asignacion = new Map<string, string>();
  let acumulado = 0;
  for (const l of ordenados) {
    const medio = acumulado + peso(l) / 2;
    const i = Math.min(mozos.length - 1, Math.floor((medio / total) * mozos.length));
    asignacion.set(l.id, mozos[i].id);
    acumulado += peso(l);
  }
  return livings.map((l) => ({ ...l, mozo_id: asignacion.get(l.id) ?? null }));
}

/** Resumen por mozo: livings, personas y consumición. */
export function resumenPorMozo(livings: Living[], mozos: Mozo[]) {
  return [...mozos, { id: "", nombre: "Sin mozo" }]
    .map((m) => {
      const suyos = livings.filter((l) => (l.mozo_id ?? "") === m.id && (m.id !== "" || l.x !== null));
      return {
        mozo: m,
        livings: suyos,
        personas: suyos.reduce((s, l) => s + l.personas, 0),
        consumicion: suyos.reduce((s, l) => s + l.consumicion, 0),
      };
    })
    .filter((r) => r.mozo.id !== "" || r.livings.length > 0);
}

/** Datos de cada espacio para acomodar: sus zonas, su forma y su escenario. */
export type DatosEspacio = { id: Espacio; zonas: Zona[]; relacion: number; referencia: { x: number; y: number } | null };

/** Punto (fuera del rectángulo) del lado del escenario: los livings más cerca de él van adelante. */
const PUNTO_LADO: Record<Lado, { x: number; y: number } | null> = {
  ninguno: null,
  arriba: { x: 0.5, y: -0.3 },
  abajo: { x: 0.5, y: 1.3 },
  izquierda: { x: -0.3, y: 0.5 },
  derecha: { x: 1.3, y: 0.5 },
};

export const ladoEscenario = (doc: DocumentoPlano, espacio: Espacio): Lado => doc.escenarios?.[espacio] ?? "ninguno";

/** Cada espacio es entero el rectángulo de los livings con reserva. */
export function datosEspacios(doc: DocumentoPlano): DatosEspacio[] {
  return ESPACIOS.map(({ id }) => ({
    id,
    zonas: [{ id: `todo-${id}`, espacio: id, x: 0.015, y: 0.015, w: 0.97, h: 0.97 }],
    relacion: id === "salon" ? (doc.proporcion_salon ?? 0.667) : doc.proporcion,
    referencia: PUNTO_LADO[ladoEscenario(doc, id)],
  }));
}

/**
 * Reparte los livings entre el jardín y el salón según el lugar disponible en
 * cada uno (los de mayor consumición, al jardín primero) y los acomoda en cada
 * espacio. Los que traen espacio fijo (columna Lugar del Excel) van a ese.
 */
export function distribuirEspacios(livings: Living[], espacios: DatosEspacio[], respetarEspacio: boolean) {
  const superficie = (e: DatosEspacio) => e.zonas.reduce((s, z) => s + z.w * z.h * e.relacion, 0);
  const total = espacios.reduce((s, e) => s + superficie(e), 0);
  const grupos = new Map<Espacio, Living[]>(espacios.map((e) => [e.id, []]));

  const fijos = respetarEspacio ? livings.filter((l) => l.espacio) : [];
  for (const l of fijos) grupos.get(espacioDe(l))!.push(l);
  const libres = livings.filter((l) => !fijos.includes(l)).sort((a, b) => b.consumicion - a.consumicion || b.personas - a.personas);
  const personas = livings.reduce((s, l) => s + peso(l), 0);
  // Cupo de cada espacio en personas, descontando los que ya tienen lugar fijo.
  const cupos = espacios.map((e) => (superficie(e) / total) * personas - grupos.get(e.id)!.reduce((s, l) => s + peso(l), 0));
  let i = 0;
  for (const l of libres) {
    while (i < espacios.length - 1 && cupos[i] - peso(l) / 2 < 0) i++;
    grupos.get(espacios[i].id)!.push(l);
    cupos[i] -= peso(l);
  }

  const resultado = new Map<string, Living>();
  for (const e of espacios) {
    const r = distribuir(grupos.get(e.id)!, e.zonas, e.relacion, e.referencia);
    for (const l of r.livings) resultado.set(l.id, { ...l, espacio: e.id });
  }
  const acomodados = livings.map((l) => resultado.get(l.id) ?? l);
  return { livings: acomodados, sinLugar: acomodados.filter((l) => l.x === null).length };
}

/**
 * Reparte los mozos entre los espacios según las personas de cada uno (al menos
 * uno por espacio con livings, si alcanzan) y asigna por sectores dentro de cada
 * espacio, así ningún mozo queda con mesas en el jardín y en el salón.
 */
export function asignarMozosEspacios(livings: Living[], mozos: Mozo[], espacios: DatosEspacio[]) {
  const conLivings = espacios
    .map((e) => ({ e, suyos: livings.filter((l) => espacioDe(l) === e.id && l.x !== null) }))
    .filter((x) => x.suyos.length > 0);
  if (!mozos.length || !conLivings.length) return asignarMozos(livings, mozos, 1, null);

  const personas = conLivings.map((x) => x.suyos.reduce((s, l) => s + peso(l), 0));
  const total = personas.reduce((s, p) => s + p, 0);
  let cantidades: number[];
  if (mozos.length >= conLivings.length) {
    // Uno para cada espacio y el resto según las personas (mayor resto).
    const extra = mozos.length - conLivings.length;
    const ideal = personas.map((p) => (p / total) * extra);
    cantidades = ideal.map((x) => 1 + Math.floor(x));
    let faltan = mozos.length - cantidades.reduce((s, n) => s + n, 0);
    const porResto = ideal.map((x, i) => ({ i, resto: x - Math.floor(x) })).sort((a, b) => b.resto - a.resto);
    for (const { i } of porResto) if (faltan-- > 0) cantidades[i]++;
  } else {
    // Menos mozos que espacios: se turnan.
    cantidades = conLivings.map(() => 0);
  }

  const asignacion = new Map<string, string | null>();
  let desde = 0;
  conLivings.forEach(({ e, suyos }, i) => {
    const propios = cantidades[i] ? mozos.slice(desde, desde + cantidades[i]) : [mozos[i % mozos.length]];
    desde += cantidades[i];
    for (const l of asignarMozos(suyos, propios, e.relacion, e.referencia)) asignacion.set(l.id, l.mozo_id);
  });
  return livings.map((l) => (asignacion.has(l.id) ? { ...l, mozo_id: asignacion.get(l.id)! } : { ...l, mozo_id: l.x === null ? l.mozo_id : null }));
}
