"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { parsearMonto } from "@/lib/formato";
import { listarProductos, obtenerStock } from "./consultas";
import { UNIDADES, costoDeSalida, r3 } from "./tipos";

export type EstadoStock = { error?: string; ok?: string; valores?: Record<string, string> };

const valoresDe = (formData: FormData) =>
  Object.fromEntries(
    [...formData.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$")),
  ) as Record<string, string>;

/** Cantidades: admite "1.5", "1,5" y miles con punto ("1.000"). */
function parsearCantidad(texto: string) {
  const limpio = texto.trim();
  if (!limpio) return null;
  const valor = /^\d+(\.\d{1,3})?$/.test(limpio) ? Number(limpio) : parsearMonto(limpio);
  return valor === null || !Number.isFinite(valor) ? null : valor;
}

async function stockDisponible(productoId: string, depositoId: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("stock_actual")
    .select("cantidad")
    .eq("producto_id", productoId)
    .eq("deposito_id", depositoId)
    .maybeSingle();
  return Number(data?.cantidad ?? 0);
}

const esquemaMovimiento = z.object({
  tipo: z.enum(["entrada", "salida", "ajuste", "transferencia"], "Elegí el tipo de movimiento"),
  producto_id: z.uuid("Elegí un producto"),
  deposito_id: z.uuid("Elegí el depósito"),
  deposito_destino_id: z.union([z.uuid(), z.literal("")]).optional(),
  cantidad: z.string(),
  costo_unitario: z.string().optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  evento_id: z.union([z.uuid(), z.literal("")]).optional(),
  motivo: z.string().trim().max(200).optional(),
});

export async function registrarMovimiento(_previo: EstadoStock, formData: FormData): Promise<EstadoStock> {
  await exigirPermiso("stock", "editar");
  const valores = valoresDe(formData);
  const datos = esquemaMovimiento.safeParse(valores);
  if (!datos.success) return { error: datos.error.issues[0].message, valores };
  const d = datos.data;

  const cantidad = parsearCantidad(d.cantidad);
  if (cantidad === null || cantidad < 0 || (d.tipo !== "ajuste" && cantidad === 0)) {
    return { error: "Cantidad inválida", valores };
  }
  const costo = d.costo_unitario?.trim() ? parsearMonto(d.costo_unitario) : null;
  if (d.costo_unitario?.trim() && costo === null) return { error: "Costo inválido", valores };

  const disponible = await stockDisponible(d.producto_id, d.deposito_id);
  const base = {
    producto_id: d.producto_id,
    fecha: d.fecha,
    motivo: d.motivo || null,
    evento_id: d.evento_id || null,
  };

  let filas: Record<string, unknown>[];
  if (d.tipo === "entrada") {
    filas = [{ ...base, deposito_id: d.deposito_id, tipo: "entrada", cantidad, costo_unitario: costo }];
  } else if (d.tipo === "salida") {
    if (cantidad > disponible) {
      return { error: `No alcanza el stock: hay ${disponible} en ese depósito`, valores };
    }
    filas = [{ ...base, deposito_id: d.deposito_id, tipo: "salida", cantidad: -cantidad }];
  } else if (d.tipo === "ajuste") {
    // Se ingresa lo que se contó físicamente; se registra la diferencia.
    const diferencia = Math.round((cantidad - disponible) * 1000) / 1000;
    if (diferencia === 0) return { error: "El stock contado coincide con el del sistema: no hay nada que ajustar", valores };
    filas = [
      {
        ...base,
        deposito_id: d.deposito_id,
        tipo: "ajuste",
        cantidad: diferencia,
        // Lo que se suma entra con su costo (si se cargó).
        costo_unitario: diferencia > 0 ? costo : null,
        motivo: d.motivo || `Inventario: se contaron ${cantidad} (el sistema tenía ${disponible})`,
      },
    ];
  } else {
    if (!d.deposito_destino_id) return { error: "Elegí el depósito de destino", valores };
    if (d.deposito_destino_id === d.deposito_id) return { error: "El origen y el destino son el mismo depósito", valores };
    if (cantidad > disponible) {
      return { error: `No alcanza el stock: hay ${disponible} en el depósito de origen`, valores };
    }
    const transferencia_id = randomUUID();
    const motivo = d.motivo || "Transferencia entre depósitos";
    filas = [
      { ...base, motivo, transferencia_id, deposito_id: d.deposito_id, tipo: "salida", cantidad: -cantidad },
      { ...base, motivo, transferencia_id, deposito_id: d.deposito_destino_id, tipo: "entrada", cantidad },
    ];
  }

  // Un solo insert: en una transferencia se graban las dos patas o ninguna.
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("movimientos_stock").insert(filas).select("id");
  if (error || !data?.length) return { error: "No se pudo registrar el movimiento", valores };

  refresh();
  return { ok: "Movimiento registrado" };
}

const esquemaSalida = z.object({
  deposito_id: z.uuid("Elegí el depósito"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Falta la fecha"),
  evento_id: z.union([z.uuid(), z.literal("")]).optional(),
  modo: z.enum(["conteo", "cantidad"]),
  motivo: z.string().trim().max(200).optional(),
  lineas: z.array(z.object({ producto_id: z.uuid(), valor: z.number().min(0, "No puede haber cantidades negativas").max(1e9) })).max(2000),
});
export type DatosSalida = z.input<typeof esquemaSalida>;

/**
 * Salida de varios productos juntos. En modo conteo cada valor es lo que quedó:
 * sale la diferencia con lo que había en el depósito. Cada producto lleva el
 * costo promedio del momento, así queda el costo total de la salida.
 */
export async function registrarSalida(datos: DatosSalida): Promise<{ error?: string; id?: string }> {
  await exigirPermiso("stock", "editar");
  const r = esquemaSalida.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0].message };
  const d = r.data;

  const stock = new Map((await obtenerStock()).map((f) => [f.producto.id, f]));
  const errores: string[] = [];
  const lineas: { producto_id: string; cantidad: number; costo_unitario: number | null; stock_inicial: number | null; stock_contado: number | null }[] = [];
  for (const l of d.lineas) {
    const fila = stock.get(l.producto_id);
    if (!fila) {
      errores.push("Hay un producto que no existe o está desactivado");
      continue;
    }
    const hay = r3(fila.porDeposito[d.deposito_id] ?? 0);
    const cantidad = d.modo === "conteo" ? r3(hay - l.valor) : r3(l.valor);
    if (d.modo === "conteo" && l.valor > hay) {
      errores.push(`${fila.producto.nombre}: contaste ${l.valor} y había ${hay} (si sobra, hacé un ajuste de inventario)`);
      continue;
    }
    if (d.modo === "cantidad" && cantidad > hay) {
      errores.push(`${fila.producto.nombre}: salen ${cantidad} y hay ${hay}`);
      continue;
    }
    if (cantidad <= 0) continue;
    lineas.push({
      producto_id: l.producto_id,
      cantidad,
      costo_unitario: costoDeSalida(fila, d.deposito_id),
      stock_inicial: d.modo === "conteo" ? hay : null,
      stock_contado: d.modo === "conteo" ? r3(l.valor) : null,
    });
  }
  if (errores.length) return { error: errores.slice(0, 5).join(" · ") + (errores.length > 5 ? ` · y ${errores.length - 5} más` : "") };
  if (!lineas.length) return { error: d.modo === "conteo" ? "Lo contado coincide con lo que había: no salió nada" : "Cargá al menos un producto" };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("registrar_salida_stock", {
    p_salida: { fecha: d.fecha, deposito_id: d.deposito_id, evento_id: d.evento_id ?? "", modo: d.modo, motivo: d.motivo ?? "" },
    p_lineas: lineas,
  });
  if (error) return { error: "No se pudo registrar la salida" };
  refresh();
  return { id: data as string };
}

