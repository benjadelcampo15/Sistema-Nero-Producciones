import "server-only";

export type Archivo = { datos: Buffer; tipo: string; nombre: string };

export type PedidoExtraccion = {
  archivo: Archivo;
  instrucciones: string;
  esquema: object;
  modelo: string;
};

/** Devuelve el JSON (como texto) que generó el modelo. */
export type Proveedor = (pedido: PedidoExtraccion) => Promise<string>;

const TIEMPO_MAXIMO_MS = 60_000;

/**
 * Error del servicio de IA. `temporal`: saturado, sin cupo o sin conexión;
 * conviene probar otro modelo. `estado`: código HTTP (0 si no hubo respuesta).
 */
export class ErrorIA extends Error {
  constructor(
    mensaje: string,
    readonly temporal: boolean,
    readonly estado: number,
  ) {
    super(mensaje);
  }
}

const TEMPORALES = new Set([429, 500, 502, 503, 504]);

async function pedirJson(url: string, init: RequestInit) {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, { ...init, signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS) });
  } catch {
    throw new ErrorIA("No se pudo conectar con el servicio de IA (o tardó demasiado)", true, 0);
  }
  const cuerpo = await respuesta.json().catch(() => null);
  if (respuesta.ok) return cuerpo;

  const mensaje = cuerpo?.error?.message ?? respuesta.statusText;
  throw new ErrorIA(
    `El servicio de IA respondió ${respuesta.status}: ${mensaje}`,
    TEMPORALES.has(respuesta.status),
    respuesta.status,
  );
}

/** Gemini (Google). Plan gratuito para desarrollo. */
export const gemini: Proveedor = async ({ archivo, instrucciones, esquema, modelo }) => {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) throw new Error("Falta GEMINI_API_KEY en las variables de entorno");

  const cuerpo = await pedirJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": clave },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: archivo.tipo, data: archivo.datos.toString("base64") } },
              { text: instrucciones },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: esquema,
        },
      }),
    },
  );

  const texto = cuerpo?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    .join("");
  if (!texto) {
    const motivo = cuerpo?.candidates?.[0]?.finishReason ?? cuerpo?.promptFeedback?.blockReason ?? "sin respuesta";
    throw new Error(`Gemini no devolvió datos (${motivo})`);
  }
  return texto;
};

/** OpenAI (Responses API). Para producción. */
export const openai: Proveedor = async ({ archivo, instrucciones, esquema, modelo }) => {
  const clave = process.env.OPENAI_API_KEY;
  if (!clave) throw new Error("Falta OPENAI_API_KEY en las variables de entorno");

  const dataUrl = `data:${archivo.tipo};base64,${archivo.datos.toString("base64")}`;
  const adjunto =
    archivo.tipo === "application/pdf"
      ? { type: "input_file", filename: archivo.nombre, file_data: dataUrl }
      : { type: "input_image", image_url: dataUrl };

  const cuerpo = await pedirJson("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` },
    body: JSON.stringify({
      model: modelo,
      input: [{ role: "user", content: [adjunto, { type: "input_text", text: instrucciones }] }],
      text: { format: { type: "json_schema", name: "datos_factura", schema: esquema, strict: true } },
    }),
  });

  const texto = (cuerpo?.output ?? [])
    .flatMap((item: { content?: { type: string; text?: string; refusal?: string }[] }) => item.content ?? [])
    .map((c: { type: string; text?: string; refusal?: string }) => {
      if (c.type === "refusal") throw new Error(`OpenAI rechazó el pedido: ${c.refusal}`);
      return c.type === "output_text" ? (c.text ?? "") : "";
    })
    .join("");
  if (!texto) throw new Error("OpenAI no devolvió datos");
  return texto;
};

export const PROVEEDORES = { gemini, openai } as const;
export type NombreProveedor = keyof typeof PROVEEDORES;
