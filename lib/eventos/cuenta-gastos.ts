import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";

/*
 * Se lee con la clave del servidor (quien edita eventos puede no ver Financiero
 * ni Proveedores): llamar solo después de verificar el permiso del evento.
 */

/** Lo que cada gasto de la planilla tiene pagado desde la cuenta corriente del proveedor, y su proveedor actual. */
export type EstadoCuentaGasto = { pagado: number; proveedor_id: string | null };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Por cada gasto (id del renglón) del evento: lo pagado desde la cuenta
 * corriente (pagos registrados ahí, que descuentan del saldo del gasto) y el
 * proveedor con el que está vinculado en Financiero.
 */
export async function cuentaDeGastos(eventoId: string): Promise<Map<string, EstadoCuentaGasto>> {
  const supabase = crearClienteAdmin();
  const { data: propios } = await supabase
    .from("transacciones")
    .select("id, planilla_ref, proveedor_id, estado, pago_id, monto")
    .eq("evento_id", eventoId)
    .like("planilla_ref", "gasto:%")
    .is("eliminado_en", null);
  const resultado = new Map<string, EstadoCuentaGasto>();
  if (!propios?.length) return resultado;

  const gastoDe = new Map<string, string>();
  for (const t of propios) {
    const [, gasto, parte] = (t.planilla_ref as string).split(":");
    gastoDe.set(t.id, gasto);
    const e = resultado.get(gasto) ?? { pagado: 0, proveedor_id: null };
    if (t.proveedor_id) e.proveedor_id = t.proveedor_id;
    // El saldo pagado entero desde la cuenta corriente.
    if (parte === "resta" && t.pago_id) e.pagado = r2(e.pagado + Number(t.monto));
    resultado.set(gasto, e);
  }

  // Partes pagadas desde la cuenta corriente (cuelgan del saldo del gasto).
  const { data: partes } = await supabase
    .from("transacciones")
    .select("parte_de, monto, estado")
    .in("parte_de", [...gastoDe.keys()])
    .is("planilla_ref", null)
    .is("eliminado_en", null)
    .neq("estado", "pendiente");
  for (const p of partes ?? []) {
    const gasto = gastoDe.get(p.parte_de as string);
    if (!gasto) continue;
    const e = resultado.get(gasto)!;
    e.pagado = r2(e.pagado + Number(p.monto));
  }
  return resultado;
}

/** Proveedores activos que se pueden vincular en un evento de esa empresa (los de esa empresa o de las dos). */
export async function proveedoresParaEvento(empresa: string) {
  const supabase = crearClienteAdmin();
  const { data } = await supabase
    .from("proveedores")
    .select("id, razon_social, cuit, empresa")
    .eq("activo", true)
    .or(`empresa.is.null,empresa.eq.${empresa === "ruta" ? "ruta" : "nero"}`)
    .order("razon_social");
  return (data ?? []).map((p) => ({ id: p.id as string, nombre: p.razon_social as string, cuit: (p.cuit as string | null) ?? null }));
}

/** La planilla como se muestra: la seña / pagado de cada gasto incluye lo pagado desde la cuenta corriente. */
export function conPagosDeCuenta<T extends { gastos: { id?: string; sena: number; pagado_cuenta?: number }[] }>(planilla: T, cuentas: Map<string, EstadoCuentaGasto>): T {
  return {
    ...planilla,
    gastos: planilla.gastos.map((g) => {
      const pagado = (g.id && cuentas.get(g.id)?.pagado) || 0;
      const resto = { ...g };
      delete resto.pagado_cuenta;
      return pagado > 0 ? { ...resto, sena: r2(g.sena + pagado), pagado_cuenta: pagado } : resto;
    }),
  };
}
