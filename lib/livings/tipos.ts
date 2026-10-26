import { z } from "zod";

/** Posiciones en proporción de la imagen del plano: 0 a 1 en cada eje. */
const coordenada = z.number().min(0).max(1);

export const esquemaZona = z.object({ id: z.string().max(40), x: coordenada, y: coordenada, w: coordenada, h: coordenada });
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
  x: coordenada.nullable(),
  y: coordenada.nullable(),
  mozo_id: z.string().max(40).nullable(),
});

/** Lo que se guarda del plano (la imagen va aparte). */
export const esquemaDocumento = z.object({
  tamano_living: z.number().min(0.005).max(0.3),
  proporcion: z.number().min(0.2).max(3),
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

/** Formas del jardín (alto / ancho). */
export const FORMAS = [
  { nombre: "Apaisado", proporcion: 0.667 },
  { nombre: "Muy apaisado", proporcion: 0.5 },
  { nombre: "Cuadrado", proporcion: 1 },
  { nombre: "Vertical", proporcion: 1.5 },
];

export const PLANO_VACIO: DocumentoPlano = {
  tamano_living: 0.07,
  proporcion: 0.667,
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

/** Personas promedio por living (para escalar el tamaño de cada uno). */
export function promedioPersonas(livings: Living[]) {
  const con = livings.filter((l) => l.personas > 0);
  return con.length ? con.reduce((s, l) => s + l.personas, 0) / con.length : 1;
}

/**
 * Diámetro del living (en proporción del ancho del jardín): `tamano` es el de
 * un living con la cantidad promedio de personas; el área crece con las personas.
 */
export function diametroLiving(personas: number, tamano: number, promedio: number) {
  return tamano * Math.min(1.7, Math.max(0.6, Math.sqrt(Math.max(1, personas) / promedio)));
}

/** "$1,2M", "$450k": la consumición abreviada para que entre en el living. */
export function consumicionCorta(monto: number) {
  if (monto >= 1e6) return `$${(monto / 1e6).toFixed(monto >= 1e7 ? 0 : 1).replace(".", ",").replace(/,0$/, "")}M`;
  if (monto >= 1e3) return `$${Math.round(monto / 1e3)}k`;
  return `$${Math.round(monto)}`;
}

/**
 * Acomoda los livings en las zonas marcadas. Recorre lugares posibles dentro de
 * las zonas, del más cercano al punto de referencia (escenario) al más lejano,
 * y a cada living (de mayor a menor consumición) le da el primero donde entra
 * entero sin pisar otro living ni nada dibujado (camino, barra, escenario…).
 * Sin referencia, se llenan las zonas en el orden en que se marcaron.
 * `relacion` = alto / ancho del jardín (las coordenadas van de 0 a 1 en cada eje).
 */
export function distribuir(
  livings: Living[],
  zonas: Zona[],
  tamano: number,
  relacion: number,
  referencia: { x: number; y: number } | null,
  obstaculos: { x: number; y: number; w: number; h: number }[] = [],
) {
  const paso = tamano * 0.25;
  const lugares: { x: number; y: number; zona: Zona; orden: number }[] = [];
  zonas.forEach((zona, iz) => {
    let f = 0;
    for (let y = zona.y; y <= zona.y + zona.h; y += paso / relacion, f++) {
      let c = 0;
      for (let x = zona.x; x <= zona.x + zona.w; x += paso, c++) lugares.push({ x, y, zona, orden: iz * 1e8 + f * 1e4 + c });
    }
  });
  if (referencia) {
    const distancia = (p: { x: number; y: number }) => Math.hypot(p.x - referencia.x, (p.y - referencia.y) * relacion);
    lugares.sort((a, b) => distancia(a) - distancia(b));
  } else {
    lugares.sort((a, b) => a.orden - b.orden);
  }

  const promedio = promedioPersonas(livings);
  const margen = tamano * 0.15;
  const ubicados: { x: number; y: number; r: number }[] = [];
  const posicion = new Map<string, { x: number; y: number }>();
  const orden = [...livings].sort((a, b) => b.consumicion - a.consumicion || b.personas - a.personas);

  for (const l of orden) {
    const r = diametroLiving(l.personas, tamano, promedio) / 2;
    const ry = r / relacion;
    const lugar = lugares.find(
      ({ x, y, zona }) =>
        // Entero dentro de su zona…
        x - r >= zona.x && x + r <= zona.x + zona.w && y - ry >= zona.y && y + ry <= zona.y + zona.h &&
        // …sin pisar lo dibujado…
        !obstaculos.some((o) => x + r > o.x && x - r < o.x + o.w && y + ry > o.y && y - ry < o.y + o.h) &&
        // …ni a otro living.
        ubicados.every((u) => Math.hypot(u.x - x, (u.y - y) * relacion) >= u.r + r + margen),
    );
    if (!lugar) continue;
    ubicados.push({ x: lugar.x, y: lugar.y, r });
    posicion.set(l.id, { x: lugar.x, y: lugar.y });
  }

  return {
    livings: livings.map((l) => {
      const p = posicion.get(l.id);
      return { ...l, x: p ? p.x : null, y: p ? p.y : null };
    }),
    sinLugar: livings.length - posicion.size,
  };
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
