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
  if (error) {
    // "sobran $699,999.00" (formato de la base) → "sobran $ 699.999,00".
    const sobra = error.message.match(/sobran \$([\d,.]+)/);
    if (sobra) return { error: `El monto supera lo pendiente: sobran ${formatoPesos(Number(sobra[1].replace(/,/g, "")))}` };
    return { error: /cero|permiso/.test(error.message) ? error.message : `No se pudo registrar el ${tipo}` };
  }
  refresh();
  return { ok: tipo === "pago" ? "Pago registrado: ya está en Financiero" : "Cobro registrado: ya está en Financiero" };
}

const esquemaCargo = z.object({
  tipo: z.enum(["pago", "cobro"]),
  id: z.uuid(),
  empresa: z.enum(EMPRESAS),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Falta la fecha"),
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
  const { error } = await supabase.rpc("cargar_cuenta", { p_cargo: { ...r.data, monto } });
  if (error) return { error: error.message.includes("permiso") ? error.message : "No se pudo cargar la deuda" };
  refresh();
  return { ok: "Deuda cargada: ya está en Financiero como pendiente" };
}

/** Borra un cargo a mano que todavía no tiene pagos. */
export async function borrarCargo(tipo: TipoCuenta, transaccionId: string): Promise<{ error?: string }> {
  await exigirPermisoPagos(tipo);
  if (!/^[0-9a-f-]{36}$/i.test(transaccionId)) return { error: "Cargo inválido" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("borrar_cargo", { p_transaccion_id: transaccionId });
  if (error) return { error: /pagos|permiso/.test(error.message) ? error.message : "No se pudo borrar" };
  refresh();
  return {};
}

/** Anula un pago: lo que cubría vuelve a quedar pendiente (también en Financiero). */
export async function anularPago(tipo: TipoCuenta, pagoId: string): Promise<{ error?: string }> {
  await exigirPermisoPagos(tipo);
  if (!/^[0-9a-f-]{36}$/i.test(pagoId)) return { error: "Pago inválido" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("anular_pago", { p_pago_id: pagoId });
  if (error) return { error: error.message.includes("anulado") ? error.message : "No se pudo anular" };
  refresh();
  return {};
}
