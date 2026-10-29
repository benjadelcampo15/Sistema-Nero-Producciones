// Carga (o vuelve a cargar) la demo de Planix con una productora ficticia.
//   npx tsx --env-file=.env.demo scripts/demo-datos.mts
//
// Borra todo lo que haya en la base de la DEMO y la deja como nueva: depósitos,
// cuentas, productos con stock y costo, proveedores con promos, pedidos,
// eventos con sus ingresos y egresos, cheques, clientes, personal, salidas por
// conteo y el usuario demo. Las fechas se arman alrededor de hoy, así la demo
// siempre se ve "al día". Se niega a correr si no es la base de la demo.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const secreta = process.env.SUPABASE_SECRET_KEY ?? "";
// Seguro: solo con el archivo de la demo (.env.demo) y nunca contra la base de Nero.
if (!process.env.DEMO_DB_PASSWORD || !url || !secreta || url.includes("kxlbygaidukxepszkoeo")) {
  console.error("Esto solo corre contra la base de la demo: usá --env-file=.env.demo");
  process.exit(1);
}
const sb = createClient(url, secreta, { auth: { autoRefreshToken: false, persistSession: false } });

const EMAIL_DEMO = "demo@planixops.com";
const CLAVE_DEMO = process.env.DEMO_CLAVE_USUARIO ?? "PlanixDemo2026";

// ─── Utilidades ──────────────────────────────────────────────────────────────
type Fila = Record<string, unknown>;
async function insertar<T = { id: string }>(tabla: string, filas: Fila | Fila[], campos = "id"): Promise<T[]> {
  // defaultToNull: false → lo que no viene en una fila toma el valor por defecto de la columna.
  const { data, error } = await sb.from(tabla).insert(filas, { defaultToNull: false }).select(campos);
  if (error) throw new Error(`${tabla}: ${error.message}`);
  return data as T[];
}
async function vaciar(tabla: string, columna = "id") {
  const { error } = await sb.from(tabla).delete().not(columna, "is", null);
  if (error && !/does not exist|schema cache/.test(error.message)) throw new Error(`vaciar ${tabla}: ${error.message}`);
}
// Números "al azar" pero siempre iguales (la demo se ve igual cada noche).
let semilla = 20261029;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
const entre = (a: number, b: number) => Math.round(a + azar() * (b - a));
const redondo = (n: number, a = 1000) => Math.round(n / a) * a;

const hoy = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date()) + "T12:00:00Z");
/** Fecha a `dias` de hoy (negativo: pasado), como "YYYY-MM-DD". */
const dia = (dias: number) => new Date(hoy.getTime() + dias * 86_400_000).toISOString().slice(0, 10);

// ─── 1. Vaciar la base de la demo ────────────────────────────────────────────
console.log("Vaciando la demo…");
for (const t of [
  "movimientos_stock", "salidas_stock", "pedido_items", "pedidos", "proveedor_productos", "productos",
  "extracto_lineas", "extractos", "cheques", "saldos_bancarios", "transacciones", "comprobantes_emitidos",
  "convocados", "polizas", "planillas_evento", "presupuestos", "eventos", "clientes", "proveedores",
  "personal_envios", "personal", "asiento_lineas", "asientos",
]) await vaciar(t);
await vaciar("cuentas_bancarias");
await vaciar("depositos");
await vaciar("auditoria");

// ─── 2. Usuario demo ─────────────────────────────────────────────────────────
const { data: usuarios } = await sb.auth.admin.listUsers();
let idDemo = usuarios?.users.find((u) => u.email === EMAIL_DEMO)?.id;
if (!idDemo) {
  const { data, error } = await sb.auth.admin.createUser({ email: EMAIL_DEMO, password: CLAVE_DEMO, email_confirm: true });
  if (error || !data.user) throw new Error(`usuario demo: ${error?.message}`);
  idDemo = data.user.id;
} else {
  // Cada noche vuelve la clave de siempre (por si alguien la cambió).
  await sb.auth.admin.updateUserById(idDemo, { password: CLAVE_DEMO });
}
await sb.from("permisos").delete().eq("usuario_id", idDemo);
await sb.from("perfiles").upsert({ id: idDemo, nombre: "Usuario Demo", email: EMAIL_DEMO, es_admin: false, activo: true, debe_cambiar_contrasena: false });
await insertar(
  "permisos",
  ["financiero", "objetivos", "facturas", "facturar", "cheques", "stock", "eventos", "presupuestos", "livings", "operativa"].map((seccion) => ({ usuario_id: idDemo, seccion, nivel: "editar" })),
  "usuario_id",
);

