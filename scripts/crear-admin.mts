// Crea el primer administrador. Uso:
//   npm run crear-admin -- email@ejemplo.com "Nombre Apellido"
//
// Imprime una contraseña temporal; al ingresar se pide cambiarla y configurar el 2FA.

import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [email, nombre] = process.argv.slice(2);
if (!email || !nombre) {
  console.error('Uso: npm run crear-admin -- email@ejemplo.com "Nombre Apellido"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secreta = process.env.SUPABASE_SECRET_KEY;
if (!url || !secreta) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local");
  process.exit(1);
}

const grupos = ["abcdefghijkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%*-_+=?"];
const todos = grupos.join("");
const caracteres = grupos.map((g) => g[randomInt(g.length)]);
while (caracteres.length < 16) caracteres.push(todos[randomInt(todos.length)]);
for (let i = caracteres.length - 1; i > 0; i--) {
  const j = randomInt(i + 1);
  [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
}
const contrasena = caracteres.join("");

const supabase = createClient(url, secreta, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await supabase.auth.admin.createUser({
  email: email.trim().toLowerCase(),
  password: contrasena,
  email_confirm: true,
});
if (error || !data.user) {
  console.error("No se pudo crear el usuario:", error?.message);
  process.exit(1);
}

const id = data.user.id;
const { error: errorPerfil } = await supabase.from("perfiles").insert({
  id,
  nombre: nombre.trim(),
  email: email.trim().toLowerCase(),
  es_admin: true,
  debe_cambiar_contrasena: true,
});
const { error: errorPermisos } = errorPerfil
  ? { error: errorPerfil }
  : await supabase.from("permisos").insert(
      ["financiero", "eventos", "facturas", "stock"].map((seccion) => ({ usuario_id: id, seccion, nivel: "editar" })),
    );

if (errorPerfil || errorPermisos) {
  await supabase.auth.admin.deleteUser(id);
  console.error("No se pudo crear el perfil:", (errorPerfil ?? errorPermisos)?.message);
  console.error("¿Corriste la migración de supabase/migrations en el SQL Editor?");
  process.exit(1);
}

await supabase.from("auditoria").insert({
  usuario_id: id,
  accion: "CREAR_ADMIN_INICIAL",
  tabla: "perfiles",
  registro_id: id,
});

console.log("\nAdministrador creado.");
console.log(`  Email:                ${email}`);
console.log(`  Contraseña temporal:  ${contrasena}`);
console.log("\nAl ingresar se pide cambiarla y configurar la verificación en dos pasos.\n");
