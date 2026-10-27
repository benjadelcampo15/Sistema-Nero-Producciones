"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso, puede } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { configuracionArca, entornoConfigurado } from "@/lib/arca/config";
import { ErrorArca } from "@/lib/arca/soap";
import { solicitarCae, ultimoAutorizado } from "@/lib/arca/wsfe";
import { parsearMonto } from "@/lib/formato";
import { cuitValido } from "@/lib/cuit";
import { mailConfigurado } from "@/lib/mail";
import { mandarFacturaPorMail } from "./mail";
import { CONDICIONES_IVA, TIPOS_CBTE, calcularTotales, nombreTipoCbte, type ItemComprobante } from "./tipos";

export type EstadoEmision = { error?: string; detalles?: string[]; valores?: Record<string, string> };

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

const esquema = z.object({
  entorno: z.enum(["homologacion", "produccion"], "Elegí si es una factura de prueba o real"),
  tipo_cbte: z.coerce.number().refine((n) => TIPOS_CBTE.some((t) => t.id === n), "Tipo de comprobante inválido"),
  punto_venta: z.coerce.number().int().min(1, "Punto de venta inválido").max(99998),
  concepto: z.coerce.number().int().min(1).max(3),
  fecha,
  fecha_servicio_desde: z.string().optional(),
  fecha_servicio_hasta: z.string().optional(),
  fecha_vto_pago: z.string().optional(),
  doc_tipo: z.coerce.number().refine((n) => [80, 96, 99].includes(n), "Tipo de documento inválido"),
  doc_nro: z.string().trim().optional(),
  receptor_nombre: z.string().trim().max(200).optional(),
  condicion_iva_receptor: z.coerce.number(),
  evento_id: z.union([z.uuid(), z.literal("")]).optional(),
  registrar_ingreso: z.string().optional(),
  categoria_id: z.union([z.uuid(), z.literal("")]).optional(),
  cliente_id: z.union([z.uuid(), z.literal("")]).optional(),
  guardar_cliente: z.string().optional(),
  email_cliente: z.union([z.email("Email del cliente inválido").trim(), z.literal("")]).optional().transform((v) => v || null),
  enviar_mail: z.string().optional(),
});

function leerItems(v: Record<string, string>, clase: string): ItemComprobante[] | string {
  const items: ItemComprobante[] = [];
  const total = Math.min(Number(v.items) || 0, 50);
  for (let i = 0; i < total; i++) {
    const descripcion = (v[`item_descripcion_${i}`] ?? "").trim();
    if (!descripcion) continue;
    const cantidad = parsearMonto(v[`item_cantidad_${i}`] ?? "");
    const precio = parsearMonto(v[`item_precio_${i}`] ?? "");
    if (cantidad === null || cantidad <= 0) return `Ítem ${i + 1}: cantidad inválida`;
    if (precio === null || precio <= 0) return `Ítem ${i + 1}: precio inválido`;
    items.push({
      descripcion: descripcion.slice(0, 200),
      cantidad,
      precio,
      alicuota: clase === "C" ? null : Number(v[`item_alicuota_${i}`] ?? 5),
    });
  }
  return items.length ? items : "Agregá al menos un ítem";
}

/** "Activación de marca" o "Sonido, Iluminación (+2 ítems)" para la descripción del ingreso. */
function descripcionDeItems(items: ItemComprobante[]) {
  const primeros = items.slice(0, 2).map((i) => i.descripcion).join(", ");
  const resto = items.length > 2 ? ` (+${items.length - 2} ítems)` : "";
  return `${primeros}${resto}`.slice(0, 200);
}


