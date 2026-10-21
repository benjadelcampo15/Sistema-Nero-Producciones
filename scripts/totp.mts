// Código 2FA actual del usuario de prueba (para probar la app en local).
//   npm run totp
// Lee PRUEBA_TOTP_SECRET de .env.local.

import { createHmac } from "node:crypto";

const secreto = process.env.PRUEBA_TOTP_SECRET;
if (!secreto) {
  console.error("Falta PRUEBA_TOTP_SECRET en .env.local");
  process.exit(1);
}

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
let bits = "";
for (const c of secreto.replace(/=+$/, "").toUpperCase()) {
  bits += ALFABETO.indexOf(c).toString(2).padStart(5, "0");
}
const clave = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));

const contador = Buffer.alloc(8);
contador.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
const hmac = createHmac("sha1", clave).update(contador).digest();
const desfase = hmac[hmac.length - 1] & 0xf;
const codigo = (hmac.readUInt32BE(desfase) & 0x7fffffff) % 1_000_000;

console.log(String(codigo).padStart(6, "0"));