// ─── 3. Bancos, depósitos y categorías ───────────────────────────────────────
const [galicia, mp, caja] = await insertar("cuentas_bancarias", [
  { nombre: "Galicia", banco: "Banco Galicia", tipo: "cuenta_corriente", descubierto: 5_000_000, empresa: "nero" },
  { nombre: "Mercado Pago", banco: "Mercado Pago", tipo: "billetera", empresa: "nero" },
  { nombre: "Caja", banco: "Efectivo", tipo: "efectivo", empresa: "nero" },
]);
await insertar("saldos_bancarios", [
  { cuenta_id: galicia.id, fecha: dia(-60), saldo: 8_400_000 },
  { cuenta_id: mp.id, fecha: dia(-60), saldo: 1_250_000 },
  { cuenta_id: caja.id, fecha: dia(-60), saldo: 380_000 },
  { cuenta_id: galicia.id, fecha: dia(0), saldo: 12_950_000 },
  { cuenta_id: mp.id, fecha: dia(0), saldo: 2_310_000 },
  { cuenta_id: caja.id, fecha: dia(0), saldo: 520_000 },
]);
const [deposito, barra] = await insertar("depositos", [{ nombre: "Depósito central" }, { nombre: "Barra principal" }]);

const { data: categorias } = await sb.from("categorias").select("id, nombre, tipo");
const categoria = (tipo: "ingreso" | "egreso", nombre: string) => {
  const c = categorias?.find((x) => x.tipo === tipo && x.nombre === nombre) ?? categorias?.find((x) => x.tipo === tipo);
  if (!c) throw new Error(`falta la categoría ${tipo} ${nombre}`);
  return c.id;
};

// ─── 4. Clientes, proveedores y personal ─────────────────────────────────────
const clientes = await insertar<{ id: string; razon_social: string }>(
  "clientes",
  [
    { razon_social: "Bodega Los Álamos S.A.", doc_tipo: 80, doc_nro: "30712345671", condicion_iva: 1, email: "eventos@losalamos.demo" },
    { razon_social: "Cervecería Andina S.R.L.", doc_tipo: 80, doc_nro: "30709876541", condicion_iva: 1, email: "marketing@andina.demo" },
    { razon_social: "Banco del Oeste S.A.", doc_tipo: 80, doc_nro: "30501234561", condicion_iva: 1 },
    { razon_social: "Martina Ruiz", doc_tipo: 96, doc_nro: "35123456", condicion_iva: 5 },
    { razon_social: "Club Social Mendoza", doc_tipo: 80, doc_nro: "30698765431", condicion_iva: 4 },
  ],
  "id, razon_social",
);
const [andina, delValle] = await insertar("proveedores", [
  { razon_social: "Distribuidora Andina", contacto: "Pablo", telefono: "2610000001", email: "pedidos@distandina.demo", cuit: "30711111119" },
  { razon_social: "Bebidas del Valle", contacto: "Carla", telefono: "2610000002", email: "ventas@delvalle.demo", cuit: "30722222225" },
]);
await insertar(
  "personal",
  [
    ["Lucía", "Gómez", "38123456"], ["Tomás", "Pereyra", "40234567"], ["Camila", "Sosa", "39345678"], ["Joaquín", "Díaz", "41456789"],
    ["Valentina", "Romero", "37567890"], ["Facundo", "Torres", "42678901"], ["Sofía", "Álvarez", "36789012"], ["Mateo", "Ruiz", "43890123"],
  ].map(([nombre, apellido, dni]) => ({ nombre, apellido, dni, telefono: `261${dni.slice(-7)}`, alias_cbu: `${nombre}.${apellido}.mp`.toLowerCase() })),
);

