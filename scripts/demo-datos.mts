// Carga (o vuelve a cargar) la demo de Planix con una productora ficticia.
//   npm run demo:datos        (usa .env.demo)
//
// Borra todo lo que haya en la base de la DEMO y la deja como nueva (ver
// lib/demo/datos.ts). Se niega a correr si no es la base de la demo.

import { createClient } from "@supabase/supabase-js";
import { CLAVE_DEMO, EMAIL_DEMO, cargarDemo } from "../lib/demo/datos.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const secreta = process.env.SUPABASE_SECRET_KEY ?? "";
// Seguro: solo con el archivo de la demo (.env.demo).
if (!process.env.DEMO_DB_PASSWORD || !url || !secreta) {
  console.error("Esto solo corre contra la base de la demo: usá --env-file=.env.demo");
  process.exit(1);
}
const sb = createClient(url, secreta, { auth: { autoRefreshToken: false, persistSession: false } });
const clave = process.env.DEMO_CLAVE_USUARIO ?? CLAVE_DEMO;

console.log("Cargando la demo…");
console.log(await cargarDemo(sb, url, clave));
console.log(`Entrá con ${EMAIL_DEMO} / ${clave}`);
