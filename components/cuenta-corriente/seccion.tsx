import Link from "next/link";
import { cuentaCorriente } from "@/lib/cuentas/consultas";
import type { TipoCuenta } from "@/lib/cuentas/tipos";
import { NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { BotonAnularPago, FormularioPago } from "./formulario-pago";

/**
 * Cuenta corriente de un proveedor o cliente con una empresa: saldo, registrar
 * un pago y el extracto (debe, haber y saldo).
 */
export async function SeccionCuentaCorriente({
  tipo,
  id,
  empresas,
  empresa,
  href,
  editable,
}: {
  tipo: TipoCuenta;
  id: string;
  /** Las empresas con las que trabaja (una o las dos). */
  empresas: readonly Empresa[];
  empresa: Empresa;
  /** Link a la ficha con otra empresa elegida. */
  href: (empresa: Empresa) => string;
  editable: boolean;
}) {
  const cuenta = await cuentaCorriente(tipo, id, empresa);
  const debe = tipo === "pago" ? "Le debemos" : "Nos debe";

  return (
    <section id="cuenta" className="scroll-mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Cuenta corriente</h2>
        {empresas.length > 1 && (
          <div className="flex rounded-full border border-stone-300 bg-white p-0.5" role="group" aria-label="Empresa">
            {empresas.map((e) => (
              <Link
                key={e}
                href={href(e)}
                scroll={false}
                aria-current={empresa === e ? "page" : undefined}
                className={`rounded-full px-4 py-1 text-sm font-semibold ${empresa === e ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900"}`}
              >
                {NOMBRE_EMPRESA[e]}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`tarjeta p-4 ${cuenta.saldo > 0 ? "border-amber-300 bg-amber-50" : ""}`}>
          <p className="text-xs uppercase tracking-wide text-stone-500">
            {debe} · {NOMBRE_EMPRESA[empresa]}
          </p>
          <p className="mt-1 font-mono text-xl font-semibold">{formatoPesos(cuenta.saldo)}</p>
          <p className="text-xs text-stone-500">
            {cuenta.comprobantes.filter((c) => c.pendiente > 0).length} comprobantes con saldo
          </p>
        </div>
        <div className="tarjeta p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">Facturado</p>
          <p className="mt-1 font-mono text-xl font-semibold">{formatoPesos(cuenta.facturado)}</p>
        </div>
        <div className="tarjeta p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">{tipo === "pago" ? "Pagado" : "Cobrado"}</p>
          <p className="mt-1 font-mono text-xl font-semibold">{formatoPesos(cuenta.pagado)}</p>
        </div>
      </div>

      {editable && <FormularioPago key={empresa} tipo={tipo} id={id} empresa={empresa} comprobantes={cuenta.comprobantes} />}

      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Detalle</th>
              <th className="px-4 py-3 text-right">Debe</th>
              <th className="px-4 py-3 text-right">Haber</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              {editable && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {cuenta.extracto.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-stone-500">
                  Sin movimientos con {NOMBRE_EMPRESA[empresa]}. {tipo === "pago" ? "Las facturas aprobadas de este proveedor aparecen acá." : "Las facturas emitidas a este cliente (con el ingreso en Financiero) aparecen acá."}
                </td>
              </tr>
            )}
            {cuenta.extracto.map((r, i) => (
              <tr key={i} className={r.anulado ? "text-stone-400 line-through" : ""}>
                <td className="whitespace-nowrap px-4 py-2 text-stone-600">{r.fecha ? formatoFecha(r.fecha) : "—"}</td>
                <td className="px-4 py-2">
                  {r.href ? (
                    <Link href={r.href} className="font-medium underline decoration-stone-300 hover:decoration-stone-900">{r.detalle}</Link>
                  ) : (
                    <span className={r.haber || r.anulado ? "text-green-800" : ""}>{r.detalle}</span>
                  )}
                  {r.anulado && <span className="ml-2 text-xs no-underline">(anulado)</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{r.debe ? formatoPesos(r.debe) : ""}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-green-800">{r.haber ? formatoPesos(r.haber) : ""}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono font-semibold">{formatoPesos(r.saldo)}</td>
                {editable && <td className="px-4 py-2 text-right">{r.pagoId && !r.anulado && <BotonAnularPago tipo={tipo} pagoId={r.pagoId} />}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
