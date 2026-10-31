"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { leerFactura } from "@/lib/ai/leer-factura";
import { parsearMonto } from "@/lib/formato";
import { ESTADOS_MOVIMIENTO, MEDIOS_PAGO, TIPOS } from "@/lib/financiero/tipos";
import { EMPRESAS } from "@/lib/empresas";
import { TAMANO_MAXIMO } from "./tipos";

export type ResultadoSubida = { id?: string; error?: string; nombre: string };

/** Tipo real del archivo según sus primeros bytes (no se confía en lo que dice el navegador). */
function detectarTipo(b: Buffer): string | null {
  if (b.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

const EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Sube un archivo y lo manda a leer con IA. Se llama una vez por archivo. */
export async function subirFactura(formData: FormData): Promise<ResultadoSubida> {
  await exigirPermiso("facturas", "editar");

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { nombre: "", error: "No se recibió el archivo" };
  const nombre = archivo.name.slice(0, 200);
  if (archivo.size > TAMANO_MAXIMO) return { nombre, error: "El archivo supera los 10 MB" };

  const datos = Buffer.from(await archivo.arrayBuffer());
  const tipo = detectarTipo(datos);
  if (!tipo) return { nombre, error: "Formato no soportado: subí un PDF o una foto (JPG, PNG o WEBP)" };

  const ahora = new Date();
  const path = `${ahora.getUTCFullYear()}/${String(ahora.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${EXTENSION[tipo]}`;

  const { error: errorSubida } = await crearClienteAdmin()
    .storage.from("facturas")
    .upload(path, datos, { contentType: tipo, upsert: false });
  if (errorSubida) return { nombre, error: "No se pudo guardar el archivo" };

  const supabase = await crearClienteServidor();
  const { data: fila, error } = await supabase
    .from("facturas")
    .insert({ archivo_path: path, archivo_nombre: nombre, archivo_tipo: tipo })
    .select("id")
    .single();
  if (error || !fila) {
    await crearClienteAdmin().storage.from("facturas").remove([path]);
    return { nombre, error: "No se pudo registrar la factura" };
  }

  await procesar(fila.id, { datos, tipo, nombre });
  refresh();
  return { id: fila.id, nombre };
}

/** Vuelve a leer con IA una factura que dio error. */
export async function reprocesarFactura(id: string): Promise<{ error?: string }> {
  await exigirPermiso("facturas", "editar");
  const supabase = await crearClienteServidor();
  const { data: factura } = await supabase
    .from("facturas")
    .select("archivo_path, archivo_tipo, archivo_nombre, estado")
    .eq("id", id)
    .maybeSingle();
  if (!factura || !["error", "por_revisar"].includes(factura.estado)) return { error: "La factura no se puede volver a leer" };

  const { data: blob, error } = await crearClienteAdmin().storage.from("facturas").download(factura.archivo_path);
  if (error || !blob) return { error: "No se pudo leer el archivo guardado" };

  await supabase.from("facturas").update({ estado: "procesando", error: null }).eq("id", id);
  await procesar(id, { datos: Buffer.from(await blob.arrayBuffer()), tipo: factura.archivo_tipo, nombre: factura.archivo_nombre });
  refresh();
  return {};
}

async function procesar(id: string, archivo: { datos: Buffer; tipo: string; nombre: string }) {
  const supabase = await crearClienteServidor();
  const { data: categorias } = await supabase.from("categorias").select("nombre").eq("activa", true);
  const nombres = [...new Set((categorias ?? []).map((c) => c.nombre as string))];

  try {
    const { datos, proveedor, crudo } = await leerFactura(archivo, nombres);
    const soloDigitos = (v: string) => v.replace(/\D/g, "") || null;
    const campos = {
      tipo_comprobante: datos.tipo_comprobante || null,
      punto_venta: soloDigitos(datos.punto_venta),
      numero: soloDigitos(datos.numero),
      fecha_emision: /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha_emision) ? datos.fecha_emision : null,
      cuit_emisor: soloDigitos(datos.cuit_emisor),
      razon_social_emisor: datos.razon_social_emisor || null,
      cuit_receptor: soloDigitos(datos.cuit_receptor),
      razon_social_receptor: datos.razon_social_receptor || null,
      neto: datos.neto || null,
      iva: datos.iva || null,
      total: datos.total || null,
    };

    // ¿Ya hay otra factura (no rechazada) con el mismo comprobante?
    let duplicada_de: string | null = null;
    if (campos.cuit_emisor && campos.punto_venta && campos.numero) {
      const { data: otra } = await supabase
        .from("facturas")
        .select("id")
        .neq("id", id)
        .neq("estado", "rechazada")
        .eq("cuit_emisor", campos.cuit_emisor)
        .eq("punto_venta", campos.punto_venta)
        .eq("numero", campos.numero)
        .limit(1)
        .maybeSingle();
      duplicada_de = otra?.id ?? null;
    }

    await supabase
      .from("facturas")
      .update({ ...campos, datos_ia: crudo, proveedor_ia: proveedor, duplicada_de, estado: "por_revisar", error: null })
      .eq("id", id);
  } catch (e) {
    await supabase
      .from("facturas")
      .update({ estado: "error", error: e instanceof Error ? e.message.slice(0, 500) : "Error desconocido" })
      .eq("id", id);
  }
}

export async function rechazarFactura(id: string): Promise<{ error?: string }> {
  await exigirPermiso("facturas", "editar");
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("facturas")
    .update({ estado: "rechazada" })
    .eq("id", id)
    .in("estado", ["por_revisar", "error"])
    .select("id");
  if (!data?.length) return { error: "No se pudo rechazar la factura" };
  refresh();
  return {};
}

export type EstadoAprobacion = { error?: string; valores?: Record<string, string> };

type ItemStock = { producto_id?: string; producto_nuevo?: string; unidad?: string; cantidad: number; costo_unitario?: number };

/**
 * Sección "Ingreso a stock" del formulario de aprobación. Campos:
 * stock_ingresa, stock_deposito_id, stock_items y por renglón i:
 * stock_incluir_i, stock_producto_i ("nuevo" o id), stock_nombre_i, stock_unidad_i,
 * stock_cantidad_i, stock_costo_i.
 */
function leerIngresoStock(v: Record<string, string>): { ingreso: object | null } | { error: string } {
  if (v.stock_ingresa !== "on") return { ingreso: null };
  if (!/^[0-9a-f-]{36}$/i.test(v.stock_deposito_id ?? "")) return { error: "Elegí a qué depósito va la mercadería" };

  const items: ItemStock[] = [];
  const total = Math.min(Number(v.stock_items) || 0, 50);
  for (let i = 0; i < total; i++) {
    if (v[`stock_incluir_${i}`] !== "on") continue;
    const cantidad = parsearMonto(v[`stock_cantidad_${i}`] ?? "");
    if (cantidad === null || cantidad <= 0) return { error: `Renglón ${i + 1}: cantidad inválida` };
    const costoTexto = v[`stock_costo_${i}`]?.trim() ?? "";
    const costo = costoTexto ? parsearMonto(costoTexto) : null;
    if (costoTexto && costo === null) return { error: `Renglón ${i + 1}: costo inválido` };

    const producto = v[`stock_producto_${i}`] ?? "nuevo";
    if (producto === "nuevo") {
      const nombre = (v[`stock_nombre_${i}`] ?? "").trim().slice(0, 120);
      if (!nombre) return { error: `Renglón ${i + 1}: falta el nombre del producto nuevo` };
      items.push({ producto_nuevo: nombre, unidad: v[`stock_unidad_${i}`] || "unidad", cantidad, costo_unitario: costo ?? undefined });
    } else if (/^[0-9a-f-]{36}$/i.test(producto)) {
      items.push({ producto_id: producto, cantidad, costo_unitario: costo ?? undefined });
    } else {
      return { error: `Renglón ${i + 1}: producto inválido` };
    }
  }
  if (!items.length) return { error: "Marcaste ingreso a stock pero no incluiste ningún renglón" };
  return { ingreso: { deposito_id: v.stock_deposito_id, items } };
}

const textoOpcional = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => v || null);
const digitos = z
  .string()
  .optional()
  .transform((v) => v?.replace(/\D/g, "") || null);

