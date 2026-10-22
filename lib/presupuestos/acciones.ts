"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { urlBase } from "@/lib/url";
import { crearClienteServidor } from "@/lib/supabase/server";
import { enviarMail, escaparHtml, mailConfigurado } from "@/lib/mail";
import { formatoFecha, formatoPesos, parsearMonto } from "@/lib/formato";
import { calcularTotales, numeroPresupuesto, venceEl, type ItemPresupuesto } from "./tipos";

export type EstadoPresupuestoForm = { error?: string; ok?: string; valores?: Record<string, string> };

const nuevoToken = () => randomBytes(24).toString("base64url");


const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const esquema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  validez_dias: z.coerce.number().int().min(1, "Validez inválida").max(365),
  cliente_nombre: z.string().trim().min(1, "Falta el cliente").max(200),
  cliente_cuit: textoOpcional(20),
  cliente_contacto: textoOpcional(120),
  cliente_email: z.union([z.email("Email del cliente inválido").trim(), z.literal("")]).optional().transform((v) => v || null),
  cliente_telefono: textoOpcional(40),
  evento_nombre: textoOpcional(200),
  evento_fecha: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional().transform((v) => v || null),
  evento_lugar: textoOpcional(200),
  invitados: z.union([z.coerce.number().int().min(0), z.literal("")]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  modo_iva: z.enum(["mas_iva", "iva_incluido", "sin_iva"]),
  descuento_pct: z.string().optional(),
  forma_pago: textoOpcional(2000),
  incluye: textoOpcional(4000),
  observaciones: textoOpcional(4000),
});

function leerItems(v: Record<string, string>): ItemPresupuesto[] | string {
  const items: ItemPresupuesto[] = [];
  const total = Math.min(Number(v.items) || 0, 200);
  for (let i = 0; i < total; i++) {
    const descripcion = (v[`item_descripcion_${i}`] ?? "").trim();
    if (!descripcion) continue;
    const cantidad = parsearMonto(v[`item_cantidad_${i}`] ?? "") ?? 0;
    const precio = parsearMonto(v[`item_precio_${i}`] ?? "");
    const costoTexto = (v[`item_costo_${i}`] ?? "").trim();
    const costo = costoTexto ? parsearMonto(costoTexto) : null;
    if (cantidad <= 0) return `"${descripcion}": cantidad inválida`;
    if (precio === null || precio < 0) return `"${descripcion}": precio inválido`;
    if (costoTexto && costo === null) return `"${descripcion}": costo inválido`;
    items.push({ rubro: (v[`item_rubro_${i}`] ?? "").trim().slice(0, 60), descripcion: descripcion.slice(0, 300), cantidad, precio, costo });
  }
  return items.length ? items : "Agregá al menos un ítem";
}

