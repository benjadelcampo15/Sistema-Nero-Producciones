/** Tareas: tableros tipo Trello. Tipos y utilidades compartidas (cliente y servidor). */

export type RolTablero = "admin" | "miembro" | "observador";
export const NOMBRE_ROL: Record<RolTablero, string> = { admin: "Administrador", miembro: "Miembro", observador: "Observador" };

export type Usuario = { id: string; nombre: string; email: string };

export type Espacio = { id: string; nombre: string; descripcion: string | null; rol: "admin" | "miembro" | null };

export type TableroResumen = {
  id: string;
  espacio_id: string;
  nombre: string;
  fondo: string;
  visibilidad: "privado" | "espacio";
  archivado: boolean;
  es_plantilla: boolean;
  favorito: boolean;
  visto_en: string | null;
};

export type Tablero = TableroResumen & { descripcion: string | null; rol: RolTablero; fondoUrl: string | null };

export type Lista = { id: string; nombre: string; posicion: number; archivada: boolean };

export type Tarjeta = {
  id: string;
  lista_id: string;
  titulo: string;
  descripcion: string | null;
  posicion: number;
  vence: string | null;
  inicio: string | null;
  recordatorio: number | null;
  portada: string | null;
  completada: boolean;
  archivada: boolean;
  version: number;
  es_plantilla: boolean;
  miembros: string[];
  etiquetas: string[];
  /** Para la cara de la tarjeta: avance de checklists, adjuntos, comentarios y si la sigo. */
  resumen: { items: number; hechos: number; adjuntos: number; comentarios: number; sigo: boolean };
  portadaUrl?: string | null;
};

export type Etiqueta = { id: string; nombre: string; color: string; posicion: number };

/** Colores de etiquetas (como Trello). */
export const COLORES_ETIQUETA: Record<string, { nombre: string; fondo: string; texto: string }> = {
  verde: { nombre: "Verde", fondo: "#4bce97", texto: "#164b35" },
  amarillo: { nombre: "Amarillo", fondo: "#f5cd47", texto: "#533f04" },
  naranja: { nombre: "Naranja", fondo: "#fea362", texto: "#702e00" },
  rojo: { nombre: "Rojo", fondo: "#f87168", texto: "#5d1f1a" },
  violeta: { nombre: "Violeta", fondo: "#9f8fef", texto: "#352c63" },
  azul: { nombre: "Azul", fondo: "#579dff", texto: "#09326c" },
  celeste: { nombre: "Celeste", fondo: "#6cc3e0", texto: "#164555" },
  lima: { nombre: "Lima", fondo: "#94c748", texto: "#37471f" },
  rosa: { nombre: "Rosa", fondo: "#e774bb", texto: "#50253f" },
  gris: { nombre: "Gris", fondo: "#8590a2", texto: "#091e42" },
};
export const colorEtiqueta = (c: string) => COLORES_ETIQUETA[c] ?? COLORES_ETIQUETA.gris;

/** Colores de portada (franja arriba de la tarjeta). */
export const COLORES_PORTADA = ["verde", "amarillo", "naranja", "rojo", "violeta", "azul", "celeste", "lima", "rosa", "gris"];

export const RECORDATORIOS: { valor: number | null; nombre: string }[] = [
  { valor: null, nombre: "Ninguno" },
  { valor: 0, nombre: "En el momento del vencimiento" },
  { valor: 5, nombre: "5 minutos antes" },
  { valor: 15, nombre: "15 minutos antes" },
  { valor: 60, nombre: "1 hora antes" },
  { valor: 120, nombre: "2 horas antes" },
  { valor: 1440, nombre: "1 día antes" },
  { valor: 2880, nombre: "2 días antes" },
];

