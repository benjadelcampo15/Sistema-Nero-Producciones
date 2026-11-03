import { z } from "zod";
import { cuitValido } from "@/lib/cuit";

/** Datos del empleado, en el orden del formulario. */
export const CAMPOS_PERSONA = [
  { id: "nombre", nombre: "Nombre" },
  { id: "apellido", nombre: "Apellido" },
  { id: "dni", nombre: "DNI" },
  { id: "cuil", nombre: "CUIL" },
  { id: "fecha_nacimiento", nombre: "Fecha de nacimiento" },
  { id: "telefono", nombre: "Teléfono" },
  { id: "email", nombre: "Email" },
  { id: "domicilio", nombre: "Domicilio" },
  { id: "contacto_emergencia", nombre: "Contacto de emergencia" },
  { id: "alias_cbu", nombre: "Alias o CBU" },
] as const;
export type CampoPersona = (typeof CAMPOS_PERSONA)[number]["id"];

export type Persona = {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  cuil: string | null;
  fecha_nacimiento: string | null;
  telefono: string | null;
  email: string | null;
  domicilio: string | null;
  contacto_emergencia: string | null;
  alias_cbu: string | null;
  notas: string | null;
};

export type DatosPersona = Omit<Persona, "id" | "notas">;

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

/**
 * Teléfono argentino en 10 números (área sin 0 + número sin 15), sin nada más.
 * Acepta +54 / +54 9 / 0 adelante, para los que ya estaban cargados así.
 */
export function telefonoNacional(valor: string) {
  let n = valor.replace(/\D/g, "");
  if (n.startsWith("549") && n.length === 13) n = n.slice(3);
  else if (n.startsWith("54") && n.length === 12) n = n.slice(2);
  else if (n.startsWith("0") && n.length === 11) n = n.slice(1);
  return n;
}

/** Lo que carga el empleado (formulario público) o la productora. */
export const esquemaPersona = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre").max(80),
  apellido: z.string().trim().min(1, "Falta el apellido").max(80),
  dni: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => /^\d{7,8}$/.test(v), "DNI inválido: tienen que ser 7 u 8 números, sin puntos"),
  cuil: z
    .string()
    .optional()
    .transform((v) => (v ?? "").replace(/\D/g, "") || null)
    .refine((v) => v === null || cuitValido(v), "CUIL inválido: tienen que ser 11 números correctos, como 20-12345678-9"),
  fecha_nacimiento: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de nacimiento inválida"), z.literal("")])
    .optional()
    .transform((v) => v || null),
  telefono: z
    .string()
    .optional()
    .transform((v) => telefonoNacional(v ?? "") || null)
    .refine((v) => v === null || /^\d{10}$/.test(v), "Teléfono inválido: tienen que ser 10 números, con el área sin 0 y sin el 15. Ej.: 2615551234"),
  email: z.union([z.email("Email inválido").trim(), z.literal("")]).optional().transform((v) => v || null),
  domicilio: opcional(200),
  contacto_emergencia: opcional(200),
  alias_cbu: opcional(60),
});

export const ESTADOS_SEGURO = [
  { id: "pendiente", nombre: "Sin pedir" },
  { id: "solicitado", nombre: "Solicitado" },
  { id: "cubierto", nombre: "Cubierto" },
] as const;
export type EstadoSeguro = (typeof ESTADOS_SEGURO)[number]["id"];

export const nombreCompleto = (p: Pick<Persona, "nombre" | "apellido">) => `${p.apellido}, ${p.nombre}`;

/** Colores para los puestos de un evento (se ven en la pantalla y en el PDF). */
export const COLORES_PUESTO = [
  { color: "#dc2626", nombre: "Rojo" },
  { color: "#2563eb", nombre: "Azul" },
  { color: "#16a34a", nombre: "Verde" },
  { color: "#ea580c", nombre: "Naranja" },
  { color: "#7c3aed", nombre: "Violeta" },
  { color: "#0d9488", nombre: "Turquesa" },
  { color: "#db2777", nombre: "Rosa" },
  { color: "#ca8a04", nombre: "Amarillo" },
  { color: "#0284c7", nombre: "Celeste" },
  { color: "#57534e", nombre: "Gris" },
] as const;

export type Puesto = { id: string; nombre: string; color: string; orden: number };

/** El primer color que todavía no usa ningún puesto del evento (o el que sigue, si están todos). */
export const colorLibre = (puestos: Pick<Puesto, "color">[]) =>
  (COLORES_PUESTO.find((c) => !puestos.some((p) => p.color === c.color)) ?? COLORES_PUESTO[puestos.length % COLORES_PUESTO.length]).color;

/** El color del puesto, aclarado (fondo de las filas). */
export function colorSuave(hex: string, cuanto = 0.88) {
  const n = parseInt(hex.slice(1), 16);
  const mezcla = (c: number) => Math.round(c + (255 - c) * cuanto);
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((c) => mezcla(c).toString(16).padStart(2, "0")).join("")}`;
}
