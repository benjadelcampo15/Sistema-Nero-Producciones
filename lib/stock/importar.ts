"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hoy, parsearMonto } from "@/lib/formato";
import { UNIDADES } from "./tipos";

/** Una fila del Excel tal como viene (texto o número), ya con la fecha en "YYYY-MM-DD" si tenía. */
export type FilaExcel = Record<string, string | number | null>;
export type ResultadoFila = { fila: number; ok: boolean; mensaje: string };
export type ResultadoImportacion = { resultados: ResultadoFila[]; aplicadas?: number; error?: string };

/** Igual que normalizar_nombre de la base: sin mayúsculas, acentos, la "x" suelta ni signos. */
const normalizar = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\bx\b/g, "")
    .replace(/[^a-z0-9]/g, "");

const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function numero(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = texto(v);
  if (!t) return null;
  return /^\d+(\.\d{1,3})?$/.test(t) ? Number(t) : parsearMonto(t);
}

function tipoDe(v: unknown) {
  const t = normalizar(texto(v));
  if (t.startsWith("entr") || t.startsWith("ingres") || t.startsWith("compra")) return "entrada";
  if (t.startsWith("sal") || t.startsWith("egres") || t.startsWith("consum")) return "salida";
  if (t.startsWith("aj") || t.startsWith("invent") || t.startsWith("conteo")) return "ajuste";
  if (t.startsWith("trans") || t.startsWith("pase") || t.startsWith("mov")) return "transferencia";
  return null;
}

/**
 * Movimientos de stock desde un Excel. Valida todas las filas en orden (como si
 * se hicieran una tras otra) y, si se pide aplicar y no hay errores, graba todo
 * junto: o entran todas o ninguna.
 */
