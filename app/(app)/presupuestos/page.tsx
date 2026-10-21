import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarPresupuestos } from "@/lib/presupuestos/consultas";
import { COLOR_ESTADO_PRESUPUESTO, NOMBRE_ESTADO_PRESUPUESTO, calcularTotales, estadoVisible, numeroPresupuesto } from "@/lib/presupuestos/tipos";
import { formatoFecha, formatoPesos, hoy } from "@/lib/formato";
import { SinAcceso } from "../sin-acceso";

export default async function PaginaPresupuestos() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "presupuestos", "ver")) return <SinAcceso />;

  const presupuestos = await listarPresupuestos();
  const fechaHoy = hoy();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Presupuestos</h1>
        {puede(usuario, "presupuestos", "editar") && (
          <Link href="/presupuestos/nuevo" className="boton">+ Nuevo presupuesto</Link>
        )}
      </div>

      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Evento</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Seguimiento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {presupuestos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-stone-500">Todavía no hay presupuestos.</td>
              </tr>
            )}
            {presupuestos.map((p) => {
              const estado = estadoVisible(p, fechaHoy);
              const { total } = calcularTotales(p.items, p.modo_iva, p.descuento_pct);
              return (
                <tr key={p.id} className="hover:bg-stone-50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={`/presupuestos/${p.id}`} className="font-medium underline decoration-stone-300 hover:decoration-stone-900">
                      {numeroPresupuesto(p.numero)}
                    </Link>
                    <span className="block text-xs text-stone-500">{formatoFecha(p.fecha)}</span>
                  </td>
                  <td className="px-4 py-3">{p.cliente_nombre}</td>
                  <td className="px-4 py-3 text-stone-600">
                    {p.evento_nombre ?? "—"}
                    {p.evento_fecha && <span className="block text-xs text-stone-500">{formatoFecha(p.evento_fecha)}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono">{formatoPesos(total)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO_PRESUPUESTO[estado]}`}>{NOMBRE_ESTADO_PRESUPUESTO[estado]}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-stone-500">
                    {p.respondido_en
                      ? `Respondió ${formatoFecha(p.respondido_en.slice(0, 10))}`
                      : p.visto_en
                        ? `Visto ${formatoFecha(p.visto_en.slice(0, 10))}`
                        : p.enviado_en
                          ? "Sin abrir"
                          : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