// ─── 5. Productos con stock inicial y costo ─────────────────────────────────
const catalogo: { nombre: string; unidad: string; costo: number; stock: number; minimo: number; prov: string; promo?: string }[] = [
  { nombre: "Fernet Branca 750", unidad: "botella", costo: 15_900, stock: 60, minimo: 40, prov: andina.id, promo: "10+1" },
  { nombre: "Gin Bombay 750", unidad: "botella", costo: 28_500, stock: 24, minimo: 18, prov: andina.id, promo: "4+1" },
  { nombre: "Vodka Absolut 750", unidad: "botella", costo: 24_800, stock: 30, minimo: 20, prov: andina.id, promo: "4+1" },
  { nombre: "Aperol 750", unidad: "botella", costo: 11_200, stock: 36, minimo: 24, prov: andina.id },
  { nombre: "Whisky Johnnie Red 750", unidad: "botella", costo: 31_000, stock: 12, minimo: 10, prov: andina.id, promo: "4+1" },
  { nombre: "Espumante Extra Brut", unidad: "botella", costo: 9_800, stock: 48, minimo: 36, prov: andina.id },
  { nombre: "Vino Malbec de la casa", unidad: "botella", costo: 5_200, stock: 120, minimo: 60, prov: andina.id },
  { nombre: "Coca-Cola lata 354", unidad: "unidad", costo: 1_450, stock: 480, minimo: 300, prov: delValle.id, promo: "10%" },
  { nombre: "Coca-Cola Zero lata 354", unidad: "unidad", costo: 1_450, stock: 240, minimo: 200, prov: delValle.id, promo: "10%" },
  { nombre: "Sprite lata 354", unidad: "unidad", costo: 1_400, stock: 180, minimo: 120, prov: delValle.id },
  { nombre: "Tónica lata 354", unidad: "unidad", costo: 1_350, stock: 300, minimo: 200, prov: delValle.id },
  { nombre: "Agua sin gas 500", unidad: "unidad", costo: 480, stock: 600, minimo: 400, prov: delValle.id },
  { nombre: "Red Bull 250", unidad: "unidad", costo: 2_200, stock: 288, minimo: 200, prov: delValle.id },
  { nombre: "Cerveza lata 473", unidad: "unidad", costo: 1_650, stock: 720, minimo: 480, prov: delValle.id },
  { nombre: "Hielo bolsa 2 kg", unidad: "unidad", costo: 1_200, stock: 80, minimo: 60, prov: delValle.id },
  { nombre: "Vasos descartables 500", unidad: "pack", costo: 3_500, stock: 25, minimo: 20, prov: delValle.id },
];
const productos = await insertar<{ id: string; nombre: string }>(
  "productos",
  catalogo.map((p) => ({ nombre: p.nombre, unidad: p.unidad, stock_minimo: p.minimo })),
  "id, nombre",
);
const idProducto = (nombre: string) => productos.find((p) => p.nombre === nombre)!.id;
// Carga inicial hace dos meses: 70 % en el depósito y 30 % en la barra.
await insertar(
  "movimientos_stock",
  catalogo.flatMap((p) => [
    { producto_id: idProducto(p.nombre), deposito_id: deposito.id, tipo: "ajuste", cantidad: Math.round(p.stock * 0.7), costo_unitario: p.costo, fecha: dia(-62), motivo: "Carga inicial de stock" },
    { producto_id: idProducto(p.nombre), deposito_id: barra.id, tipo: "ajuste", cantidad: Math.round(p.stock * 0.3), costo_unitario: p.costo, fecha: dia(-62), motivo: "Carga inicial de stock" },
  ]),
);
await insertar(
  "proveedor_productos",
  catalogo.map((p) => ({ proveedor_id: p.prov, producto_id: idProducto(p.nombre), precio: p.costo, promo: p.promo ?? null })),
  "producto_id",
);

// ─── 6. Pedidos: dos recibidos y uno enviado ────────────────────────────────
const bonificadas = (promo: string | undefined, cantidad: number) => {
  const m = /^(\d+)\+(\d+)$/.exec(promo ?? "");
  return m ? Math.floor(cantidad / Number(m[1])) * Number(m[2]) : 0;
};
async function pedido(proveedor: string, fecha: string, estado: "recibido" | "enviado", items: [string, number][]) {
  const [p] = await insertar<{ id: string; numero: number }>(
    "pedidos",
    { proveedor_id: proveedor, deposito_id: deposito.id, fecha, fecha_entrega: dia(Number(fecha.slice(8)) % 3), estado, recibido_en: estado === "recibido" ? fecha : null },
    "id, numero",
  );
  await insertar(
    "pedido_items",
    items.map(([nombre, cantidad], orden) => {
      const c = catalogo.find((x) => x.nombre === nombre)!;
      return {
        pedido_id: p.id, orden, producto_id: idProducto(nombre), cantidad, precio_unitario: c.promo?.endsWith("%") ? redondo(c.costo * 0.9, 10) : c.costo,
        promo: c.promo ?? null, bonificadas: bonificadas(c.promo, cantidad),
        cantidad_recibida: estado === "recibido" ? cantidad : null, bonificadas_recibidas: estado === "recibido" ? bonificadas(c.promo, cantidad) : null,
      };
    }),
  );
  if (estado === "recibido") {
    await insertar(
      "movimientos_stock",
      items.flatMap(([nombre, cantidad]) => {
        const c = catalogo.find((x) => x.nombre === nombre)!;
        const regalo = bonificadas(c.promo, cantidad);
        return [
          { producto_id: idProducto(nombre), deposito_id: deposito.id, tipo: "entrada", cantidad, costo_unitario: c.costo, fecha, motivo: `Pedido N° ${p.numero}`, pedido_id: p.id },
          ...(regalo ? [{ producto_id: idProducto(nombre), deposito_id: deposito.id, tipo: "entrada", cantidad: regalo, costo_unitario: 0, fecha, motivo: `Pedido N° ${p.numero} · bonificación`, pedido_id: p.id }] : []),
        ];
      }),
    );
  }
}
await pedido(andina.id, dia(-40), "recibido", [["Fernet Branca 750", 40], ["Gin Bombay 750", 12], ["Vodka Absolut 750", 12]]);
await pedido(delValle.id, dia(-25), "recibido", [["Coca-Cola lata 354", 240], ["Tónica lata 354", 120], ["Cerveza lata 473", 480], ["Agua sin gas 500", 300]]);
await pedido(andina.id, dia(-2), "enviado", [["Fernet Branca 750", 30], ["Aperol 750", 24], ["Whisky Johnnie Red 750", 8]]);

