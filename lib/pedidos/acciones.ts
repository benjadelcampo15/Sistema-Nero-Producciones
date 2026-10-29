"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { hoy } from "@/lib/formato";
import { bonificadasDe, descuentoDe, leerPromo } from "./tipos";
import { obtenerPedido } from "./consultas";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Falta la fecha");

/** Teléfono del mayorista (opcional, como se escriba). */
const telefono = z.string().trim().max(40).optional().transform((v) => v || null);

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
        aclaracion: z.string().trim().max(200).nullable().optional(),
        promo: z.string().max(20).nullable().optional(),
      }),
    )
    .min(1, "Agregá al menos un producto"),
});
export type DatosPedido = z.input<typeof esquemaPedido>;

/** Guarda el pedido (el envío al proveedor se hace a mano, con el PDF). */
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
    p_items: items.map((i) => {
      // La promo se guarda tal cual estaba al pedir; las bonificadas se calculan acá.
      const promo = i.promo ? leerPromo(i.promo) : null;
      return { ...i, precio_unitario: i.precio_unitario ?? "", aclaracion: i.aclaracion ?? "", promo: promo ?? "", bonificadas: bonificadasDe(promo, i.cantidad) };
    }),
  });
  if (error) return { error: error.message.startsWith("El pedido") ? error.message : "No se pudo guardar el pedido" };

  // Lo pedido queda en el catálogo del mayorista con el precio de lista
  // (si el pedido tenía un descuento, se guarda el precio sin descuento).
  const conPrecio = items.filter((i) => i.precio_unitario !== null);
  const sinPrecio = items.filter((i) => i.precio_unitario === null);
  const lista = (precio: number, promo?: string | null) => Math.round((precio / (1 - Math.min(descuentoDe(promo ? leerPromo(promo) : null), 0.99))) * 100) / 100;
  await Promise.all([
    conPrecio.length &&
      supabase.from("proveedor_productos").upsert(
        conPrecio.map((i) => ({
          proveedor_id: pedido.proveedor_id,
          producto_id: i.producto_id,
          precio: lista(i.precio_unitario as number, i.promo),
          actualizado_en: new Date().toISOString(),
        })),
      ),
    sinPrecio.length &&
      supabase
        .from("proveedor_productos")
        .upsert(sinPrecio.map((i) => ({ proveedor_id: pedido.proveedor_id, producto_id: i.producto_id })), { ignoreDuplicates: true }),
  ]);
  refresh();
  return { id: data as string };
}

const esquemaCatalogo = z
  .array(
    z.object({
      producto_id: z.uuid(),
      precio: z.number().min(0).max(1e12).nullable(),
      promo: z.string().max(20).nullable(),
      promo_hasta: z.union([fecha, z.literal("")]).nullable(),
    }),
  )
  .max(5000);

/** Reemplaza el catálogo de un mayorista: los productos que se le pueden pedir y su precio. */
export async function guardarCatalogo(proveedorId: string, items: z.input<typeof esquemaCatalogo>): Promise<{ error?: string; ok?: string }> {
  await exigirPermiso("stock", "editar");
  const r = esquemaCatalogo.safeParse(items);
  if (!r.success || !/^[0-9a-f-]{36}$/i.test(proveedorId)) return { error: "Hay un precio o una fecha inválida" };
  const malPromo = r.data.find((i) => i.promo && !leerPromo(i.promo));
  if (malPromo) return { error: `Promo "${malPromo.promo}" inválida: usá 4+1 (regalo) o 10% (descuento)` };
  const filas = r.data.map((i) => ({ ...i, promo: i.promo ? leerPromo(i.promo) : null, promo_hasta: i.promo && i.promo_hasta ? i.promo_hasta : null }));
  const supabase = await crearClienteServidor();
  const { data: actuales } = await supabase.from("proveedor_productos").select("producto_id").eq("proveedor_id", proveedorId);
  const quedan = new Set(r.data.map((i) => i.producto_id));
  const sacar = (actuales ?? []).map((a) => a.producto_id).filter((id) => !quedan.has(id));
  const [borrado, guardado] = await Promise.all([
    sacar.length ? supabase.from("proveedor_productos").delete().eq("proveedor_id", proveedorId).in("producto_id", sacar) : Promise.resolve({ error: null }),
    r.data.length
      ? supabase.from("proveedor_productos").upsert(filas.map((i) => ({ proveedor_id: proveedorId, ...i, actualizado_en: new Date().toISOString() })))
      : Promise.resolve({ error: null }),
  ]);
  if (borrado.error || guardado.error) return { error: "No se pudo guardar el catálogo" };
  refresh();
  return { ok: `Catálogo guardado: ${r.data.length} ${r.data.length === 1 ? "producto" : "productos"}` };
}

