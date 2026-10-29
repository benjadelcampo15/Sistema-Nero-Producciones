"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Falta la fecha");

const esquemaPedido = z.object({
  proveedor_id: z.uuid("Elegí el mayorista"),
  deposito_id: z.uuid("Elegí dónde se entrega"),
  fecha,
  fecha_entrega: z.union([fecha, z.literal("")]).optional(),
  estado: z.enum(["borrador", "enviado"]),
  notas: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({
        producto_id: z.uuid(),
        cantidad: z.number().positive("Las cantidades tienen que ser mayores a cero").max(1e9),
        precio_unitario: z.number().min(0).max(1e12).nullable(),
      }),
    )
    .min(1, "Agregá al menos un producto"),
});
export type DatosPedido = z.input<typeof esquemaPedido>;

export async function guardarPedido(id: string | null, datos: DatosPedido): Promise<{ error?: string; id?: string }> {
  await exigirPermiso("stock", "editar");
  const r = esquemaPedido.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0].message };
  const { items, ...pedido } = r.data;
  if (new Set(items.map((i) => i.producto_id)).size !== items.length) return { error: "Hay un producto repetido" };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("guardar_pedido", {
    p_id: id,
    p_pedido: { ...pedido, fecha_entrega: pedido.fecha_entrega ?? "", notas: pedido.notas ?? "" },
    p_items: items.map((i) => ({ ...i, precio_unitario: i.precio_unitario ?? "" })),
  });
  if (error) return { error: error.message.startsWith("El pedido") ? error.message : "No se pudo guardar el pedido" };

  // Lo pedido queda en el catálogo del mayorista (con el precio, si se cargó).
  const conPrecio = items.filter((i) => i.precio_unitario !== null);
  const sinPrecio = items.filter((i) => i.precio_unitario === null);
  await Promise.all([
    conPrecio.length &&
      supabase
        .from("proveedor_productos")
        .upsert(conPrecio.map((i) => ({ proveedor_id: pedido.proveedor_id, producto_id: i.producto_id, precio: i.precio_unitario, actualizado_en: new Date().toISOString() }))),
    sinPrecio.length &&
      supabase
        .from("proveedor_productos")
        .upsert(sinPrecio.map((i) => ({ proveedor_id: pedido.proveedor_id, producto_id: i.producto_id })), { ignoreDuplicates: true }),
  ]);
  refresh();
  return { id: data as string };
}

const esquemaCatalogo = z.array(z.object({ producto_id: z.uuid(), precio: z.number().min(0).max(1e12).nullable() })).max(5000);

/** Reemplaza el catálogo de un mayorista: los productos que se le pueden pedir y su precio. */
export async function guardarCatalogo(proveedorId: string, items: z.input<typeof esquemaCatalogo>): Promise<{ error?: string; ok?: string }> {
  await exigirPermiso("stock", "editar");
  const r = esquemaCatalogo.safeParse(items);
  if (!r.success || !/^[0-9a-f-]{36}$/i.test(proveedorId)) return { error: "Hay un precio inválido" };
  const supabase = await crearClienteServidor();
  const { data: actuales } = await supabase.from("proveedor_productos").select("producto_id").eq("proveedor_id", proveedorId);
  const quedan = new Set(r.data.map((i) => i.producto_id));
  const sacar = (actuales ?? []).map((a) => a.producto_id).filter((id) => !quedan.has(id));
  const [borrado, guardado] = await Promise.all([
    sacar.length ? supabase.from("proveedor_productos").delete().eq("proveedor_id", proveedorId).in("producto_id", sacar) : Promise.resolve({ error: null }),
    r.data.length
      ? supabase.from("proveedor_productos").upsert(r.data.map((i) => ({ proveedor_id: proveedorId, ...i, actualizado_en: new Date().toISOString() })))
      : Promise.resolve({ error: null }),
  ]);
  if (borrado.error || guardado.error) return { error: "No se pudo guardar el catálogo" };
  refresh();
  return { ok: `Catálogo guardado: ${r.data.length} ${r.data.length === 1 ? "producto" : "productos"}` };
}