// ─── 7. Eventos con sus ingresos, egresos y salidas de barra ────────────────
const eventos = [
  { nombre: "Casamiento Ruiz – Gómez", dias: -48, lugar: "Finca Los Álamos", estado: "cerrado", empresa: "nero", cobro: 18_500_000, cliente: "Martina Ruiz" },
  { nombre: "Lanzamiento Cerveza Andina", dias: -33, lugar: "Galpón Godoy Cruz", estado: "cerrado", empresa: "ruta", cobro: 12_800_000, cliente: "Cervecería Andina S.R.L." },
  { nombre: "Fiesta Bodega Los Álamos", dias: -19, lugar: "Bodega Los Álamos", estado: "cerrado", empresa: "nero", cobro: 24_000_000, cliente: "Bodega Los Álamos S.A." },
  { nombre: "Corporativo Banco del Oeste", dias: -6, lugar: "Hotel Plaza", estado: "cerrado", empresa: "ruta", cobro: 9_600_000, cliente: "Banco del Oeste S.A." },
  { nombre: "Festival de Primavera", dias: 9, lugar: "Parque Central", estado: "planificado", empresa: "nero", cobro: 30_000_000, cliente: "Club Social Mendoza" },
  { nombre: "Cena de fin de año Club Social", dias: 38, lugar: "Club Social Mendoza", estado: "planificado", empresa: "nero", cobro: 14_500_000, cliente: "Club Social Mendoza" },
];
const movimientos: Fila[] = [];
const chequesFilas: Fila[] = [];
for (const e of eventos) {
  const [ev] = await insertar("eventos", { nombre: e.nombre, fecha: dia(e.dias), lugar: e.lugar, estado: e.estado, empresa: e.empresa, presupuesto: redondo(e.cobro * 0.6, 100_000) });
  const pasado = e.dias < 0;
  const neto = e.cobro;
  // Ingreso del evento (facturado con IVA); el futuro, pendiente.
  movimientos.push({
    empresa: e.empresa, tipo: "ingreso", monto: neto, fecha: dia(e.dias + (pasado ? 5 : 0)), descripcion: e.nombre, contraparte: e.cliente,
    categoria_id: categoria("ingreso", "Eventos"), evento_id: ev.id, medio_pago: "transferencia", estado: pasado ? "real" : "pendiente", facturado: true, iva: redondo(neto * 0.21, 1),
  });
  // Costos del evento.
  const costos: [string, string, number][] = [
    ["Técnica", "Sonido e iluminación", 0.14], ["Artística", "DJ y show en vivo", 0.12], ["Logística", "Fletes y armado", 0.06],
    ["Staff", "Mozos y barra", 0.08], ["Seguridad", "Seguridad del evento", 0.03], ["Producción", "Ambientación", 0.07],
  ];
  for (const [cat, desc, pct] of costos) {
    const monto = redondo(neto * pct * (0.85 + azar() * 0.3));
    const conCheque = cat === "Técnica" && e.dias > -40;
    movimientos.push({
      empresa: e.empresa, tipo: "egreso", monto, fecha: dia(e.dias - entre(0, 4)), descripcion: `${desc} · ${e.nombre}`, contraparte: `Proveedor ${cat}`,
      categoria_id: categoria("egreso", cat), evento_id: ev.id, medio_pago: conCheque ? "cheque_emitido" : "transferencia",
      estado: pasado ? "real" : "pendiente", facturado: cat !== "Staff", iva: cat !== "Staff" ? redondo(monto * 0.21, 1) : null,
    });
    if (conCheque) chequesFilas.push({ tipo: "emitido", estado: pasado && e.dias < -10 ? "debitado" : "pendiente", electronico: true, numero: String(entre(10_000_000, 99_999_999)), banco: "Banco Galicia", monto, fecha_emision: dia(e.dias - 3), fecha_pago: dia(e.dias + 27), contraparte: `Proveedor ${cat}`, evento_id: ev.id, empresa: e.empresa });
  }
  // Salida de barra del evento (conteo al final de la noche), con su costo.
  if (pasado) {
    const [salida] = await insertar("salidas_stock", { fecha: dia(e.dias), deposito_id: barra.id, evento_id: ev.id, modo: "conteo", motivo: "Conteo de barra" });
    const lineas = catalogo.filter(() => azar() > 0.3).map((p) => {
      const inicial = Math.round(p.stock * 0.3);
      const sale = Math.max(1, Math.round(inicial * (0.08 + azar() * 0.12)));
      return { producto_id: idProducto(p.nombre), deposito_id: barra.id, tipo: "salida", cantidad: -sale, costo_unitario: p.costo, fecha: dia(e.dias), motivo: "Conteo de barra", evento_id: ev.id, salida_id: salida.id, stock_inicial: inicial, stock_contado: inicial - sale };
    });
    await insertar("movimientos_stock", lineas);
  }
}
// Gastos fijos de los últimos tres meses (y el próximo, pendiente).
for (let m = -2; m <= 1; m++) {
  const d = (n: number) => dia(m * 30 + n - 10);
  const estado = m <= 0 ? "real" : "pendiente";
  movimientos.push(
    { empresa: "nero", tipo: "egreso", monto: 4_800_000, fecha: d(5), descripcion: "Sueldos del equipo", contraparte: "Equipo", categoria_id: categoria("egreso", "Sueldos"), medio_pago: "transferencia", estado },
    { empresa: "nero", tipo: "egreso", monto: entre(900_000, 1_400_000), fecha: d(15), descripcion: "IVA y Ingresos Brutos", contraparte: "ARCA / Rentas", categoria_id: categoria("egreso", "Impuestos"), medio_pago: "transferencia", estado },
    { empresa: "nero", tipo: "egreso", monto: entre(350_000, 600_000), fecha: d(10), descripcion: "Publicidad en redes", contraparte: "Meta Ads", categoria_id: categoria("egreso", "Marketing"), medio_pago: "tarjeta", estado },
    { empresa: "ruta", tipo: "ingreso", monto: 2_400_000, fecha: d(8), descripcion: "Fee mensual · Cervecería Andina", contraparte: "Cervecería Andina S.R.L.", categoria_id: categoria("ingreso", "Fee"), medio_pago: "transferencia", estado, facturado: true, iva: 504_000 },
    { empresa: "ruta", tipo: "egreso", monto: 1_900_000, fecha: d(6), descripcion: "Sueldos del equipo de la agencia", contraparte: "Equipo", categoria_id: categoria("egreso", "Sueldos"), medio_pago: "transferencia", estado },
  );
}
// Venta de la barra (cobros con Mercado Pago y efectivo).
for (const e of eventos.filter((x) => x.dias < 0 && x.empresa === "nero")) {
  movimientos.push({ empresa: "nero", tipo: "ingreso", monto: redondo(e.cobro * 0.35), fecha: dia(e.dias + 1), descripcion: `Ventas de barra · ${e.nombre}`, contraparte: "Mercado Pago", categoria_id: categoria("ingreso", "Revoleo de mercadería"), medio_pago: "mercado_pago", estado: "real" });
}
// Un cheque recibido de un cliente.
chequesFilas.push({ tipo: "recibido", estado: "pendiente", electronico: true, numero: "45879123", banco: "Banco Nación", monto: 6_000_000, fecha_emision: dia(-4), fecha_pago: dia(12), contraparte: "Club Social Mendoza", empresa: "nero" });
await insertar("transacciones", movimientos);
await insertar("cheques", chequesFilas);

console.log(`Listo. Entrá con ${EMAIL_DEMO} / ${CLAVE_DEMO}`);
console.log(`${clientes.length} clientes · ${productos.length} productos · ${eventos.length} eventos · ${movimientos.length} movimientos · ${chequesFilas.length} cheques`);
