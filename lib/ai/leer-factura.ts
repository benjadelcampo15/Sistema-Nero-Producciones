import "server-only";
import { esquemaDatosFactura, instruccionesFactura, jsonSchemaFactura, type DatosFactura } from "./esquema";
import { PROVEEDORES, type Archivo, type NombreProveedor } from "./proveedores";

export type ResultadoLectura = { datos: DatosFactura; proveedor: string; crudo: unknown };

/**
 * Lee una factura con el proveedor configurado (AI_PROVIDER + AI_MODEL).
 * Es lo único que usa la app: cambiar de proveedor no toca nada más.
 */
export async function leerFactura(archivo: Archivo, categorias: string[]): Promise<ResultadoLectura> {
  const nombre = (process.env.AI_PROVIDER ?? "gemini") as NombreProveedor;
  const proveedor = PROVEEDORES[nombre];
  if (!proveedor) throw new Error(`AI_PROVIDER inválido: "${nombre}" (usar gemini u openai)`);
  const modelo = process.env.AI_MODEL;
  if (!modelo) throw new Error("Falta AI_MODEL en las variables de entorno (npm run ia:modelos lista los disponibles)");

  const texto = await proveedor({
    archivo,
    instrucciones: instruccionesFactura(categorias),
    esquema: jsonSchemaFactura(categorias),
    modelo,
  });

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