const esquemaDatosMayorista = z.object({
  razon_social: z.string().trim().min(1, "Falta el nombre").max(200),
  contacto: z.string().trim().max(120).optional().transform((v) => v || null),
  telefono: z.string().trim().max(40).optional().transform((v) => v || null),
  email: z.union([z.email("Email inválido").trim(), z.literal("")]).optional().transform((v) => v || null),
});

export async function guardarDatosMayorista(id: string, datos: z.input<typeof esquemaDatosMayorista>): Promise<{ error?: string; ok?: string }> {
  await exigirPermiso("stock", "editar");
  const r = esquemaDatosMayorista.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("proveedores").update(r.data).eq("id", id).select("id");
  if (!data?.length) return { error: "No se pudieron guardar los datos" };
  refresh();
  return { ok: "Datos guardados" };
}

const esquemaRecepcion = z.object({
  fecha,
  items: z.array(z.object({ producto_id: z.uuid(), cantidad_recibida: z.number().min(0).max(1e9), costo_unitario: z.number().min(0).max(1e12).nullable() })).min(1),
});

/** Lo que llegó entra al stock del depósito de entrega, con el precio como costo. */
export async function recibirPedido(id: string, datos: z.input<typeof esquemaRecepcion>): Promise<{ error?: string }> {
  await exigirPermiso("stock", "editar");
  const r = esquemaRecepcion.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0].message };
  if (!r.data.items.some((i) => i.cantidad_recibida > 0)) return { error: "No llegó nada: si no va a llegar, cancelá el pedido" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("recibir_pedido", {
    p_id: id,
    p_fecha: r.data.fecha,
    p_items: r.data.items.map((i) => ({ ...i, costo_unitario: i.costo_unitario ?? "" })),
  });
  if (error) return { error: error.message.startsWith("El pedido") ? error.message : "No se pudo registrar la recepción" };
  refresh();
  return {};
}

export async function cancelarPedido(id: string): Promise<{ error?: string }> {
  await exigirPermiso("stock", "editar");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("pedidos").update({ estado: "cancelado" }).eq("id", id).in("estado", ["borrador", "enviado"]).select("id");
  if (!data?.length) return { error: "No se pudo cancelar el pedido" };
  refresh();
  return {};
}

export async function borrarPedido(id: string): Promise<{ error?: string }> {
  await exigirPermiso("stock", "editar");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("pedidos").delete().eq("id", id).neq("estado", "recibido").select("id");
  if (!data?.length) return { error: "No se pudo borrar el pedido" };
  return {};
}

const esquemaMayorista = z.object({
  razon_social: z.string().trim().min(1, "Falta el nombre del mayorista").max(200),
  telefono: z.string().trim().max(40).optional().transform((v) => v || null),
});

/** Alta rápida de un mayorista desde el pedido (después se completa en Proveedores). */
export async function crearMayorista(datos: z.input<typeof esquemaMayorista>): Promise<{ error?: string; id?: string }> {
  await exigirPermiso("stock", "editar");
  const r = esquemaMayorista.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("proveedores").insert(r.data).select("id").single();
  if (error || !data) return { error: "No se pudo agregar el mayorista" };
  refresh();
  return { id: data.id };
}

/** Stock mínimo de varios productos juntos: { producto_id: mínimo }. */
export async function guardarMinimos(minimos: Record<string, number>): Promise<{ error?: string; ok?: string }> {
  await exigirPermiso("stock", "editar");
  const entradas = Object.entries(minimos);
  if (entradas.some(([id, v]) => !/^[0-9a-f-]{36}$/i.test(id) || !Number.isFinite(v) || v < 0 || v > 1e9)) return { error: "Hay un mínimo inválido" };
  if (!entradas.length) return { ok: "No había cambios" };
  const supabase = await crearClienteServidor();
  const resultados = await Promise.all(entradas.map(([id, v]) => supabase.from("productos").update({ stock_minimo: Math.round(v * 1000) / 1000 }).eq("id", id)));
  if (resultados.some((x) => x.error)) return { error: "No se pudieron guardar todos los mínimos" };
  refresh();
  return { ok: `${entradas.length} ${entradas.length === 1 ? "mínimo guardado" : "mínimos guardados"}` };
}
