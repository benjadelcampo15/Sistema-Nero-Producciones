/**
 * Datos de la empresa que usa esta instalación de Planix (cada cliente tiene
 * su propio proyecto con sus variables). Sin variables, es la de Nero.
 * NEXT_PUBLIC_*: se leen también en el navegador (quedan fijas al compilar).
 */

/** Nombre de la empresa en documentos, mails y páginas para terceros (en la demo: "Demo"). */
export const NOMBRE_CLIENTE = process.env.NEXT_PUBLIC_NOMBRE_EMPRESA?.trim() || "Nero Producciones";

/** Instalación de demostración: datos ficticios y nada que tenga efectos reales (ARCA, mails). */
export const MODO_DEMO = process.env.NEXT_PUBLIC_MODO_DEMO === "1";
