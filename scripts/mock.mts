// Datos de prueba para desarrollo.
//   npm run mock          → carga eventos y movimientos (marcados con notas = 'MOCK')
//   npm run mock:borrar   → borra todo lo marcado como MOCK
//
// Usa la clave secreta; los movimientos quedan sin "creado_por".

import { createClient } from "@supabase/supabase-js";

const MARCA = "MOCK";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secreta = process.env.SUPABASE_SECRET_KEY;
if (!url || !secreta) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local");
  process.exit(1);
}
const supabase = createClient(url, secreta, { auth: { autoRefreshToken: false, persistSession: false } });

async function borrar() {
  const t = await supabase.from("transacciones").delete().eq("notas", MARCA).select("id");
  const e = await supabase.from("eventos").delete().eq("notas", MARCA).select("id");
  if (t.error || e.error) throw new Error((t.error ?? e.error)!.message);
  console.log(`Borrados: ${t.data.length} movimientos y ${e.data.length} eventos de prueba.`);
}

// Generador pseudoaleatorio con semilla: siempre carga los mismos datos.
let semilla = 20261021;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const entre = (min: number, max: number) => Math.round((min + azar() * (max - min)) / 100) * 100;
const elegir = <T,>(lista: T[]) => lista[Math.floor(azar() * lista.length)];
const desplazarDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

type Mov = {
  tipo: "ingreso" | "egreso";
  categoria: string;
  monto: number;
  fecha: string;
  descripcion: string;
  contraparte?: string;
  medio_pago: string;
  evento?: string;
};

const EVENTOS = [
  { nombre: "Vino al Festival 2026", fecha: "2026-08-22", lugar: "Hipódromo de Palermo, CABA", estado: "cerrado", presupuesto: 14_000_000, escala: 3 },
  { nombre: "Vino a la Nave", fecha: "2026-10-03", lugar: "La Nave, Barracas", estado: "cerrado", presupuesto: 6_500_000, escala: 1.4 },
  { nombre: "Isidris Sunset", fecha: "2026-11-14", lugar: "Terraza del Río, San Isidro", estado: "planificado", presupuesto: 5_000_000, escala: 1 },
] as const;

const BODEGAS = ["Bodega Catena Zapata", "Familia Zuccardi", "Bodega Norton", "Bodega El Esteco", "Trapiche", "Bodega Salentein"];

function movimientosDeEvento(ev: (typeof EVENTOS)[number]): Mov[] {
  const e = ev.escala;
  const antes = (dias: number) => desplazarDias(ev.fecha, -dias);
  const movs: Mov[] = [];
  const egreso = (categoria: string, descripcion: string, contraparte: string, min: number, max: number, dias: number, medio = "transferencia") =>
    movs.push({ tipo: "egreso", categoria, descripcion, contraparte, monto: entre(min * e, max * e), fecha: antes(dias), medio_pago: medio, evento: ev.nombre });
  const ingreso = (categoria: string, descripcion: string, contraparte: string, min: number, max: number, dias: number, medio = "mercado_pago") =>
    movs.push({ tipo: "ingreso", categoria, descripcion, contraparte, monto: entre(min * e, max * e), fecha: antes(dias), medio_pago: medio, evento: ev.nombre });

  // Entradas (incluyen copa de degustación) en tandas.
  for (const [dias, tanda] of [[45, "Early bird"], [30, "Preventa 1"], [18, "Preventa 2"], [7, "Preventa 3"], [1, "Venta general"]] as const) {
    ingreso("Venta de entradas", `Entradas ${tanda} (con copa)`, "Passline", 550_000, 950_000, dias, "transferencia");
  }
  ingreso("Venta de entradas", "Venta en puerta", "Caja puerta", 250_000, 450_000, 0, "efectivo");

  // Bodegas: pagan stand y algunas sponsorean.
  const bodegas = BODEGAS.slice(0, Math.max(3, Math.round(2 * e)));
  for (const [i, bodega] of bodegas.entries()) {
    ingreso("Otros ingresos", "Stand de degustación", bodega, 180_000, 260_000, 40 - i * 3, "transferencia");
  }
  ingreso("Sponsors", "Sponsor principal", bodegas[0], 700_000, 1_000_000, 35, "transferencia");

  ingreso("Barra", "Venta de copas y botellas", "Caja barra", 600_000, 900_000, 0, "efectivo");
  ingreso("Barra", "Venta de copas y botellas – QR", "Mercado Pago", 500_000, 800_000, 0);
  ingreso("Barra", "Food trucks – canon por puesto", "Food trucks", 150_000, 250_000, 0, "efectivo");

  egreso("Alquiler de lugar", "Alquiler del predio", ev.lugar, 700_000, 950_000, 40);
  egreso("Vinos y bebidas", "Compra de vinos para barra", elegir(BODEGAS), 600_000, 900_000, 10);
  egreso("Vinos y bebidas", "Agua, hielo y gaseosas", "Distribuidora del Sur", 90_000, 150_000, 2);
  egreso("Otros gastos", "Alquiler de copas de cristal", "Cristalería Eventos", 180_000, 260_000, 3);
  egreso("Publicidad y difusión", "Campaña Instagram y Meta Ads", "Meta Platforms", 180_000, 280_000, 30, "tarjeta");
  egreso("Publicidad y difusión", "Influencers de vino", "Varios", 120_000, 200_000, 20);
  egreso("Artistas y cachets", "DJ set", elegir(["DJ Sol Ortega", "DJ Nico Martín", "Dúo Malbec Beats"]), 250_000, 400_000, 12);
  egreso("Sonido e iluminación", "Sonido y luces", "Audio Pro Rental", 400_000, 600_000, 1);
  egreso("Personal", "Sommeliers y barra", "Varios", 350_000, 500_000, 0, "efectivo");
  egreso("Seguridad", "Seguridad y control de acceso", "Seguridad Total SRL", 220_000, 320_000, 0);
  egreso("Catering", "Tablas de quesos y fiambres", "Almacén de Campo", 150_000, 250_000, 0);
  egreso("Transporte y logística", "Fletes y armado", "Fletes Rápido", 100_000, 160_000, 1);
  egreso("Impuestos y tasas", "SADAIC y permisos municipales", "SADAIC", 100_000, 180_000, -10);
  return movs;
}