export async function importarMovimientosStock(filas: FilaExcel[], aplicar: boolean): Promise<ResultadoImportacion> {
  await exigirPermiso("stock", "editar");
  if (!Array.isArray(filas) || !filas.length) return { resultados: [], error: "El Excel no tiene filas" };
  if (filas.length > 2000) return { resultados: [], error: "Máximo 2000 filas por archivo" };

  const supabase = await crearClienteServidor();
  const [{ data: productos }, { data: depositos }, { data: eventos }, { data: stock }] = await Promise.all([
    supabase.from("productos").select("id, nombre, codigo").eq("activo", true),
    supabase.from("depositos").select("id, nombre").eq("activo", true),
    supabase.from("eventos").select("id, nombre").neq("estado", "cancelado"),
    supabase.from("stock_actual").select("producto_id, deposito_id, cantidad"),
  ]);
  const porNombre = <T extends { nombre: string }>(lista: T[] | null) => new Map((lista ?? []).map((x) => [normalizar(x.nombre), x]));
  const productosPorNombre = porNombre(productos);
  const productosPorCodigo = new Map((productos ?? []).filter((p) => p.codigo).map((p) => [normalizar(p.codigo!), p]));
  const depositosPorNombre = porNombre(depositos);
  const eventosPorNombre = porNombre(eventos);
  // Stock que se va actualizando fila a fila.
  const actual = new Map((stock ?? []).map((s) => [`${s.producto_id}|${s.deposito_id}`, Number(s.cantidad)]));
  const cantidadEn = (p: string, d: string) => actual.get(`${p}|${d}`) ?? 0;

  const resultados: ResultadoFila[] = [];
  const nuevas: Record<string, unknown>[] = [];
  const fechaHoy = hoy();

  filas.forEach((f, i) => {
    const fila = i + 2; // la 1 es la de títulos
    const mal = (mensaje: string) => resultados.push({ fila, ok: false, mensaje });
    const tipo = tipoDe(f.tipo);
    if (!tipo) return mal(`Tipo "${texto(f.tipo)}" inválido: usá Entrada, Salida, Ajuste o Transferencia`);
    const nombreProducto = texto(f.producto);
    const producto = productosPorNombre.get(normalizar(nombreProducto)) ?? productosPorCodigo.get(normalizar(nombreProducto));
    if (!producto) return mal(`No existe el producto "${nombreProducto}" (cargalo antes en Productos)`);
    const deposito = depositosPorNombre.get(normalizar(texto(f.deposito)));
    if (!deposito) return mal(`No existe el depósito "${texto(f.deposito)}"`);
    const cantidad = numero(f.cantidad);
    if (cantidad === null || cantidad < 0 || (tipo !== "ajuste" && cantidad === 0)) return mal("Cantidad inválida");
    const costoTexto = texto(f.costo);
    const costo = costoTexto ? numero(f.costo) : null;
    if (costoTexto && (costo === null || costo < 0)) return mal("Costo unitario inválido");
    const fecha = texto(f.fecha) || fechaHoy;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return mal(`Fecha "${fecha}" inválida (usá dd/mm/aaaa)`);
    const nombreEvento = texto(f.evento);
    const evento = nombreEvento ? eventosPorNombre.get(normalizar(nombreEvento)) : null;
    if (nombreEvento && !evento) return mal(`No existe el evento "${nombreEvento}"`);
    const motivo = texto(f.motivo).slice(0, 200) || null;
    const base = { producto_id: producto.id, fecha, motivo, evento_id: evento?.id ?? null };
    const disponible = cantidadEn(producto.id, deposito.id);
    const clave = `${producto.id}|${deposito.id}`;

    if (tipo === "entrada") {
      nuevas.push({ ...base, deposito_id: deposito.id, tipo: "entrada", cantidad, costo_unitario: costo });
      actual.set(clave, r3(disponible + cantidad));
      return resultados.push({ fila, ok: true, mensaje: `Entrada de ${cantidad} ${producto.nombre} en ${deposito.nombre}` });
    }
    if (tipo === "salida") {
      if (cantidad > disponible) return mal(`No alcanza el stock de ${producto.nombre} en ${deposito.nombre}: hay ${disponible}`);
      nuevas.push({ ...base, deposito_id: deposito.id, tipo: "salida", cantidad: -cantidad });
      actual.set(clave, r3(disponible - cantidad));
      return resultados.push({ fila, ok: true, mensaje: `Salida de ${cantidad} ${producto.nombre} de ${deposito.nombre}` });
    }
    if (tipo === "ajuste") {
      // En el ajuste la cantidad es lo que se contó: se registra la diferencia.
      const diferencia = r3(cantidad - disponible);
      if (diferencia === 0) return resultados.push({ fila, ok: true, mensaje: `${producto.nombre} en ${deposito.nombre}: el conteo coincide, no hay ajuste` });
      nuevas.push({ ...base, deposito_id: deposito.id, tipo: "ajuste", cantidad: diferencia, motivo: motivo ?? `Inventario: se contaron ${cantidad} (el sistema tenía ${disponible})` });
      actual.set(clave, cantidad);
      return resultados.push({ fila, ok: true, mensaje: `Ajuste ${producto.nombre} en ${deposito.nombre}: ${disponible} → ${cantidad} (${diferencia > 0 ? "+" : ""}${diferencia})` });
    }
    const destino = depositosPorNombre.get(normalizar(texto(f.destino)));
    if (!destino) return mal(`Falta el depósito de destino o no existe ("${texto(f.destino)}")`);
    if (destino.id === deposito.id) return mal("El origen y el destino son el mismo depósito");
    if (cantidad > disponible) return mal(`No alcanza el stock de ${producto.nombre} en ${deposito.nombre}: hay ${disponible}`);
    const transferencia_id = randomUUID();
    const motivoTransferencia = motivo ?? "Transferencia entre depósitos";
    nuevas.push(
      { ...base, motivo: motivoTransferencia, transferencia_id, deposito_id: deposito.id, tipo: "salida", cantidad: -cantidad },
      { ...base, motivo: motivoTransferencia, transferencia_id, deposito_id: destino.id, tipo: "entrada", cantidad },
    );
    actual.set(clave, r3(disponible - cantidad));
    actual.set(`${producto.id}|${destino.id}`, r3(cantidadEn(producto.id, destino.id) + cantidad));
    return resultados.push({ fila, ok: true, mensaje: `Transferencia de ${cantidad} ${producto.nombre}: ${deposito.nombre} → ${destino.nombre}` });
  });

  const errores = resultados.filter((r) => !r.ok).length;
  if (!aplicar || errores) return { resultados, ...(aplicar && errores ? { error: "Hay filas con errores: no se importó nada" } : {}) };
  if (!nuevas.length) return { resultados, aplicadas: 0 };
  // Un solo insert: entran todos los movimientos o ninguno.
  const { error } = await supabase.from("movimientos_stock").insert(nuevas);
  if (error) return { resultados, error: "No se pudieron grabar los movimientos" };
  refresh();
  return { resultados, aplicadas: resultados.length };
}

