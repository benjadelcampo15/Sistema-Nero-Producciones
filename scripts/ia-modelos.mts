// Lista los modelos disponibles para el proveedor de IA configurado.
//   npm run ia:modelos
// Sirve para elegir el valor de AI_MODEL en .env.local.

const proveedor = process.env.AI_PROVIDER ?? "gemini";

if (proveedor === "gemini") {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) throw new Error("Falta GEMINI_API_KEY en .env.local");
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
    headers: { "x-goog-api-key": clave },
  });
  const cuerpo = await r.json();
  if (!r.ok) throw new Error(cuerpo?.error?.message ?? r.statusText);
  const modelos = (cuerpo.models ?? []) as { name: string; displayName: string; supportedGenerationMethods?: string[] }[];
  console.log("Modelos de Gemini que sirven (generateContent):\n");
  for (const m of modelos.filter((m) => m.supportedGenerationMethods?.includes("generateContent"))) {
    console.log(`  ${m.name.replace("models/", "").padEnd(40)} ${m.displayName}`);
  }
} else if (proveedor === "openai") {
  const clave = process.env.OPENAI_API_KEY;
  if (!clave) throw new Error("Falta OPENAI_API_KEY en .env.local");
  const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${clave}` } });
  const cuerpo = await r.json();
  if (!r.ok) throw new Error(cuerpo?.error?.message ?? r.statusText);
  console.log("Modelos de OpenAI:\n");
  for (const m of ((cuerpo.data ?? []) as { id: string }[]).sort((a, b) => a.id.localeCompare(b.id))) {
    console.log(`  ${m.id}`);
  }
} else {
  throw new Error(`AI_PROVIDER inválido: ${proveedor}`);
}
