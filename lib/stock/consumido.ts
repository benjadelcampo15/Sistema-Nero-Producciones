import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { compararConsumo, type Fisico, type Producto, type Receta } from "./fudo";

export type Importacion = {
  id: string;
  empresa: "nero" | "ruta";
  evento_id: string;
  nombre_archivo: string;
  archivo: string | null;
  desde: string | null;
  hasta: string | null;
  version: number;
  estado: "vigente" | "reemplazada" | "anulada";
  reemplaza_a: string | null;
  lineas: number;
  unidades: number;
  monto: number;
  ranking_unidades: number | null;
  ranking_monto: number | null;
  descartadas: number;
  nota: string | null;
  creado_por: string | null;
  creado_en: string;
  estado_en: string | null;
};
export type LineaGuardada = { importacion_id: string; fecha: string | null; categoria: string | null; subcategoria: string | null; producto: string; clave: string; cantidad: number; monto: number };

const num = (v: unknown) => Number(v ?? 0);
const CAMPOS_IMPORTACION =
  "id, empresa, evento_id, nombre_archivo, archivo, desde, hasta, version, estado, reemplaza_a, lineas, unidades, monto, ranking_unidades, ranking_monto, descartadas, nota, creado_por, creado_en, estado_en";

function normalizarImportacion(i: Record<string, unknown>): Importacion {
  return {
    ...(i as unknown as Importacion),
    unidades: num(i.unidades),
    monto: num(i.monto),
    ranking_unidades: i.ranking_unidades === null ? null : num(i.ranking_unidades),
    ranking_monto: i.ranking_monto === null ? null : num(i.ranking_monto),
  };
}

/** Recetas (qué consume cada producto de FUDO) de una empresa. */
export async function recetasEmpresa(empresa: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("fudo_productos")
    .select("id, clave, nombre, categoria, tipo, nota, actualizado_en, fudo_receta_items(id, producto_id, cantidad, detalle)")
    .eq("empresa", empresa)
    .order("nombre");
  type Fila = { id: string; clave: string; nombre: string; categoria: string | null; tipo: "receta" | "ignorar"; nota: string | null; actualizado_en: string; fudo_receta_items: { id: string; producto_id: string; cantidad: number; detalle: string | null }[] };
  return ((data ?? []) as Fila[]).map((r) => ({ ...r, items: r.fudo_receta_items.map((i) => ({ ...i, cantidad: num(i.cantidad) })) }));
}
export type RecetaGuardada = Awaited<ReturnType<typeof recetasEmpresa>>[number];

export async function productosStock(): Promise<Producto[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("productos").select("id, nombre, unidad").eq("activo", true).order("nombre");
  return (data ?? []) as Producto[];
}

async function tolerancia(empresa: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("fudo_config").select("tolerancia_unid, tolerancia_pct").eq("empresa", empresa).maybeSingle();
  return { unidades: num(data?.tolerancia_unid), pct: num(data?.tolerancia_pct) };
}

const aFisico = (f: Record<string, unknown>): Fisico & { nota: string | null; actualizado_en: string } => ({
  producto_id: f.producto_id as string,
  inicial: num(f.inicial),
  reposiciones: num(f.reposiciones),
  final: num(f.final),
  mermas: num(f.mermas),
  roturas: num(f.roturas),
  invitaciones: num(f.invitaciones),
  corregido: f.corregido === null ? null : num(f.corregido),
  motivo: (f.motivo as string | null) ?? null,
  nota: (f.nota as string | null) ?? null,
  actualizado_en: f.actualizado_en as string,
});

/** Todo lo de un evento: importaciones (con su historial), ventas vigentes, recetas, conteo físico y la comparación. */
export async function consumidoEvento(eventoId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(eventoId)) return null;
  const supabase = await crearClienteServidor();
  const { data: evento } = await supabase.from("eventos").select("id, nombre, fecha, lugar, empresa, estado").eq("id", eventoId).maybeSingle();
  if (!evento) return null;
  const [{ data: importaciones }, { data: fisicos }, recetas, productos, tol, { data: salidas }] = await Promise.all([
    supabase.from("fudo_importaciones").select(CAMPOS_IMPORTACION).eq("evento_id", eventoId).order("creado_en", { ascending: false }),
    supabase.from("consumo_fisico").select("producto_id, inicial, reposiciones, final, mermas, roturas, invitaciones, corregido, motivo, nota, actualizado_en").eq("evento_id", eventoId),
    recetasEmpresa(evento.empresa),
    productosStock(),
    tolerancia(evento.empresa),
    // Lo que salió de los depósitos hacia el evento (para traer las reposiciones desde Stock).
    supabase.from("movimientos_stock").select("producto_id, cantidad").eq("evento_id", eventoId).eq("tipo", "salida"),
  ]);
  const lista = (importaciones ?? []).map(normalizarImportacion);
  const vigentes = lista.filter((i) => i.estado === "vigente").map((i) => i.id);
  const { data: lineas } = vigentes.length
    ? await supabase.from("fudo_lineas").select("importacion_id, fecha, categoria, subcategoria, producto, clave, cantidad, monto").in("importacion_id", vigentes).order("fecha")
    : { data: [] };
  const ventas = ((lineas ?? []) as LineaGuardada[]).map((l) => ({ ...l, cantidad: num(l.cantidad), monto: num(l.monto) }));
  const fis = (fisicos ?? []).map(aFisico);
  const recetasCalculo: Receta[] = recetas.map((r) => ({ clave: r.clave, nombre: r.nombre, tipo: r.tipo, items: r.items }));
  const comparacion = compararConsumo(ventas, recetasCalculo, fis, productos, tol);
  const salidasPorProducto = new Map<string, number>();
  for (const s of salidas ?? []) salidasPorProducto.set(s.producto_id, (salidasPorProducto.get(s.producto_id) ?? 0) + Math.abs(num(s.cantidad)));
  const usuarios = [...new Set(lista.map((i) => i.creado_por).filter(Boolean))] as string[];
  const nombres = await Promise.all(usuarios.map(async (id) => ({ id, nombre: ((await supabase.rpc("nombre_usuario", { p: id })).data as string | null) ?? "Alguien" })));
  return {
    evento: evento as { id: string; nombre: string; fecha: string; lugar: string | null; empresa: "nero" | "ruta"; estado: string },
    importaciones: lista,
    autores: Object.fromEntries((nombres ?? []).map((n) => [n.id, n.nombre])) as Record<string, string>,
    ventas,
    fisicos: fis,
    productos,
    recetas,
    tolerancia: tol,
    comparacion,
    salidas: Object.fromEntries(salidasPorProducto) as Record<string, number>,
  };
}
export type DatosConsumido = NonNullable<Awaited<ReturnType<typeof consumidoEvento>>>;

