import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";

const MINUSCULAS = "abcdefghijkmnpqrstuvwxyz";
const MAYUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITOS = "23456789";
const SIMBOLOS = "!@#$%*-_+=?";

/** Contraseña temporal de 16 caracteres con todos los tipos de caracter. */
export function generarContrasenaTemporal() {
  const todos = MINUSCULAS + MAYUSCULAS + DIGITOS + SIMBOLOS;
  const caracteres = [MINUSCULAS, MAYUSCULAS, DIGITOS, SIMBOLOS].map(
    (grupo) => grupo[randomInt(grupo.length)],
  );
  while (caracteres.length < 16) {
    caracteres.push(todos[randomInt(todos.length)]);
  }
  // Mezcla Fisher-Yates para que los obligatorios no queden al principio.
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join("");
}

export const esquemaContrasenaNueva = z
  .string()
  .min(12, "Mínimo 12 caracteres")
  .max(72, "Máximo 72 caracteres")
  .regex(/[a-z]/, "Tiene que tener al menos una minúscula")
  .regex(/[A-Z]/, "Tiene que tener al menos una mayúscula")
  .regex(/[0-9]/, "Tiene que tener al menos un número");