const esquemaAprobacion = z.object({
  empresa: z.enum(EMPRESAS, "Elegí la empresa"),
  // Comprobante
  tipo_comprobante: textoOpcional,
  punto_venta: digitos,
  numero: digitos,
  fecha_emision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de emisión inválida"),
  cuit_emisor: digitos,
  razon_social_emisor: textoOpcional,
  cuit_receptor: digitos,
  razon_social_receptor: textoOpcional,
  neto: z.string().optional(),
  iva: z.string().optional(),
  total: z.string(),
  // Movimiento
  tipo: z.enum(TIPOS, "Elegí si es ingreso o egreso"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha del movimiento inválida"),
  descripcion: z.string().trim().min(1, "Falta la descripción").max(200),
  categoria_id: z.uuid("Elegí una categoría"),
  evento_id: z.union([z.uuid(), z.literal("")]).optional(),
  contraparte: textoOpcional,
  medio_pago: z.enum(MEDIOS_PAGO, "Elegí el medio de pago"),
  estado: z.enum(ESTADOS_MOVIMIENTO, "Elegí el estado"),
  notas: z.string().trim().max(500).optional(),
});

export async function aprobarFactura(
  id: string,
  _previo: EstadoAprobacion,
  formData: FormData,
): Promise<EstadoAprobacion> {
  await exigirPermiso("facturas", "editar");
  const valores = Object.fromEntries(
    [...formData.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$")),
  ) as Record<string, string>;

  const datos = esquemaAprobacion.safeParse(valores);
  if (!datos.success) return { error: datos.error.issues[0].message, valores };
  const d = datos.data;

  const total = parsearMonto(d.total);
  if (total === null || total <= 0) return { error: "Total inválido", valores };
  const opcional = (v?: string) => (v?.trim() ? parsearMonto(v) : null);
  const neto = opcional(d.neto);
  const iva = opcional(d.iva);
  if ((d.neto?.trim() && neto === null) || (d.iva?.trim() && iva === null)) {
    return { error: "Neto o IVA inválido", valores };
  }

  const comprobante = [d.tipo_comprobante, d.punto_venta && d.numero ? `${d.punto_venta}-${d.numero}` : null]
    .filter(Boolean)
    .join(" ");

  const stock = leerIngresoStock(valores);
  if ("error" in stock) return { error: stock.error, valores };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("aprobar_factura", {
    p_factura_id: id,
    p_factura: {
      tipo_comprobante: d.tipo_comprobante,
      punto_venta: d.punto_venta,
      numero: d.numero,
      fecha_emision: d.fecha_emision,
      cuit_emisor: d.cuit_emisor,
      razon_social_emisor: d.razon_social_emisor,
      cuit_receptor: d.cuit_receptor,
      razon_social_receptor: d.razon_social_receptor,
      neto,
      iva,
      total,
    },
    p_transaccion: {
      empresa: d.empresa,
      tipo: d.tipo,
      monto: total,
      fecha: d.fecha,
      descripcion: d.descripcion,
      categoria_id: d.categoria_id,
      evento_id: d.evento_id ?? "",
      contraparte: d.contraparte ?? "",
      medio_pago: d.medio_pago,
      estado: d.estado,
      iva: iva ?? "",
      notas: [comprobante && `Factura ${comprobante}`, d.notas].filter(Boolean).join(" · "),
    },
    p_stock: stock.ingreso,
  });

  if (error) {
    const mensaje =
      error.code === "23505"
        ? "Esta factura ya fue aprobada antes (mismo CUIT, punto de venta y número)"
        : error.code === "42501" || error.message.includes("row-level security")
          ? "No tenés permiso para cargar movimientos en Financiero"
          : error.message.includes("categoría")
            ? "La categoría no corresponde al tipo de movimiento"
            : error.message.includes("depósito")
              ? "Elegí a qué depósito va la mercadería"
              : "No se pudo aprobar la factura";
    return { error: mensaje, valores };
  }

  // El emisor queda en Proveedores (si ya estaba, no se toca).
  const cuit = (d.cuit_emisor ?? "").replace(/\D/g, "");
  if (/^\d{11}$/.test(cuit)) {
    await supabase
      .from("proveedores")
      .upsert({ cuit, razon_social: d.razon_social_emisor?.trim() || `Proveedor ${cuit}` }, { onConflict: "cuit", ignoreDuplicates: true });
  }

  redirect("/facturas/lista?estado=por_revisar");
}

/**
 * Borra una factura recibida y su archivo. Si estaba aprobada, anula lo que
 * generó: su movimiento de Financiero queda eliminado y, si había ingresado
 * mercadería, se descuenta del stock con un ajuste (el stock es un registro
 * que no se borra).
 */
export async function borrarFactura(id: string): Promise<{ error?: string }> {
  await exigirPermiso("facturas", "editar");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Factura inválida" };
  const supabase = await crearClienteServidor();
  const { data: f } = await supabase
    .from("facturas")
    .select("archivo_path, tipo_comprobante, punto_venta, numero, razon_social_emisor, archivo_nombre")
    .eq("id", id)
    .maybeSingle();
  if (!f) return { error: "Factura no encontrada" };
  const referencia =
    [f.tipo_comprobante, f.punto_venta && f.numero ? `${f.punto_venta}-${f.numero}` : null, f.razon_social_emisor].filter(Boolean).join(" ") ||
    f.archivo_nombre;

  const admin = crearClienteAdmin();
  // 1) El movimiento de Financiero queda eliminado y deja de apuntar a la factura.
  const { error: errorMovimiento } = await admin
    .from("transacciones")
    .update({ eliminado_en: new Date().toISOString(), factura_id: null })
    .eq("factura_id", id)
    .is("eliminado_en", null);
  if (errorMovimiento) return { error: "No se pudo anular el movimiento de Financiero" };

  // 2) Se borra la factura (lo que la referenciaba queda sin referencia).
  const { data: entradas } = await admin.from("movimientos_stock").select("producto_id, deposito_id, cantidad").eq("factura_id", id).eq("tipo", "entrada").is("eliminado_en", null);
  const { error } = await admin.from("facturas").delete().eq("id", id);
  if (error) return { error: "No se pudo borrar la factura" };
  await admin.storage.from("facturas").remove([f.archivo_path]);

  // 3) La mercadería que había ingresado se descuenta con un ajuste (después de borrar, para no duplicarlo si algo falla antes).
  if (entradas?.length) {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
    const { error: errorStock } = await admin.from("movimientos_stock").insert(
      entradas.map((e) => ({
        producto_id: e.producto_id,
        deposito_id: e.deposito_id,
        tipo: "ajuste",
        cantidad: -Number(e.cantidad),
        fecha: hoy,
        motivo: `Factura borrada: ${referencia}`.slice(0, 200),
      })),
    );
    if (errorStock) return { error: "La factura se borró pero no se pudo descontar su mercadería del stock: hacelo con un ajuste en Stock." };
  }
  refresh();
  return {};
}
