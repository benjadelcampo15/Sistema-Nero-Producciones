import "server-only";
import { esquemaDatosFactura, instruccionesFactura, jsonSchemaFactura, type DatosFactura } from "./esquema";
import { ErrorIA, PROVEEDORES, type Archivo, type NombreProveedor, type Proveedor } from "./proveedores";

export type ResultadoLectura = { datos: DatosFactura; proveedor: string; crudo: unknown };

/** Los picos de saturación suelen durar segundos: si fallan todos, se espera y se reintenta la lista. */
const VUELTAS = 2;
const ESPERA_ENTRE_VUELTAS_MS = 4_000;

function descripcionFallo(e: ErrorIA) {
  if (e.estado === 503 || e.estado === 500 || e.estado === 502 || e.estado === 504) return "saturado";
  if (e.estado === 429) return "sin cupo";
  if (e.estado === 0) return "sin conexión";
  return e.message;
}

/**
 * Lee una factura con el proveedor configurado (AI_PROVIDER).
 * AI_MODEL acepta varios modelos separados por coma, en orden de preferencia:
 * si uno falla (saturado, sin cupo, dado de baja…) se pasa al siguiente.
 * Es lo único que usa la app: cambiar de proveedor o de modelos no toca nada más.
 */
export async function leerFactura(archivo: Archivo, categorias: string[]): Promise<ResultadoLectura> {
  return extraerConIA(archivo, instruccionesFactura(categorias), jsonSchemaFactura(categorias), (crudo) => {
    const validacion = esquemaDatosFactura.safeParse(crudo);
    if (!validacion.success) throw new Error(`La IA devolvió datos incompletos: ${validacion.error.issues[0].path.join(".")}`);
    return validacion.data;
  });
}

/**
 * Extrae datos de un archivo (PDF o imagen) con el proveedor y modelos
 * configurados, probando el siguiente modelo si uno falla. `validar` recibe
 * el JSON devuelto y tira un error si no sirve.
 */
export async function extraerConIA<T>(
  archivo: Archivo,
  instrucciones: string,
  esquema: object,
  validar: (crudo: unknown) => T,
): Promise<{ datos: T; proveedor: string; crudo: unknown }> {
  const nombre = (process.env.AI_PROVIDER ?? "gemini") as NombreProveedor;
  const proveedor = PROVEEDORES[nombre];
  if (!proveedor) throw new Error(`AI_PROVIDER inválido: "${nombre}" (usar gemini u openai)`);

  const modelos = (process.env.AI_MODEL ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  if (!modelos.length) {
    throw new Error("Falta AI_MODEL en las variables de entorno (npm run ia:modelos lista los disponibles)");
  }

  const pedido = { archivo, instrucciones, esquema };
  let fallos: string[] = [];

  for (let vuelta = 0; vuelta < VUELTAS; vuelta++) {
    if (vuelta > 0) await new Promise((r) => setTimeout(r, ESPERA_ENTRE_VUELTAS_MS));
    const intento = await probarModelos(proveedor, modelos, pedido, validar);
    if ("resultado" in intento) {
      return { ...intento.resultado, proveedor: `${nombre}/${intento.resultado.proveedor}` };
    }
    fallos = intento.fallos;
    // Si algún error no es temporal (clave inválida, modelo dado de baja), otra vuelta no sirve.
    if (!intento.todosTemporales) break;
  }

  throw new Error(`Ningún modelo de IA pudo leer el archivo. Probá de nuevo en unos minutos. (${fallos.join(" · ")})`);
}

type Intento<T> = { resultado: { datos: T; proveedor: string; crudo: unknown } } | { fallos: string[]; todosTemporales: boolean };

async function probarModelos<T>(
  proveedor: Proveedor,
  modelos: string[],
  pedido: Omit<Parameters<Proveedor>[0], "modelo">,
  validar: (crudo: unknown) => T,
): Promise<Intento<T>> {
  const fallos: string[] = [];
  let todosTemporales = true;

  for (const modelo of modelos) {
    let texto: string;
    try {
      texto = await proveedor({ ...pedido, modelo });
    } catch (e) {
      if (!(e instanceof ErrorIA)) throw e;
      fallos.push(`${modelo}: ${descripcionFallo(e)}`);
      if (!e.temporal) todosTemporales = false;
      continue;
    }
    let crudo: unknown;
    try {
      crudo = JSON.parse(texto);
    } catch {
      throw new Error("La IA devolvió una respuesta que no es JSON válido");
    }
    return { resultado: { datos: validar(crudo), proveedor: modelo, crudo } };
  }
  return { fallos, todosTemporales };
}