export async function guardarPresupuesto(
  id: string | null,
  _previo: EstadoPresupuestoForm,
  formData: FormData,
): Promise<EstadoPresupuestoForm> {
  await exigirPermiso("presupuestos", "editar");
  const valores = Object.fromEntries(
    [...formData.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$")),
  ) as Record<string, string>;

  const datos = esquema.safeParse(valores);
  if (!datos.success) return { error: datos.error.issues[0].message, valores };
  const items = leerItems(valores);
  if (typeof items === "string") return { error: items, valores };
  const descuento = datos.data.descuento_pct?.trim() ? parsearMonto(datos.data.descuento_pct) : 0;
  if (descuento === null || descuento < 0 || descuento > 100) return { error: "Descuento inválido (0 a 100 %)", valores };

  const fila = { ...datos.data, descuento_pct: descuento, items };
  const supabase = await crearClienteServidor();
  const { data, error } = id
    ? await supabase.from("presupuestos").update(fila).eq("id", id).neq("estado", "aceptado").select("id")
    : await supabase.from("presupuestos").insert({ ...fila, token: nuevoToken() }).select("id");
  if (error || !data?.length) {
    return { error: id ? "No se pudo guardar (un presupuesto aceptado no se puede editar)" : "No se pudo crear el presupuesto", valores };
  }
  redirect(`/presupuestos/${data[0].id}`);
}

/** Deja el presupuesto visible para el cliente y devuelve su link. */
export async function publicarPresupuesto(id: string): Promise<{ url?: string; error?: string }> {
  await exigirPermiso("presupuestos", "editar");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("presupuestos").select("token, estado").eq("id", id).maybeSingle();
  if (!data) return { error: "Presupuesto no encontrado" };
  if (data.estado === "borrador") {
    await supabase.from("presupuestos").update({ estado: "enviado", enviado_en: new Date().toISOString() }).eq("id", id);
    refresh();
  }
  return { url: `${await urlBase()}/p/presupuesto/${data.token}` };
}

export async function enviarPresupuestoPorMail(
  id: string,
  _previo: EstadoPresupuestoForm,
  formData: FormData,
): Promise<EstadoPresupuestoForm> {
  await exigirPermiso("presupuestos", "editar");
  if (!mailConfigurado()) return { error: "El envío por mail todavía no está configurado. Usá “Copiar link”." };
  const para = String(formData.get("para") ?? "").trim();
  if (!z.email().safeParse(para).success) return { error: "Email inválido" };
  const mensaje = String(formData.get("mensaje") ?? "").trim().slice(0, 2000);

  const supabase = await crearClienteServidor();
  const { data: p } = await supabase
    .from("presupuestos")
    .select("numero, token, estado, fecha, validez_dias, cliente_nombre, cliente_contacto, evento_nombre, items, modo_iva, descuento_pct")
    .eq("id", id)
    .maybeSingle();
  if (!p) return { error: "Presupuesto no encontrado" };

  const url = `${await urlBase()}/p/presupuesto/${p.token}`;
  const { total } = calcularTotales(p.items as ItemPresupuesto[], p.modo_iva, Number(p.descuento_pct));
  const titulo = `Presupuesto ${numeroPresupuesto(Number(p.numero))}${p.evento_nombre ? ` – ${p.evento_nombre}` : ""}`;
  const saludo = `Hola${p.cliente_contacto ? ` ${p.cliente_contacto}` : ""}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1c1917">
  <p style="font-size:20px;font-weight:900;letter-spacing:6px;margin:0">NERO</p>
  <p style="font-size:11px;letter-spacing:3px;color:#78716c;margin:0 0 24px">PRODUCCIONES</p>
  <p>${escaparHtml(saludo)},</p>
  ${mensaje ? `<p style="white-space:pre-line">${escaparHtml(mensaje)}</p>` : `<p>Te compartimos el presupuesto${p.evento_nombre ? ` para <b>${escaparHtml(p.evento_nombre)}</b>` : ""}.</p>`}
  <p style="font-size:14px;color:#57534e">Total: <b>${formatoPesos(total)}</b> · Válido hasta el ${formatoFecha(venceEl(p))}</p>
  <p style="margin:28px 0"><a href="${url}" style="background:#1c1917;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Ver presupuesto</a></p>
  <p style="font-size:12px;color:#a8a29e">Si el botón no funciona, copiá este link: ${url}</p>
</div>`;

  try {
    await enviarMail({
      para,
      asunto: titulo,
      html,
      texto: `${saludo},\n\n${mensaje || "Te compartimos el presupuesto."}\n\nTotal: ${formatoPesos(total)}\nVer presupuesto: ${url}`,
    });
  } catch (e) {
    return { error: `No se pudo enviar el mail: ${e instanceof Error ? e.message : "error"}` };
  }

  await supabase
    .from("presupuestos")
    .update({ estado: p.estado === "borrador" ? "enviado" : p.estado, enviado_en: new Date().toISOString(), cliente_email: para })
    .eq("id", id);
  refresh();
  return { ok: `Enviado a ${para}` };
}

export async function cambiarEstadoPresupuesto(
  id: string,
  estado: "borrador" | "enviado" | "aceptado" | "rechazado",
): Promise<{ error?: string }> {
  await exigirPermiso("presupuestos", "editar");
  const supabase = await crearClienteServidor();
  const cambios: Record<string, unknown> = { estado };
  if (estado === "aceptado" || estado === "rechazado") {
    cambios.respondido_en = new Date().toISOString();
    cambios.respondido_por = "Marcado en la app";
  }
  const { data } = await supabase.from("presupuestos").update(cambios).eq("id", id).select("id");
  if (!data?.length) return { error: "No se pudo cambiar el estado" };
  refresh();
  return {};
}

/** Anula el link anterior: el cliente necesita el nuevo para verlo. */
export async function regenerarLink(id: string): Promise<{ error?: string }> {
  await exigirPermiso("presupuestos", "editar");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("presupuestos").update({ token: nuevoToken() }).eq("id", id).select("id");
  if (!data?.length) return { error: "No se pudo generar un link nuevo" };
  refresh();
  return {};
}

/** Crea el evento a partir de un presupuesto aceptado. */
export async function crearEventoDesdePresupuesto(id: string): Promise<{ error?: string }> {
  await exigirPermiso("presupuestos", "editar");
  const supabase = await crearClienteServidor();
  const { data: p } = await supabase
    .from("presupuestos")
    .select("numero, estado, evento_id, evento_nombre, evento_fecha, evento_lugar, cliente_nombre, items, modo_iva, descuento_pct")
    .eq("id", id)
    .maybeSingle();
  if (!p) return { error: "Presupuesto no encontrado" };
  if (p.evento_id) return { error: "Este presupuesto ya tiene un evento creado" };
  if (p.estado !== "aceptado") return { error: "Primero el presupuesto tiene que estar aceptado" };

  const totales = calcularTotales(p.items as ItemPresupuesto[], p.modo_iva, Number(p.descuento_pct));
  const { data: evento, error } = await supabase
    .from("eventos")
    .insert({
      nombre: p.evento_nombre || `Evento ${p.cliente_nombre}`,
      fecha: p.evento_fecha ?? new Date().toISOString().slice(0, 10),
      lugar: p.evento_lugar,
      estado: "planificado",
      // Presupuesto de gastos del evento = costo interno estimado.
      presupuesto: totales.costo > 0 ? totales.costo : null,
      notas: `Desde el presupuesto ${numeroPresupuesto(Number(p.numero))} para ${p.cliente_nombre}. Total presupuestado: ${formatoPesos(totales.total)}.`,
    })
    .select("id")
    .single();
  if (error || !evento) return { error: "No se pudo crear el evento (¿tenés permiso de edición en Eventos?)" };

  await supabase.from("presupuestos").update({ evento_id: evento.id }).eq("id", id);
  redirect(`/eventos/${evento.id}`);
}