export async function emitirFactura(_previo: EstadoEmision, formData: FormData): Promise<EstadoEmision> {
  const usuario = await exigirPermiso("facturar", "editar");
  const valores = Object.fromEntries(
    [...formData.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$")),
  ) as Record<string, string>;

  const datos = esquema.safeParse(valores);
  if (!datos.success) return { error: datos.error.issues[0].message, valores };
  const d = datos.data;

  const tipo = TIPOS_CBTE.find((t) => t.id === d.tipo_cbte)!;
  const condicion = CONDICIONES_IVA.find((c) => c.id === d.condicion_iva_receptor);
  if (!condicion || !(condicion.clases as readonly string[]).includes(tipo.clase)) {
    return { error: `La condición de IVA elegida no corresponde a una ${tipo.nombre}`, valores };
  }

  // Receptor
  const docNro = d.doc_tipo === 99 ? "0" : (d.doc_nro ?? "").replace(/\D/g, "");
  if (d.doc_tipo === 80 && !cuitValido(docNro)) return { error: "CUIT del cliente inválido", valores };
  if (d.doc_tipo === 96 && !/^\d{7,8}$/.test(docNro)) return { error: "DNI inválido", valores };
  if (d.enviar_mail === "on" && !d.email_cliente) return { error: "Falta el email del cliente para mandarle la factura", valores };
  if (tipo.clase === "A" && d.doc_tipo !== 80) return { error: "La Factura A requiere el CUIT del cliente", valores };

  // Servicios: ARCA exige el período y el vencimiento del pago.
  const conServicios = d.concepto !== 1;
  if (conServicios && ![d.fecha_servicio_desde, d.fecha_servicio_hasta, d.fecha_vto_pago].every((f) => f && /^\d{4}-\d{2}-\d{2}$/.test(f))) {
    return { error: "Para servicios completá el período (desde/hasta) y el vencimiento del pago", valores };
  }

  const items = leerItems(valores, tipo.clase);
  if (typeof items === "string") return { error: items, valores };
  const totales = calcularTotales(items, tipo.clase);

  const entorno = d.entorno;
  if (!entornoConfigurado(entorno)) {
    return {
      error: entorno === "produccion" ? "La facturación real todavía no está configurada" : "La facturación de prueba no está configurada",
      valores,
    };
  }
  // Las facturas reales solo salen por el punto de venta de esta app: otros
  // puntos de venta de la empresa los usan otros sistemas.
  const puntoVentaReal = configuracionArca("produccion").puntoVentaSugerido;
  if (entorno === "produccion" && (!puntoVentaReal || d.punto_venta !== puntoVentaReal)) {
    return {
      error: puntoVentaReal
        ? `Las facturas reales se emiten solo por el punto de venta ${puntoVentaReal}`
        : "Falta configurar el punto de venta de las facturas reales (ARCA_PROD_PUNTO_VENTA)",
      valores,
    };
  }
  let numero: number;
  let respuesta: Awaited<ReturnType<typeof solicitarCae>>;
  try {
    numero = (await ultimoAutorizado(entorno, d.punto_venta, d.tipo_cbte)) + 1;
    respuesta = await solicitarCae(entorno, {
      puntoVenta: d.punto_venta,
      tipoCbte: d.tipo_cbte,
      numero,
      concepto: d.concepto as 1 | 2 | 3,
      docTipo: d.doc_tipo,
      docNro,
      fecha: d.fecha,
      fechaServicioDesde: conServicios ? d.fecha_servicio_desde : undefined,
      fechaServicioHasta: conServicios ? d.fecha_servicio_hasta : undefined,
      fechaVtoPago: conServicios ? d.fecha_vto_pago : undefined,
      neto: totales.neto,
      iva: totales.iva,
      total: totales.total,
      alicuotas: totales.alicuotas,
      condicionIvaReceptor: d.condicion_iva_receptor,
    });
  } catch (e) {
    return { error: e instanceof ErrorArca ? e.message : "No se pudo comunicar con ARCA", valores };
  }

  const supabase = await crearClienteServidor();
  const mensajes = [...respuesta.errores, ...respuesta.observaciones];

  // Cliente: el elegido de la lista, o se guarda el nuevo si se pidió (solo si ARCA aprobó).
  let clienteId: string | null = d.cliente_id || null;
  if (!clienteId && respuesta.aprobado && d.guardar_cliente === "on" && d.doc_tipo !== 99 && d.receptor_nombre) {
    const { data: existente } = await supabase.from("clientes").select("id").eq("doc_tipo", d.doc_tipo).eq("doc_nro", docNro).maybeSingle();
    if (existente) clienteId = existente.id;
    else {
      const { data: nuevo } = await supabase
        .from("clientes")
        .insert({ razon_social: d.receptor_nombre, doc_tipo: d.doc_tipo, doc_nro: docNro, condicion_iva: d.condicion_iva_receptor, email: d.email_cliente })
        .select("id")
        .single();
      clienteId = nuevo?.id ?? null;
    }
  }
  const { data: comprobante, error } = await supabase
    .from("comprobantes_emitidos")
    .insert({
      entorno,
      estado: respuesta.aprobado ? "emitido" : "rechazado",
      tipo_cbte: d.tipo_cbte,
      punto_venta: d.punto_venta,
      numero: respuesta.aprobado ? numero : null,
      fecha: d.fecha,
      concepto: d.concepto,
      fecha_servicio_desde: conServicios ? d.fecha_servicio_desde : null,
      fecha_servicio_hasta: conServicios ? d.fecha_servicio_hasta : null,
      fecha_vto_pago: conServicios ? d.fecha_vto_pago : null,
      doc_tipo: d.doc_tipo,
      doc_nro: docNro,
      receptor_nombre: d.receptor_nombre || null,
      condicion_iva_receptor: d.condicion_iva_receptor,
      items,
      neto: totales.neto,
      iva: totales.iva,
      total: totales.total,
      cae: respuesta.cae,
      cae_vto: respuesta.caeVto,
      mensajes: mensajes.length ? mensajes : null,
      evento_id: d.evento_id || null,
      cliente_id: clienteId,
      token: randomBytes(24).toString("base64url"),
    })
    .select("id")
    .single();

  if (!respuesta.aprobado) {
    return {
      error: "ARCA rechazó la factura",
      detalles: mensajes.map((m) => `${m.codigo}: ${m.mensaje}`),
      valores,
    };
  }
  if (error || !comprobante) {
    // La factura ya existe en ARCA: no hay que perder el CAE.
    return {
      error: `ARCA autorizó la factura (CAE ${respuesta.cae}) pero no se pudo guardar en la app. Anotá el CAE y avisá al administrador.`,
      valores,
    };
  }

  // Ingreso en Financiero (pendiente de cobro), si se pidió y hay permiso.
  if (d.registrar_ingreso === "on" && d.categoria_id && puede(usuario, "financiero", "editar")) {
    const numeroTexto = `${String(d.punto_venta).padStart(5, "0")}-${String(numero).padStart(8, "0")}`;
    const { data: trx } = await supabase
      .from("transacciones")
      .insert({
        tipo: "ingreso",
        monto: totales.total,
        fecha: d.fecha,
        // Lo que se facturó (los ítems); el número de factura y el CAE van en las notas.
        descripcion: descripcionDeItems(items),
        categoria_id: d.categoria_id,
        evento_id: d.evento_id || null,
        contraparte: d.receptor_nombre || null,
        medio_pago: "transferencia",
        estado: "pendiente",
        facturado: true,
        iva: totales.iva || null,
        notas: `${nombreTipoCbte(d.tipo_cbte)} ${numeroTexto} · CAE ${respuesta.cae}${entorno === "homologacion" ? " · PRUEBA (homologación)" : ""}`,
      })
      .select("id")
      .single();
    if (trx) await supabase.from("comprobantes_emitidos").update({ transaccion_id: trx.id }).eq("id", comprobante.id);
  }

  // Mail al cliente con el link a la factura. Si falla, la factura igual quedó emitida.
  let resultadoMail = "";
  if (d.enviar_mail === "on" && d.email_cliente) {
    if (clienteId) {
      // Si el cliente guardado no tenía email, queda guardado para la próxima.
      await supabase.from("clientes").update({ email: d.email_cliente }).eq("id", clienteId).is("email", null);
    }
    try {
      if (!mailConfigurado()) throw new Error("sin configurar");
      await mandarFacturaPorMail(comprobante.id, d.email_cliente);
      resultadoMail = "?mail=enviado";
    } catch {
      resultadoMail = "?mail=error";
    }
  }

  redirect(`/facturar/${comprobante.id}${resultadoMail}`);
}

export type EstadoEnvio = { error?: string; ok?: string };

/** Manda (o reenvía) una factura emitida por mail. */
export async function enviarFacturaPorMail(id: string, _previo: EstadoEnvio, formData: FormData): Promise<EstadoEnvio> {
  await exigirPermiso("facturar", "editar");
  if (!mailConfigurado()) return { error: "El envío por mail no está configurado" };
  const para = String(formData.get("para") ?? "").trim();
  if (!z.email().safeParse(para).success) return { error: "Email inválido" };
  try {
    await mandarFacturaPorMail(id, para);
  } catch (e) {
    return { error: `No se pudo enviar el mail: ${e instanceof Error ? e.message : "error"}` };
  }
  refresh();
  return { ok: `Enviada a ${para}` };
}

/**
 * Borra un comprobante emitido de la app. Si es una factura real autorizada,
 * solo se borra de la app: para ARCA sigue existiendo (se anula con nota de crédito).
 */
export async function borrarComprobante(id: string): Promise<{ error?: string }> {
  await exigirPermiso("facturar", "editar");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Comprobante inválido" };
  const supabase = await crearClienteServidor();
  const { data: c } = await supabase.from("comprobantes_emitidos").select("id").eq("id", id).maybeSingle();
  if (!c) return { error: "Comprobante no encontrado" };
  const { error } = await crearClienteAdmin().from("comprobantes_emitidos").delete().eq("id", id);
  if (error) return { error: "No se pudo borrar" };
  refresh();
  return {};
}