export type ItemChecklist = { id: string; checklist_id: string; texto: string; hecho: boolean; posicion: number; responsable_id: string | null; vence: string | null };
export type Checklist = { id: string; nombre: string; posicion: number; items: ItemChecklist[] };
export type Adjunto = { id: string; nombre: string; ruta: string | null; url: string | null; mime: string | null; tamano: number | null; subido_por: string | null; creado_en: string; enlace: string | null };
export type Comentario = { id: string; autor_id: string; texto: string; respuesta_a: string | null; creado_en: string; editado_en: string | null };
export type Actividad = { id: number; usuario_id: string | null; tipo: string; detalle: Record<string, string | null>; creado_en: string };
export type DetalleTarjeta = { checklists: Checklist[]; adjuntos: Adjunto[]; comentarios: Comentario[]; actividad: Actividad[]; sigo: boolean };

export const esImagen = (mime: string | null) => !!mime && /^image\/(png|jpe?g|gif|webp)$/.test(mime);

export type MiembroTablero = { usuario_id: string; rol: RolTablero };

/** Fondos de color (como Trello: colores lisos y degradados). */
export const FONDOS: Record<string, { nombre: string; css: string }> = {
  azul: { nombre: "Azul", css: "#0c66e4" },
  celeste: { nombre: "Celeste", css: "#0891b2" },
  verde: { nombre: "Verde", css: "#1f845a" },
  naranja: { nombre: "Naranja", css: "#c25100" },
  rojo: { nombre: "Rojo", css: "#c9372c" },
  violeta: { nombre: "Violeta", css: "#6e5dc6" },
  rosa: { nombre: "Rosa", css: "#ae4787" },
  gris: { nombre: "Gris", css: "#44546f" },
  amanecer: { nombre: "Amanecer", css: "linear-gradient(135deg, #f97316 0%, #db2777 100%)" },
  oceano: { nombre: "Océano", css: "linear-gradient(135deg, #0ea5e9 0%, #4f46e5 100%)" },
  bosque: { nombre: "Bosque", css: "linear-gradient(135deg, #22c55e 0%, #0f766e 100%)" },
  noche: { nombre: "Noche", css: "linear-gradient(135deg, #1e293b 0%, #7c3aed 100%)" },
};

/** CSS del fondo de un tablero ('c:azul' o 'img:...' con su link temporal). */
export function fondoCss(fondo: string, url?: string | null) {
  if (fondo.startsWith("img:") && url) return `center / cover no-repeat url("${url}")`;
  return FONDOS[fondo.replace(/^c:/, "")]?.css ?? FONDOS.azul.css;
}

export const LISTAS_INICIALES = ["Por hacer", "En proceso", "En revisión", "Terminado"];

/** Iniciales para el avatar ("Agustina Pérez" → "AP"). */
export const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

const COLORES_AVATAR = ["#0c66e4", "#1f845a", "#c25100", "#6e5dc6", "#ae4787", "#0891b2", "#c9372c", "#44546f"];
/** Color fijo por usuario (siempre el mismo para la misma persona). */
export function colorAvatar(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES_AVATAR[h % COLORES_AVATAR.length];
}

/** Posición para insertar entre dos vecinos (orden por número, como Trello). */
export function posicionEntre(antes: number | undefined, despues: number | undefined) {
  if (antes === undefined && despues === undefined) return 1024;
  if (antes === undefined) return despues! / 2;
  if (despues === undefined) return antes + 1024;
  return (antes + despues) / 2;
}

/** Estado del vencimiento para el color de la etiqueta de fecha. */
export function estadoVencimiento(vence: string | null, completada: boolean, ahora = Date.now()) {
  if (!vence) return null;
  if (completada) return "completada" as const;
  const t = new Date(vence).getTime();
  if (t < ahora) return "vencida" as const;
  if (t - ahora < 24 * 3600 * 1000) return "proxima" as const;
  return "normal" as const;
}

export const COLOR_VENCIMIENTO = {
  completada: "bg-green-600 text-white",
  vencida: "bg-red-600 text-white",
  proxima: "bg-amber-400 text-amber-950",
  normal: "bg-stone-100 text-stone-700",
} as const;

export function textoVencimiento(vence: string) {
  const d = new Date(vence);
  const fecha = d.toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
  return hora === "23:59" ? fecha : `${fecha} ${hora}`;
}
