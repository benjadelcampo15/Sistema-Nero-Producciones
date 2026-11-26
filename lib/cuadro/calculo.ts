/**
 * Cuadro anual: todo se calcula desde los movimientos de Financiero de UNA
 * empresa, con el mismo criterio que Financiero (lo eliminado no cuenta; lo
 * sin fecha no entra a ningún mes ni al total del año). Funciones puras.
 */
import type { EstadoMovimiento } from "@/lib/financiero/tipos";

export type Mov = {
  id: string;
  tipo: "ingreso" | "egreso";
  monto: number;
  fecha: string | null;
  estado: EstadoMovimiento;
  descripcion: string;
  contraparte: string | null;
  categoria_id: string | null;
  categoria: string;
  evento_id: string | null;
  evento: string | null;
};

export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Suma en centavos (sin errores de coma flotante). */
const sumar = (ns: number[]) => Math.round(ns.reduce((s, n) => s + Math.round(n * 100), 0)) / 100;
const r2 = (n: number) => Math.round(n * 100) / 100;
const variacion = (actual: number, anterior: number) => (anterior ? (actual - anterior) / Math.abs(anterior) : null);

export type Filtro = { anio: number; estado: EstadoMovimiento | "todos"; categoria?: string; evento?: string; hoy: string };

export type Fila = { id: string; nombre: string; total: number; pct: number | null; cantidad: number; anterior: number | null; variacion: number | null; mensual: number[] };

