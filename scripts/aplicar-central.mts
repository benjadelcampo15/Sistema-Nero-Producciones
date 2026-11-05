// Aplica las migraciones de la base central de Planix (Centro de Solicitudes).
//   CENTRAL_DB_URL=postgresql://… node scripts/aplicar-central.mts
//   npm run central:migrar        (local: usa la base de la demo, de .env.demo)
//
// Las tablas centrales viven en la base de la demo pero con su propio registro
// (public.central_migraciones), aparte del historial de supabase/migrations,
// para no mezclar las dos cosas.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url =
  process.env.CENTRAL_DB_URL ||
  (process.env.DEMO_DB_PASSWORD && process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `postgresql://postgres.${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}:${encodeURIComponent(process.env.DEMO_DB_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
    : "");
if (!url) {
  console.error("Falta CENTRAL_DB_URL (o correr con --env-file=.env.demo)");
  process.exit(1);
}
if (url.includes("kxlbygaidukxepszkoeo")) {
  console.error("La base central no va en la base de Nero");
  process.exit(1);
}

const carpeta = join(import.meta.dirname, "..", "central", "supabase", "migrations");
const archivos = readdirSync(carpeta).filter((a) => a.endsWith(".sql")).sort();

const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await cliente.connect();
try {
  await cliente.query("create table if not exists public.central_migraciones (nombre text primary key, aplicada_en timestamptz not null default now())");
  await cliente.query("alter table public.central_migraciones enable row level security");
  const { rows } = await cliente.query<{ nombre: string }>("select nombre from public.central_migraciones");
  const hechas = new Set(rows.map((r) => r.nombre));
  const pendientes = archivos.filter((a) => !hechas.has(a));
  if (!pendientes.length) console.log("La base central está al día.");
  for (const archivo of pendientes) {
    // Cada migración entera o nada.
    await cliente.query("begin");
    try {
      await cliente.query(readFileSync(join(carpeta, archivo), "utf8"));
      await cliente.query("insert into public.central_migraciones (nombre) values ($1)", [archivo]);
      await cliente.query("commit");
      console.log(`Aplicada: ${archivo}`);
    } catch (e) {
      await cliente.query("rollback");
      throw new Error(`${archivo}: ${e instanceof Error ? e.message : e}`);
    }
  }
} finally {
  await cliente.end();
}