/** Productos desde un Excel: crea los nuevos y actualiza los que ya existen (por nombre). */
export async function importarProductos(filas: FilaExcel[], aplicar: boolean): Promise<ResultadoImportacion> {
  await exigirPermiso("stock", "editar");
  if (!Array.isArray(filas) || !filas.length) return { resultados: [], error: "El Excel no tiene filas" };
  if (filas.length > 2000) return { resultados: [], error: "Máximo 2000 filas por archivo" };

  const supabase = await crearClienteServidor();
  const { data: existentes } = await supabase.from("productos").select("id, nombre");
  const porNombre = new Map((existentes ?? []).map((p) => [normalizar(p.nombre), p]));
  const vistos = new Set<string>();
  const resultados: ResultadoFila[] = [];
  const cambios: { id?: string; fila: Record<string, unknown> }[] = [];

  filas.forEach((f, i) => {
    const fila = i + 2;
    const mal = (mensaje: string) => resultados.push({ fila, ok: false, mensaje });
    const nombre = texto(f.nombre).slice(0, 120);
    if (!nombre) return mal("Falta el nombre");
    const clave = normalizar(nombre);
    if (vistos.has(clave)) return mal(`"${nombre}" está repetido en el Excel`);
    vistos.add(clave);
    const unidadTexto = normalizar(texto(f.unidad) || "unidad");
    const unidad = UNIDADES.find((u) => unidadTexto === u || unidadTexto === `${u}s` || unidadTexto === `${u}es`);
    if (!unidad) return mal(`Unidad "${texto(f.unidad)}" inválida: ${UNIDADES.join(", ")}`);
    const minimoTexto = texto(f.minimo);
    const minimo = minimoTexto ? numero(f.minimo) : null;
    if (minimoTexto && (minimo === null || minimo < 0)) return mal("Stock mínimo inválido");
    const codigo = texto(f.codigo).slice(0, 50) || null;
    const existente = porNombre.get(clave);
    const fila_ = { unidad, ...(codigo ? { codigo } : {}), ...(minimo !== null ? { stock_minimo: minimo } : {}) };
    cambios.push(existente ? { id: existente.id, fila: fila_ } : { fila: { nombre, ...fila_ } });
    resultados.push({ fila, ok: true, mensaje: existente ? `Se actualiza ${existente.nombre}` : `Producto nuevo: ${nombre}` });
  });

  const errores = resultados.filter((r) => !r.ok).length;
  if (!aplicar || errores) return { resultados, ...(aplicar && errores ? { error: "Hay filas con errores: no se importó nada" } : {}) };
  const nuevos = cambios.filter((c) => !c.id).map((c) => c.fila);
  if (nuevos.length) {
    const { error } = await supabase.from("productos").insert(nuevos);
    if (error) return { resultados, error: error.code === "23505" ? "Hay un código de producto repetido" : "No se pudieron crear los productos" };
  }
  for (const c of cambios.filter((c) => c.id)) {
    const { error } = await supabase.from("productos").update(c.fila).eq("id", c.id!);
    if (error) return { resultados, error: error.code === "23505" ? "Hay un código de producto repetido" : "No se pudieron actualizar los productos" };
  }
  refresh();
  return { resultados, aplicadas: cambios.length };
}