/** Panel: los eventos con reportes de FUDO (por empresa y fechas) con su estado de conciliación. */
export async function panelConsumido(filtros: { empresa?: string; desde?: string; hasta?: string; evento?: string }) {
  const supabase = await crearClienteServidor();
  let consulta = supabase.from("fudo_importaciones").select(CAMPOS_IMPORTACION).eq("estado", "vigente").order("creado_en", { ascending: false });
  if (filtros.empresa) consulta = consulta.eq("empresa", filtros.empresa);
  if (filtros.evento) consulta = consulta.eq("evento_id", filtros.evento);
  if (filtros.desde) consulta = consulta.gte("hasta", filtros.desde);
  if (filtros.hasta) consulta = consulta.lte("desde", filtros.hasta);
  const { data: importaciones } = await consulta;
  const lista = (importaciones ?? []).map(normalizarImportacion);
  const ids = [...new Set(lista.map((i) => i.evento_id))];
  const [{ data: eventos }, { data: lineas }, { data: fisicos }, productos, recetasNero, recetasRuta, tolNero, tolRuta] = await Promise.all([
    ids.length ? supabase.from("eventos").select("id, nombre, fecha, empresa").in("id", ids) : Promise.resolve({ data: [] }),
    lista.length ? supabase.from("fudo_lineas").select("importacion_id, producto, clave, cantidad, monto").in("importacion_id", lista.map((i) => i.id)) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("consumo_fisico").select("evento_id, producto_id, inicial, reposiciones, final, mermas, roturas, invitaciones, corregido, motivo, nota, actualizado_en").in("evento_id", ids) : Promise.resolve({ data: [] }),
    productosStock(),
    recetasEmpresa("nero"),
    recetasEmpresa("ruta"),
    tolerancia("nero"),
    tolerancia("ruta"),
  ]);
  const evento = new Map((eventos ?? []).map((e) => [e.id as string, e as { id: string; nombre: string; fecha: string; empresa: "nero" | "ruta" }]));
  const filas = ids
    .map((id) => {
      const e = evento.get(id);
      if (!e) return null;
      const imps = lista.filter((i) => i.evento_id === id);
      const propias = new Set(imps.map((i) => i.id));
      const ventas = ((lineas ?? []) as { importacion_id: string; producto: string; clave: string; cantidad: number; monto: number }[])
        .filter((l) => propias.has(l.importacion_id))
        .map((l) => ({ ...l, cantidad: num(l.cantidad), monto: num(l.monto) }));
      const recetas = (e.empresa === "ruta" ? recetasRuta : recetasNero).map((r) => ({ clave: r.clave, nombre: r.nombre, tipo: r.tipo, items: r.items }));
      const fis = ((fisicos ?? []) as Record<string, unknown>[]).filter((f) => f.evento_id === id).map(aFisico);
      const c = compararConsumo(ventas, recetas, fis, productos, e.empresa === "ruta" ? tolRuta : tolNero);
      return {
        evento: e,
        importaciones: imps.length,
        ultima: imps.map((i) => i.creado_en).sort().at(-1) ?? null,
        desde: imps.map((i) => i.desde).filter(Boolean).sort()[0] ?? null,
        hasta: imps.map((i) => i.hasta).filter(Boolean).sort().at(-1) ?? null,
        unidadesFudo: ventas.reduce((s, l) => s + l.cantidad, 0),
        montoFudo: ventas.reduce((s, l) => s + l.monto, 0),
        conciliados: c.filas.filter((f) => f.estado === "conciliado").length,
        conDiferencia: c.filas.filter((f) => f.estado === "diferencia").length,
        sinConteo: c.filas.filter((f) => f.estado === "sin_conteo").length,
        pendientes: c.pendientes.length,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.evento.fecha.localeCompare(a.evento.fecha));
  return { filas };
}

/** Eventos para importar (de las dos empresas, los más recientes primero). */
export async function eventosParaImportar() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("eventos").select("id, nombre, fecha, empresa").neq("estado", "cancelado").order("fecha", { ascending: false }).limit(300);
  return (data ?? []) as { id: string; nombre: string; fecha: string; empresa: "nero" | "ruta" }[];
}
