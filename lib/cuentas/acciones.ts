"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { EMPRESAS } from "@/lib/empresas";
import { MEDIOS_PAGO } from "@/lib/financiero/tipos";
import { formatoPesos, parsearMonto } from "@/lib/formato";
import type { TipoCuenta } from "./tipos";

/** Quien edita proveedores (pagos) o clientes (cobros), o el Financiero. */
async function exigirPermisoPagos(tipo: TipoCuenta) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, tipo === "pago" ? "facturas" : "facturar", "editar") && !puede(usuario, "financiero", "editar")) {
    throw new Error("No tenés permiso para registrar pagos");
  }
}

const esquemaPago = z.object({
  tipo: z.enum(["pago", "cobro"]),
  id: z.uuid(),
  empresa: z.enum(EMPRESAS),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Falta la fecha"),
  monto: z.string(),
  medio_pago: z.enum(MEDIOS_PAGO, "Elegí el medio de pago"),
  notas: z.string().trim().max(300).optional(),
  movimientos: z.array(z.uuid()).max(500).optional(),
});

/** Registra un pago (o cobro) y lo imputa a los comprobantes elegidos, o a los más viejos. */
export async function registrarPago(datos: z.input<typeof esquemaPago>): Promise<{ error?: string; ok?: string }> {
  const r = esquemaPago.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0].message };
  await exigirPermisoPagos(r.data.tipo);
  const monto = parsearMonto(r.data.monto);
  if (monto === null || monto <= 0) return { error: "Monto inválido. Ejemplo: 150.000" };

  const supabase = await crearClienteServidor();
  const { tipo, id, empresa, fecha, medio_pago, notas, movimientos } = r.data;
  const { error } = await supabase.rpc("registrar_pago", {
    p_pago: { tipo, id, empresa, fecha, monto, medio_pago, notas: notas ?? "" },
    p_movimientos: movimientos?.length ? movimientos : null,
  });
  if (error) return { error: /cero|permiso/.test(error.message) ? error.message : `No se pudo registrar el ${tipo}` };
  refresh();
  return { ok: tipo === "pago" ? "Pago registrado: ya está en Financiero" : "Cobro registrado: ya está en Financiero" };
}

const esquemaCargo = z.object({
  tipo: z.enum(["pago", "cobro"]),
  id: z.uuid(),
  empresa: z.enum(EMPRESAS),
  // Vacía = sin fecha: va así a Financiero (no entra al cashflow hasta que se le ponga).
  fecha: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"), z.literal("")]).transform((v) => v || null),
  monto: z.string(),
  detalle: z.string().trim().min(1, "Escribí qué es (ej. Sonido evento del sábado)").max(200),
  categoria_id: z.uuid("Elegí la categoría"),
});

/** Carga una deuda sin factura en la cuenta corriente: queda pendiente en Financiero. */
export async function cargarDeuda(datos: z.input<typeof esquemaCargo>): Promise<{ error?: string; ok?: string }> {
  const r = esquemaCargo.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0].message };
  await exigirPermisoPagos(r.data.tipo);
  const monto = parsearMonto(r.data.monto);
  if (monto === null || monto <= 0) return { error: "Monto inválido. Ejemplo: 150.000" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cargar_cuenta_con_saldo", { p_cargo: { ...r.data, monto } });
  if (error) return { error: error.message.includes("permiso") ? error.message : "No se pudo cargar la deuda" };
  refresh();
  return { ok: "Movimiento cargado: ya está en Financiero como pendiente" };
}

const esquemaEdicion = esquemaCargo.pick({ fecha: true, monto: true, detalle: true, categoria_id: true });

