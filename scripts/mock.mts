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
  { nombre: "Noche de Rock en Niceto", fecha: "2026-07-12", lugar: "Niceto Club, CABA", estado: "cerrado", presupuesto: 3_000_000, escala: 1 },
  { nombre: "Festival Electrónica Costanera", fecha: "2026-08-15", lugar: "Costanera Sur, CABA", estado: "cerrado", presupuesto: 12_000_000, escala: 4 },
  { nombre: "Lanzamiento Cerveza Andes Lager", fecha: "2026-09-05", lugar: "Palermo Hollywood", estado: "cerrado", presupuesto: 2_200_000, escala: 0.8, corporativo: true },
  { nombre: "Fiesta Nero Primavera", fecha: "2026-09-20", lugar: "Crobar, CABA", estado: "cerrado", presupuesto: 4_500_000, escala: 1.5 },
  { nombre: "Casamiento Pérez – Gómez", fecha: "2026-10-10", lugar: "Estancia La Candelaria, Lobos", estado: "cerrado", presupuesto: 2_500_000, escala: 0.9, corporativo: true },
  { nombre: "Halloween Nero", fecha: "2026-10-31", lugar: "Groove, CABA", estado: "en_curso", presupuesto: 6_000_000, escala: 2 },
  { nombre: "Fin de Año Nero 2026", fecha: "2026-12-31", lugar: "Club Ribera Norte, Vicente López", estado: "planificado", presupuesto: 15_000_000, escala: 5 },
] as const;

function movimientosDeEvento(ev: (typeof EVENTOS)[number]): Mov[] {
  const e = ev.escala;
  const antes = (dias: number) => desplazarDias(ev.fecha, -dias);
  const futuro = ev.estado === "planificado";
  const movs: Mov[] = [];
  const egreso = (categoria: string, descripcion: string, contraparte: string, min: number, max: number, dias: number, medio = "transferencia") =>
    movs.push({ tipo: "egreso", categoria, descripcion, contraparte, monto: entre(min * e, max * e), fecha: antes(dias), medio_pago: medio, evento: ev.nombre });
  const ingreso = (categoria: string, descripcion: string, contraparte: string, min: number, max: number, dias: number, medio = "mercado_pago") =>
    movs.push({ tipo: "ingreso", categoria, descripcion, contraparte, monto: entre(min * e, max * e), fecha: antes(dias), medio_pago: medio, evento: ev.nombre });

  if ("corporativo" in ev && ev.corporativo) {
    ingreso("Servicios de producción", "Anticipo 50% producción integral", ev.nombre.includes("Cerveza") ? "Cervecería Andes S.A." : "Familia Pérez", 1_300_000, 1_500_000, 30, "transferencia");
    if (!futuro) ingreso("Servicios de producción", "Saldo 50% producción integral", ev.nombre.includes("Cerveza") ? "Cervecería Andes S.A." : "Familia Pérez", 1_300_000, 1_500_000, -3, "transferencia");
    egreso("Sonido e iluminación", "Equipo de sonido y luces", "Audio Pro Rental", 450_000, 600_000, 2);
    egreso("Catering", "Catering y bebidas", "Sabores del Plata", 500_000, 750_000, 1);
    egreso("Personal", "Staff de producción (6 personas)", "Varios", 240_000, 320_000, 0, "efectivo");
    egreso("Alquiler de lugar", "Seña del salón", ev.lugar, 300_000, 400_000, 25);
    return movs;
  }

  // Preventa de entradas en tandas.
  for (const [dias, tanda] of [[40, "Preventa 1"], [25, "Preventa 2"], [10, "Preventa 3"], [1, "Venta general"]] as const) {
    ingreso("Venta de entradas", `Entradas ${tanda}`, "Passline", 600_000, 1_100_000, dias, "transferencia");
  }
  if (!futuro) {
    ingreso("Barra", "Recaudación barra", "Caja barra", 700_000, 1_200_000, 0, "efectivo");
    ingreso("Barra", "Barra – pagos con QR", "Mercado Pago", 400_000, 700_000, 0);
  }
  if (e >= 1.5) ingreso("Sponsors", "Sponsoreo principal", elegir(["Fernet Branca", "Red Bull Argentina", "Quilmes"]), 800_000, 1_200_000, 35, "transferencia");

  egreso("Alquiler de lugar", "Alquiler del venue", ev.lugar, 500_000, 700_000, 30);
  egreso("Artistas y cachets", "Cachet headliner", elegir(["DJ Nicolás Martín", "Banda Los Reyes del Bajo", "DJ Sol Ortega"]), 700_000, 1_000_000, 14);
  egreso("Artistas y cachets", "Cachet artistas soporte", "Varios artistas", 200_000, 350_000, 7);
  egreso("Publicidad y difusión", "Campaña Instagram y Meta Ads", "Meta Platforms", 150_000, 250_000, 30, "tarjeta");
  egreso("Publicidad y difusión", "Flyers y cartelería", "Imprenta Rápida", 40_000, 80_000, 20);
  if (!futuro) {
    egreso("Sonido e iluminación", "Sonido, luces y pantallas", "Audio Pro Rental", 600_000, 900_000, 1);
    egreso("Seguridad", "Seguridad y control de acceso", "Seguridad Total SRL", 250_000, 400_000, 0);
    egreso("Personal", "Barra y staff de la noche", "Varios", 300_000, 450_000, 0, "efectivo");
    egreso("Catering", "Catering camarines", "Sabores del Plata", 60_000, 120_000, 0);
    egreso("Transporte y logística", "Fletes y traslado de equipos", "Fletes Rápido", 80_000, 140_000, 1);
    egreso("Impuestos y tasas", "SADAIC y AADI-CAPIF", "SADAIC", 120_000, 200_000, -10);
  }
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
    if (mes !== "2026-10") g("Otros gastos", "Mantenimiento equipos propios", "Servicio Técnico Audio", entre(60_000, 150_000), "25", "efectivo");
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