const esquemaDatosMayorista = z.object({
  razon_social: z.string().trim().min(1, "Falta el nombre").max(200),
  contacto: z.string().trim().max(120).optional().transform((v) => v || null),
  telefono,
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
  items: z
    .array(
      z.object({
        producto_id: z.uuid(),
        cantidad_recibida: z.number().min(0).max(1e9),
        bonificadas_recibidas: z.number().min(0).max(1e9),
        costo_unitario: z.number().min(0).max(1e12).nullable(),
      }),
    )
    .min(1),
});

/** Lo que llegó entra al stock del depósito de entrega: lo pagado con su costo y lo bonificado con costo 0. */
export async function recibirPedido(id: string, datos: z.input<typeof esquemaRecepcion>): Promise<{ error?: string }> {
  await exigirPermiso("stock", "editar");
  const r = esquemaRecepcion.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0].message };
  if (!r.data.items.some((i) => i.cantidad_recibida > 0 || i.bonificadas_recibidas > 0)) return { error: "No llegó nada: si no va a llegar, cancelá el pedido" };
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

/**
 * "Llegó todo": recibe el pedido con lo que confirmó el proveedor (o, si no
 * respondió, lo pedido), lo de regalo de su promo y el precio como costo.
 */
export async function recibirPedidoCompleto(id: string): Promise<{ error?: string }> {
  await exigirPermiso("stock", "editar");
  const pedido = await obtenerPedido(id);
  if (!pedido) return { error: "El pedido no existe" };
  return recibirPedido(id, {
    fecha: hoy(),
    items: pedido.items.map((i) => {
      const cantidad = i.cantidad_confirmada ?? i.cantidad;
      return {
        producto_id: i.producto.id,
        cantidad_recibida: cantidad,
        bonificadas_recibidas: cantidad === i.cantidad ? i.bonificadas : bonificadasDe(i.promo, cantidad),
        costo_unitario: i.precio_unitario,
      };
    }),
  });
}

export async function cancelarPedido(id: string): Promise<{ error?: string }> {
  await exigirPermiso("stock", "editar");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("pedidos").update({ estado: "cancelado" }).eq("id", id).in("estado", ["borrador", "enviado", "confirmado"]).select("id");
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
  telefono,
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

const esquemaConfirmacion = z.object({
  respuesta: z.string().trim().max(1000).optional(),
  fecha_entrega: z.union([fecha, z.literal("")]).optional(),
  items: z.array(z.object({ producto_id: z.uuid(), cantidad: z.number().min(0).max(1e9), nota: z.string().trim().max(300).optional() })).max(2000),
});

/**
 * El proveedor confirma (o corrige) un pedido desde su link, sin sesión: se
 * valida que el pedido sea de ese proveedor y que siga abierto. Clave secreta.
 */
export async function confirmarPedidoProveedor(token: string, pedidoId: string, datos: z.input<typeof esquemaConfirmacion>): Promise<{ error?: string }> {
  const r = esquemaConfirmacion.safeParse(datos);
  if (!r.success || !/^[A-Za-z0-9_-]{24,64}$/.test(token) || !/^[0-9a-f-]{36}$/i.test(pedidoId)) return { error: "Datos inválidos" };
  const admin = crearClienteAdmin();
  const { data: proveedor } = await admin.from("proveedores").select("id").eq("token", token).maybeSingle();
  if (!proveedor) return { error: "Link inválido" };
  const { data: pedido } = await admin.from("pedidos").select("id, estado").eq("id", pedidoId).eq("proveedor_id", proveedor.id).maybeSingle();
  if (!pedido || (pedido.estado !== "enviado" && pedido.estado !== "confirmado")) return { error: "Este pedido ya no se puede confirmar" };

  const resultados = await Promise.all([
    ...r.data.items.map((i) =>
      admin.from("pedido_items").update({ cantidad_confirmada: i.cantidad, nota_proveedor: i.nota || null }).eq("pedido_id", pedidoId).eq("producto_id", i.producto_id),
    ),
    admin
      .from("pedidos")
      .update({ estado: "confirmado", confirmado_en: new Date().toISOString(), respuesta_proveedor: r.data.respuesta || null, fecha_entrega_confirmada: r.data.fecha_entrega || null })
      .eq("id", pedidoId),
  ]);
  if (resultados.some((x) => x.error)) return { error: "No se pudo guardar la confirmación. Probá de nuevo." };
  refresh();
  return {};
}