function porCategoria(movs: Mov[], previos: Mov[] | null, conMensual: boolean): Fila[] {
  const total = sumar(movs.map((m) => m.monto));
  const grupos = new Map<string, Mov[]>();
  for (const m of movs) {
    const k = m.categoria_id ?? "sin";
    grupos.set(k, [...(grupos.get(k) ?? []), m]);
  }
  return [...grupos.entries()]
    .map(([id, lista]) => {
      const t = sumar(lista.map((m) => m.monto));
      const ant = previos ? sumar(previos.filter((m) => (m.categoria_id ?? "sin") === id).map((m) => m.monto)) : null;
      return {
        id,
        nombre: lista[0].categoria || "Sin categoría",
        total: t,
        pct: total ? t / total : null,
        cantidad: lista.length,
        anterior: ant,
        variacion: ant === null ? null : variacion(t, ant),
        mensual: conMensual ? Array.from({ length: 12 }, (_, i) => sumar(lista.filter((m) => Number(m.fecha!.slice(5, 7)) === i + 1).map((m) => m.monto))) : [],
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function calcularCuadro(todos: Mov[], f: Filtro) {
  const anio = String(f.anio);
  const anterior = String(f.anio - 1);
  // Filtros de categoría y evento (se aplican a todo; el estado, a lo que corresponde).
  const filtrados = todos.filter((m) => (!f.categoria || (m.categoria_id ?? "sin") === f.categoria) && (!f.evento || (f.evento === "sin" ? !m.evento_id : m.evento_id === f.evento)));
  const delAnio = filtrados.filter((m) => m.fecha?.startsWith(anio));
  const delAnterior = filtrados.filter((m) => m.fecha?.startsWith(anterior));
  const conEstado = (lista: Mov[]) => (f.estado === "todos" ? lista : lista.filter((m) => m.estado === f.estado));
  const tipo = (lista: Mov[], t: Mov["tipo"]) => lista.filter((m) => m.tipo === t);
  const total = (lista: Mov[]) => sumar(lista.map((m) => m.monto));

  // ── Resumen ejecutivo (real, pendiente y proyectado, cada uno por su lado) ──
  const reales = delAnio.filter((m) => m.estado === "real");
  const ingresosReal = total(tipo(reales, "ingreso"));
  const egresosReal = total(tipo(reales, "egreso"));
  const resultadoReal = r2(ingresosReal - egresosReal);
  const pendientes = delAnio.filter((m) => m.estado === "pendiente");
  const proyectados = delAnio.filter((m) => m.estado === "proyectado");

  // ── Meses (con el estado elegido) ──
  const elegidos = conEstado(delAnio);
  let acumulado = 0;
  const meses = MESES_CORTOS.map((nombre, i) => {
    const delMes = elegidos.filter((m) => Number(m.fecha!.slice(5, 7)) === i + 1);
    const ingresos = total(tipo(delMes, "ingreso"));
    const egresos = total(tipo(delMes, "egreso"));
    const resultado = r2(ingresos - egresos);
    acumulado = r2(acumulado + resultado);
    return { mes: i + 1, nombre, ingresos, egresos, resultado, acumulado, movimientos: delMes.length };
  });
  // Mejor y peor mes por resultado real (solo meses con movimientos reales).
  const mesesReales = MESES_CORTOS.map((_, i) => {
    const delMes = reales.filter((m) => Number(m.fecha!.slice(5, 7)) === i + 1);
    return { mes: i + 1, resultado: r2(total(tipo(delMes, "ingreso")) - total(tipo(delMes, "egreso"))), movimientos: delMes.length };
  }).filter((m) => m.movimientos > 0);
  const mejorMes = mesesReales.length ? mesesReales.reduce((a, b) => (b.resultado > a.resultado ? b : a)) : null;
  const peorMes = mesesReales.length ? mesesReales.reduce((a, b) => (b.resultado < a.resultado ? b : a)) : null;

  // ── Categorías (con el estado elegido; comparación con el año anterior completo) ──
  const previosEstado = conEstado(delAnterior);
  const hayAnterior = previosEstado.length > 0;
  const ingresosCategoria = porCategoria(tipo(elegidos, "ingreso"), hayAnterior ? tipo(previosEstado, "ingreso") : null, true);
  const egresosCategoria = porCategoria(tipo(elegidos, "egreso"), hayAnterior ? tipo(previosEstado, "egreso") : null, true);

  // ── Gastos sin fecha (no entran a ningún mes ni al total del año) ──
  const sinFecha = filtrados.filter((m) => m.tipo === "egreso" && !m.fecha);
  const sinFechaCategorias = porCategoria(sinFecha, null, false);

  // ── Pendientes por categoría ──
  const pendientesCobrar = porCategoria(tipo(pendientes, "ingreso"), null, false);
  const pendientesPagar = porCategoria(tipo(pendientes, "egreso"), null, false);

  // ── Proyectado vs real por mes ──
  const proyectadoVsReal = MESES_CORTOS.map((nombre, i) => {
    const mes = (lista: Mov[]) => lista.filter((m) => Number(m.fecha!.slice(5, 7)) === i + 1);
    return {
      nombre,
      realIngresos: total(tipo(mes(reales), "ingreso")),
      realEgresos: total(tipo(mes(reales), "egreso")),
      proyIngresos: total(tipo(mes(proyectados), "ingreso")),
      proyEgresos: total(tipo(mes(proyectados), "egreso")),
    };
  });

  // ── Proveedores (contraparte de los egresos) y eventos ──
  const proveedores = new Map<string, { nombre: string; total: number; cantidad: number }>();
  for (const m of tipo(elegidos, "egreso")) {
    if (!m.contraparte?.trim()) continue;
    const k = m.contraparte.trim().toLowerCase();
    const p = proveedores.get(k) ?? { nombre: m.contraparte.trim(), total: 0, cantidad: 0 };
    p.total = r2(p.total + m.monto);
    p.cantidad++;
    proveedores.set(k, p);
  }
  const sinProveedor = total(tipo(elegidos, "egreso").filter((m) => !m.contraparte?.trim()));
  const eventos = new Map<string, { id: string; nombre: string; ingresos: number; egresos: number }>();
  for (const m of elegidos) {
    if (!m.evento_id) continue;
    const e = eventos.get(m.evento_id) ?? { id: m.evento_id, nombre: m.evento ?? "Evento", ingresos: 0, egresos: 0 };
    if (m.tipo === "ingreso") e.ingresos = r2(e.ingresos + m.monto);
    else e.egresos = r2(e.egresos + m.monto);
    eventos.set(m.evento_id, e);
  }

  // ── Interanual: mismo período (si el año está en curso, hasta el mes actual) ──
  const enCurso = f.hoy.startsWith(anio);
  const hastaMes = enCurso ? Number(f.hoy.slice(5, 7)) : 12;
  const periodo = (lista: Mov[]) => lista.filter((m) => Number(m.fecha!.slice(5, 7)) <= hastaMes);
  const resumenDe = (lista: Mov[]) => {
    const ing = total(tipo(lista, "ingreso"));
    const egr = total(tipo(lista, "egreso"));
    return { ingresos: ing, egresos: egr, resultado: r2(ing - egr) };
  };
  const actualPeriodo = resumenDe(periodo(elegidos));
  const anteriorPeriodo = resumenDe(periodo(previosEstado));
  const interanual = hayAnterior
    ? {
        hastaMes,
        actual: actualPeriodo,
        anterior: anteriorPeriodo,
        variacion: {
          ingresos: variacion(actualPeriodo.ingresos, anteriorPeriodo.ingresos),
          egresos: variacion(actualPeriodo.egresos, anteriorPeriodo.egresos),
          resultado: variacion(actualPeriodo.resultado, anteriorPeriodo.resultado),
        },
      }
    : null;

  // Meses con más gasto y mayores subas de gasto respecto del mes anterior.
  const mesesMayorGasto = [...meses].filter((m) => m.egresos > 0).sort((a, b) => b.egresos - a.egresos).slice(0, 3);
  const subas = meses
    .slice(1)
    .map((m, i) => ({ nombre: m.nombre, mes: m.mes, diferencia: r2(m.egresos - meses[i].egresos), desde: meses[i].nombre }))
    .filter((x) => x.diferencia > 0)
    .sort((a, b) => b.diferencia - a.diferencia)
    .slice(0, 3);

  return {
    anio: f.anio,
    estado: f.estado,
    resumen: {
      ingresosReal,
      egresosReal,
      resultadoReal,
      margen: ingresosReal ? resultadoReal / ingresosReal : null,
      pendienteCobrar: total(tipo(pendientes, "ingreso")),
      pendientePagar: total(tipo(pendientes, "egreso")),
      proyectadoIngresos: total(tipo(proyectados, "ingreso")),
      proyectadoEgresos: total(tipo(proyectados, "egreso")),
      mejorMes,
      peorMes,
      movimientos: delAnio.length,
    },
    meses,
    totalesElegidos: resumenDe(elegidos),
    ingresosCategoria,
    egresosCategoria,
    sinFecha: { cantidad: sinFecha.length, total: total(sinFecha), categorias: sinFechaCategorias, lista: sinFecha },
    pendientesCobrar,
    pendientesPagar,
    proyectadoVsReal,
    proveedores: { lista: [...proveedores.values()].sort((a, b) => b.total - a.total).slice(0, 10), sinProveedor },
    eventos: [...eventos.values()].map((e) => ({ ...e, resultado: r2(e.ingresos - e.egresos) })).sort((a, b) => b.resultado - a.resultado),
    interanual,
    mesesMayorGasto,
    subas,
  };
}
export type Cuadro = ReturnType<typeof calcularCuadro>;