const esquemaEntrada = z.object({
  deposito_id: z.uuid("Elegí el depósito"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Falta la fecha"),
  evento_id: z.union([z.uuid(), z.literal("")]).optional(),
  motivo: z.string().trim().max(200).optional(),
  lineas: z
    .array(
      z.object({
        producto_id: z.uuid(),
        cantidad: z.number().positive("Las cantidades tienen que ser mayores a cero").max(1e9),
        costo_unitario: z.number().min(0, "El costo no puede ser negativo").max(1e12).nullable(),
      }),
    )
    .max(2000),
});
export type DatosEntrada = z.input<typeof esquemaEntrada>;

/** Entrada de varios productos juntos (ej.: llega la mercadería de un proveedor), cada uno con su costo. */
export async function registrarEntrada(datos: DatosEntrada): Promise<{ error?: string; id?: string }> {
  await exigirPermiso("stock", "editar");
  const r = esquemaEntrada.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0].message };
  const d = r.data;
  if (!d.lineas.length) return { error: "Cargá al menos un producto" };
  if (new Set(d.lineas.map((l) => l.producto_id)).size !== d.lineas.length) return { error: "Hay un producto repetido" };

  const activos = new Set((await listarProductos()).map((p) => p.id));
  if (d.lineas.some((l) => !activos.has(l.producto_id))) return { error: "Hay un producto que no existe o está desactivado" };

  const lineas = d.lineas.map((l) => ({
    producto_id: l.producto_id,
    cantidad: r3(l.cantidad),
    costo_unitario: l.costo_unitario === null ? null : Math.round(l.costo_unitario * 100) / 100,
  }));
  if (lineas.some((l) => l.cantidad <= 0)) return { error: "Hay una cantidad demasiado chica" };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("registrar_entrada_stock", {
    p_entrada: { fecha: d.fecha, deposito_id: d.deposito_id, evento_id: d.evento_id ?? "", motivo: d.motivo ?? "" },
    p_lineas: lineas,
  });
  if (error) return { error: "No se pudo registrar la entrada" };
  refresh();
  return { id: data as string };
}