function gastosGenerales(): Mov[] {
  const movs: Mov[] = [];
  for (const mes of ["2026-07", "2026-08", "2026-09", "2026-10"]) {
    const g = (categoria: string, descripcion: string, contraparte: string, monto: number, dia: string, medio = "transferencia") =>
      movs.push({ tipo: "egreso", categoria, descripcion, contraparte, monto, fecha: `${mes}-${dia}`, medio_pago: medio });
    g("Gastos administrativos", "Alquiler oficina", "Inmobiliaria Belgrano", 450_000, "05");
    g("Gastos administrativos", "Honorarios contador", "Estudio Contable Ruiz", 180_000, "10");
    g("Gastos administrativos", "Internet y telefonía", "Telecentro", 38_000 + entre(0, 4_000), "12", "tarjeta");
    g("Gastos administrativos", "Suscripciones software (Google, Canva)", "Varios", 52_000 + entre(0, 6_000), "15", "tarjeta");
    g("Personal", "Sueldo administración", "Lucía Fernández", 950_000, "01");
    g("Impuestos y tasas", "Monotributo / IIBB", "ARCA", 210_000 + entre(0, 40_000), "20");
    if (mes !== "2026-10") g("Otros gastos", "Mantenimiento de equipos y heladeras", "Servicio Técnico Frío", entre(60_000, 150_000), "25", "efectivo");
  }
  movs.push({ tipo: "ingreso", categoria: "Otros ingresos", descripcion: "Alquiler de equipos propios a terceros", contraparte: "Productora Sur", monto: 280_000, fecha: "2026-08-22", medio_pago: "transferencia" });
  movs.push({ tipo: "ingreso", categoria: "Servicios de producción", descripcion: "Asesoría técnica evento corporativo", contraparte: "Banco Ciudad", monto: 650_000, fecha: "2026-10-03", medio_pago: "transferencia" });
  return movs;
}

async function cargar() {
  const { data: existentes } = await supabase.from("eventos").select("id").eq("notas", MARCA).limit(1);
  if (existentes?.length) {
    console.log("Ya hay datos de prueba cargados. Corré `npm run mock:borrar` primero.");
    return;
  }

  const { data: categorias, error: errorCat } = await supabase.from("categorias").select("id, nombre, tipo");
  if (errorCat || !categorias) throw new Error(errorCat?.message ?? "Sin categorías");
  const idCategoria = (nombre: string, tipo: string) => {
    const c = categorias.find((x) => x.nombre === nombre && x.tipo === tipo);
    if (!c) throw new Error(`Falta la categoría ${nombre} (${tipo})`);
    return c.id;
  };

  const { data: eventos, error: errorEv } = await supabase
    .from("eventos")
    .insert(EVENTOS.map(({ nombre, fecha, lugar, estado, presupuesto }) => ({ nombre, fecha, lugar, estado, presupuesto, notas: MARCA })))
    .select("id, nombre");
  if (errorEv || !eventos) throw new Error(errorEv?.message ?? "No se crearon eventos");
  const idEvento = (nombre: string) => eventos.find((e) => e.nombre === nombre)!.id;

  // Solo hasta hoy: lo que todavía no pasó no tiene movimientos.
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const movimientos = [...EVENTOS.flatMap(movimientosDeEvento), ...gastosGenerales()].filter((m) => m.fecha <= hoy);
  const filas = movimientos.map((m) => ({
    tipo: m.tipo,
    monto: m.monto,
    fecha: m.fecha,
    descripcion: m.descripcion,
    contraparte: m.contraparte ?? null,
    medio_pago: m.medio_pago,
    categoria_id: idCategoria(m.categoria, m.tipo),
    evento_id: m.evento ? idEvento(m.evento) : null,
    notas: MARCA,
  }));

  const { error } = await supabase.from("transacciones").insert(filas);
  if (error) throw new Error(error.message);
  console.log(`Cargados: ${eventos.length} eventos y ${filas.length} movimientos de prueba.`);
}

const accion = process.argv[2] === "borrar" ? borrar : cargar;
accion().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
