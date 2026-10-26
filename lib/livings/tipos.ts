import { z } from "zod";

/** Posiciones en proporción de la imagen del plano: 0 a 1 en cada eje. */
const coordenada = z.number().min(0).max(1);

export const esquemaZona = z.object({ id: z.string().max(40), x: coordenada, y: coordenada, w: coordenada, h: coordenada });
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
  zonas: z.array(esquemaZona).max(100),
  referencia: z.object({ x: coordenada, y: coordenada }).nullable(),
  mozos: z.array(esquemaMozo).max(200),
  livings: z.array(esquemaLiving).max(1000),
});

export type Zona = z.infer<typeof esquemaZona>;
export type Mozo = z.infer<typeof esquemaMozo>;
export type Living = z.infer<typeof esquemaLiving>;
export type DocumentoPlano = z.infer<typeof esquemaDocumento>;

export type Plano = DocumentoPlano & {
  imagen_url: string | null;
  imagen_ancho: number | null;
  imagen_alto: number | null;
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

/**
 * Acomoda los livings en las zonas marcadas. Arma una grilla de lugares dentro
 * de cada zona (separados por el tamaño del living) y les da los lugares más
 * cercanos al punto de referencia a los de mayor consumición. Sin referencia,
 * se llenan las zonas en el orden en que se marcaron.
 * `relacion` = alto / ancho de la imagen (para que la separación sea pareja).
 */
export function distribuir(livings: Living[], zonas: Zona[], tamano: number, relacion: number, referencia: { x: number; y: number } | null) {
  const paso = tamano * 1.4;
  const pasoY = paso / relacion;
  const lugares: { x: number; y: number; orden: number }[] = [];
  zonas.forEach((z, iz) => {
    const columnas = Math.max(1, Math.floor(z.w / paso));
    const filas = Math.max(1, Math.floor(z.h / pasoY));
    // Centra la grilla en la zona.
    const x0 = z.x + (z.w - (columnas - 1) * paso) / 2;
    const y0 = z.y + (z.h - (filas - 1) * pasoY) / 2;
    for (let f = 0; f < filas; f++) {
      for (let c = 0; c < columnas; c++) {
        lugares.push({ x: x0 + c * paso, y: y0 + f * pasoY, orden: iz * 1e6 + f * 1e3 + c });
      }
    }
  });
  if (referencia) {
    const distancia = (p: { x: number; y: number }) => Math.hypot(p.x - referencia.x, (p.y - referencia.y) * relacion);
    lugares.sort((a, b) => distancia(a) - distancia(b));
  } else {
    lugares.sort((a, b) => a.orden - b.orden);
  }

  const orden = [...livings].sort((a, b) => b.consumicion - a.consumicion || b.personas - a.personas);
  const posicion = new Map(orden.map((l, i) => [l.id, lugares[i] ?? null]));
  return {
    livings: livings.map((l) => {
      const p = posicion.get(l.id);
      return { ...l, x: p ? p.x : null, y: p ? p.y : null };
    }),
    sinLugar: Math.max(0, livings.length - lugares.length),
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
