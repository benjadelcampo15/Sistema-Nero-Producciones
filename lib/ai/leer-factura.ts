import "server-only";
import { esquemaDatosFactura, instruccionesFactura, jsonSchemaFactura, type DatosFactura } from "./esquema";
import { ErrorIA, PROVEEDORES, type Archivo, type NombreProveedor } from "./proveedores";

export type ResultadoLectura = { datos: DatosFactura; proveedor: string; crudo: unknown };

/**
 * Lee una factura con el proveedor configurado (AI_PROVIDER).
 * AI_MODEL acepta varios modelos separados por coma, en orden de preferencia:
 * si uno está saturado o sin cupo, se pasa automáticamente al siguiente.
 * Es lo único que usa la app: cambiar de proveedor o de modelos no toca nada más.
 */
export async function leerFactura(archivo: Archivo, categorias: string[]): Promise<ResultadoLectura> {
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

  const instrucciones = instruccionesFactura(categorias);
  const esquema = jsonSchemaFactura(categorias);
  const saturados: string[] = [];

  for (const modelo of modelos) {
    let texto: string;
    try {
      texto = await proveedor({ archivo, instrucciones, esquema, modelo });
    } catch (e) {
      if (e instanceof ErrorIA && e.temporal) {
        saturados.push(modelo);
        continue;
      }
      throw e;
    }

    let crudo: unknown;
    try {
      crudo = JSON.parse(texto);
    } catch {
      throw new Error("La IA devolvió una respuesta que no es JSON válido");
    }
    const validacion = esquemaDatosFactura.safeParse(crudo);
    if (!validacion.success) {
      throw new Error(`La IA devolvió datos incompletos: ${validacion.error.issues[0].path.join(".")}`);
    }
    return { datos: validacion.data, proveedor: `${nombre}/${modelo}`, crudo };
  }

  throw new Error(`Todos los modelos de IA están saturados en este momento (${saturados.join(", ")}). Probá de nuevo en unos minutos.`);
}
