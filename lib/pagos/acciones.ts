"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { EMPRESAS, type Empresa } from "@/lib/empresas";
import { PRIORIDADES_PAGO, type PrioridadPago } from "./tipos";

type Resultado = { error?: string };

/** Mensaje de la base (raise exception) sin el prefijo técnico. */
const mensaje = (e: { message: string } | null, defecto: string) => (e?.message && !/violates|syntax|function/i.test(e.message) ? e.message : defecto);

const uuidOpcional = z.preprocess((v) => v || null, z.uuid().nullable());

const esquemaSolicitud = z.object({
  empresa: z.enum(EMPRESAS, { error: "Elegí la empresa" }),
  proveedor_id: uuidOpcional,
  proveedor: z.string().trim().min(1, "Completá el proveedor").max(200),
  evento_id: uuidOpcional,
  monto: z.number({ error: "Completá el monto" }).positive("El monto tiene que ser mayor a cero").max(1e12),
  datos_bancarios: z.string().trim().min(1, "Completá el alias o CBU").max(300),
  prioridad: z.enum(PRIORIDADES_PAGO),
  motivo: z.string().trim().max(2000).optional().default(""),
  nota_admin: z.string().trim().max(2000).optional().default(""),
});
export type DatosSolicitud = {
  empresa: Empresa;
  proveedor_id: string | null;
  proveedor: string;
  evento_id: string | null;
  monto: number;
  datos_bancarios: string;
  prioridad: PrioridadPago;
  motivo?: string;
  nota_admin?: string;
};

const primerError = (e: z.ZodError) => e.issues[0]?.message ?? "Datos inválidos";

/** Crea una solicitud (idempotente: el mismo envío repetido no la duplica). */
export async function crearSolicitudPago(datos: DatosSolicitud, claveEnvio: string): Promise<Resultado & { numero?: number }> {
  await exigirPermiso("pagos", "ver");
  const v = esquemaSolicitud.safeParse(datos);
  if (!v.success) return { error: primerError(v.error) };
  if (!z.uuid().safeParse(claveEnvio).success) return { error: "Recargá la página e intentá de nuevo" };
  const supabase = await crearClienteServidor();
  const { data: id, error } = await supabase.rpc("crear_solicitud_pago", { p: { ...v.data, clave_envio: claveEnvio } });
  if (error) return { error: mensaje(error, "No se pudo crear la solicitud") };
  const { data } = await supabase.from("solicitudes_pago").select("numero").eq("id", id).maybeSingle();
  refresh();
  return { numero: data?.numero };
}

export async function editarSolicitudPago(id: string, datos: DatosSolicitud): Promise<Resultado> {
  await exigirPermiso("pagos", "ver");
  const v = esquemaSolicitud.safeParse(datos);
  if (!v.success) return { error: primerError(v.error) };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("editar_solicitud_pago", { p_id: id, p: v.data });
  if (error) return { error: mensaje(error, "No se pudo guardar") };
  refresh();
  return {};
}

export async function cambiarEstadoSolicitudPago(id: string, estado: "pendiente" | "aprobada" | "rechazada" | "cancelada", nota?: string): Promise<Resultado> {
  await exigirPermiso("pagos", "ver");
  if (!["pendiente", "aprobada", "rechazada", "cancelada"].includes(estado)) return { error: "Estado inválido" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cambiar_estado_solicitud_pago", { p_id: id, p_estado: estado, p_nota: nota?.slice(0, 1000) ?? null });
  if (error) return { error: mensaje(error, "No se pudo cambiar el estado") };
  refresh();
  return {};
}

const TIPOS_COMPROBANTE: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const esquemaPago = z.object({
  fecha: z.iso.date({ error: "Completá la fecha del pago" }),
  importe: z.number({ error: "Completá el importe" }).positive("El importe tiene que ser mayor a cero").max(1e12),
  medio: z.string().trim().min(1, "Elegí el medio de pago").max(60),
  observacion: z.string().trim().max(500).optional().default(""),
});

/** Registra un pago (total o parcial) con comprobante opcional. No crea movimientos en Financiero. */
export async function registrarPagoSolicitud(id: string, formulario: FormData): Promise<Resultado> {
  await exigirPermiso("pagos", "editar");
  const v = esquemaPago.safeParse({
    fecha: formulario.get("fecha"),
    importe: Number(formulario.get("importe")),
    medio: formulario.get("medio"),
    observacion: formulario.get("observacion") ?? "",
  });
  if (!v.success) return { error: primerError(v.error) };

  const archivo = formulario.get("comprobante");
  let path: string | null = null;
  const admin = crearClienteAdmin();
  if (archivo instanceof File && archivo.size > 0) {
    const ext = TIPOS_COMPROBANTE[archivo.type];
    if (!ext) return { error: "El comprobante tiene que ser PDF o imagen (JPG, PNG)" };
    if (archivo.size > 10 * 1024 * 1024) return { error: "El comprobante pesa más de 10 MB" };
    path = `${id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await admin.storage.from("solicitudes-pago").upload(path, archivo, { contentType: archivo.type });
    if (error) return { error: "No se pudo subir el comprobante" };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("registrar_pago_solicitud", { p_id: id, p: { ...v.data, comprobante_path: path } });
  if (error) {
    if (path) await admin.storage.from("solicitudes-pago").remove([path]);
    return { error: mensaje(error, "No se pudo registrar el pago") };
  }
  refresh();
  return {};
}

export async function quitarPagoSolicitud(pagoId: string): Promise<Resultado> {
  await exigirPermiso("pagos", "editar");
  const supabase = await crearClienteServidor();
  const { data: path, error } = await supabase.rpc("quitar_pago_solicitud", { p_pago_id: pagoId });
  if (error) return { error: mensaje(error, "No se pudo quitar el pago") };
  if (path) await crearClienteAdmin().storage.from("solicitudes-pago").remove([path]);
  refresh();
  return {};
}

/** Marca como leídas las notificaciones del usuario (todas o algunas). */
export async function marcarNotificacionesLeidas(ids?: string[]): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  let consulta = supabase.from("notificaciones").update({ leida: true }).eq("leida", false);
  if (ids?.length) consulta = consulta.in("id", ids);
  const { error } = await consulta;
  if (error) return { error: "No se pudieron marcar" };
  refresh();
  return {};
}