const esquemaProducto = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre").max(120),
  unidad: z.enum(UNIDADES, "Unidad inválida"),
  codigo: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((v) => v || null),
  stock_minimo: z.string().optional(),
});

export async function guardarProducto(
  id: string | null,
  _previo: EstadoStock,
  formData: FormData,
): Promise<EstadoStock> {
  await exigirPermiso("stock", "editar");
  const valores = valoresDe(formData);
  const datos = esquemaProducto.safeParse(valores);
  if (!datos.success) return { error: datos.error.issues[0].message, valores };

  const minimo = datos.data.stock_minimo?.trim() ? parsearCantidad(datos.data.stock_minimo) : 0;
  if (minimo === null || minimo < 0) return { error: "Stock mínimo inválido", valores };

  const fila = { ...datos.data, stock_minimo: minimo };
  const supabase = await crearClienteServidor();
  const { data, error } = id
    ? await supabase.from("productos").update(fila).eq("id", id).select("id")
    : await supabase.from("productos").insert(fila).select("id");
  if (error || !data?.length) {
    return {
      error: error?.code === "23505" ? "Ya existe un producto con ese nombre o código" : "No se pudo guardar el producto",
      valores,
    };
  }
  refresh();
  return { ok: id ? "Producto actualizado" : "Producto creado" };
}

export async function cambiarEstadoProducto(id: string, activo: boolean): Promise<EstadoStock> {
  await exigirPermiso("stock", "editar");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("productos").update({ activo }).eq("id", id).select("id");
  if (!data?.length) return { error: "No se pudo actualizar el producto" };
  refresh();
  return {};
}

const esquemaDeposito = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre").max(60),
  direccion: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null),
});

export async function crearDeposito(_previo: EstadoStock, formData: FormData): Promise<EstadoStock> {
  await exigirPermiso("stock", "editar");
  const datos = esquemaDeposito.safeParse(valoresDe(formData));
  if (!datos.success) return { error: datos.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("depositos").insert(datos.data).select("id");
  if (error || !data?.length) {
    return { error: error?.code === "23505" ? "Ya existe un depósito con ese nombre" : "No se pudo crear el depósito" };
  }
  refresh();
  return { ok: "Depósito creado" };
}

export async function cambiarEstadoDeposito(id: string, activo: boolean): Promise<EstadoStock> {
  await exigirPermiso("stock", "editar");
  if (!activo && (await tieneStock(id))) {
    return { error: "El depósito todavía tiene mercadería: transferila antes de desactivarlo" };
  }
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("depositos").update({ activo }).eq("id", id).select("id");
  if (!data?.length) return { error: "No se pudo actualizar el depósito" };
  refresh();
  return {};
}

async function tieneStock(depositoId: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("stock_actual").select("cantidad").eq("deposito_id", depositoId).neq("cantidad", 0).limit(1);
  return !!data?.length;
}

/**
 * Elimina movimientos de stock ya hechos: el stock queda como si no se hubieran hecho.
 * - "movimiento": uno suelto o un producto de una entrada / salida (una transferencia se borra entera).
 * - "entrada" / "salida": la entrada o salida de varios productos completa.
 * La base no deja borrar si algún producto quedaría con stock negativo. Queda en la auditoría.
 */
export async function eliminarMovimientoStock(que: "movimiento" | "entrada" | "salida", id: string): Promise<{ error?: string }> {
  await exigirPermiso("stock", "editar");
  if (!z.uuid().safeParse(id).success) return { error: "Movimiento inválido" };
  const funcion = { movimiento: "eliminar_movimiento_stock", entrada: "eliminar_entrada_stock", salida: "eliminar_salida_stock" }[que];
  if (!funcion) return { error: "Movimiento inválido" };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc(funcion, { p_id: id });
  // P0001: los avisos de la base (stock negativo, ya eliminado, sin permiso) se muestran tal cual.
  if (error) return { error: error.code === "P0001" ? error.message : "No se pudo eliminar" };
  refresh();
  return {};
}
