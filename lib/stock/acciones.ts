"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { parsearMonto } from "@/lib/formato";
import { UNIDADES } from "./tipos";

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