/** Edita un movimiento a mano (detalle, importe, fecha, categoría). Con pagos, el importe no puede quedar por debajo de lo pagado. */
export async function editarCargo(tipo: TipoCuenta, transaccionId: string, datos: z.input<typeof esquemaEdicion>): Promise<{ error?: string }> {
  await exigirPermisoPagos(tipo);
  const r = esquemaEdicion.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0].message };
  if (!/^[0-9a-f-]{36}$/i.test(transaccionId)) return { error: "Movimiento inválido" };
  const monto = parsearMonto(r.data.monto);
  if (monto === null || monto <= 0) return { error: "Monto inválido. Ejemplo: 150.000" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("editar_cargo_cuenta", { p_transaccion_id: transaccionId, p_cambios: { ...r.data, monto } });
  if (error) return { error: /existe|permiso|pagaron|pagados|mayor a cero|planilla/.test(error.message) ? mensajeBase(error.message) : "No se pudo guardar el movimiento" };
  refresh();
  return {};
}

/** Elimina un movimiento a mano que todavía no tiene pagos (también de Financiero). */
export async function borrarCargo(tipo: TipoCuenta, transaccionId: string): Promise<{ error?: string }> {
  await exigirPermisoPagos(tipo);
  if (!/^[0-9a-f-]{36}$/i.test(transaccionId)) return { error: "Cargo inválido" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("borrar_cargo_cuenta", { p_transaccion_id: transaccionId });
  if (error) return { error: /pagos|pagada|permiso|existe|planilla/.test(error.message) ? error.message : "No se pudo eliminar" };
  refresh();
  return {};
}

/**
 * Elimina un pago: deja de verse en la cuenta y lo que cubría vuelve a quedar
 * pendiente (también en Financiero). Internamente queda guardado como anulado, para auditoría.
 */
export async function eliminarPago(tipo: TipoCuenta, pagoId: string): Promise<{ error?: string }> {
  await exigirPermisoPagos(tipo);
  if (!/^[0-9a-f-]{36}$/i.test(pagoId)) return { error: "Pago inválido" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("eliminar_pago", { p_pago_id: pagoId });
  if (error) return { error: /anulado|permiso/.test(error.message) ? "El pago ya no existe (actualizá la página)" : "No se pudo eliminar" };
  refresh();
  return {};
}

const esquemaEdicionPago = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Falta la fecha"),
  monto: z.string(),
  medio_pago: z.enum(MEDIOS_PAGO, "Elegí el medio de pago"),
  notas: z.string().trim().max(300),
});

/** Edita un pago (fecha, importe, medio y nota): se vuelve a imputar, primero a lo que cubría. */
export async function editarPago(tipo: TipoCuenta, pagoId: string, datos: z.input<typeof esquemaEdicionPago>): Promise<{ error?: string }> {
  await exigirPermisoPagos(tipo);
  const r = esquemaEdicionPago.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0].message };
  if (!/^[0-9a-f-]{36}$/i.test(pagoId)) return { error: "Pago inválido" };
  const monto = parsearMonto(r.data.monto);
  if (monto === null || monto <= 0) return { error: "Importe inválido. Ejemplo: 150.000" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("editar_pago", { p_pago_id: pagoId, p_cambios: { ...r.data, monto } });
  if (error) return { error: /existe|eliminado|permiso/.test(error.message) ? error.message : "No se pudo guardar el pago" };
  refresh();
  return {};
}

/** Los importes de la base vienen como "1,234,567.00": se muestran como "$ 1.234.567,00". */
function mensajeBase(mensaje: string) {
  return mensaje.replace(/\$([\d,]+\.\d{2})/g,(_, n: string) => formatoPesos(Number(n.replace(/,/g, ""))));
}

/** Aplica el saldo a favor de la cuenta (lo pagado de más) a lo que esté pendiente. */
export async function aplicarSaldoAFavor(tipo: TipoCuenta, id: string, empresa: string): Promise<{ error?: string; ok?: string }> {
  await exigirPermisoPagos(tipo);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !EMPRESAS.includes(empresa as never)) return { error: "Datos inválidos" };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("aplicar_saldo_a_favor", { p_tipo: tipo, p_id: id, p_empresa: empresa });
  if (error) return { error: "No se pudo aplicar el saldo a favor" };
  refresh();
  const aplicado = Number(data ?? 0);
  return { ok: aplicado > 0 ? `Se aplicaron ${formatoPesos(aplicado)} del saldo a favor` : "No había nada pendiente para aplicar" };
}
