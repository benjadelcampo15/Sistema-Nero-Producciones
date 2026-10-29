import Link from "next/link";
import { aniosRuta, resumenAnioRuta } from "@/lib/objetivos/ruta-consultas";
import { MESES } from "@/lib/objetivos/tipos";
import { formatoPesos, hoy } from "@/lib/formato";
import { AlternarEmpresa } from "@/components/empresa";
import { NOMBRE_EMPRESA } from "@/lib/empresas";

/** Objetivos de Ruta: un año, mes a mes (histórico de la planilla hasta septiembre 2026, automático desde octubre). */
export async function AnioRuta({ anio }: { anio: number }) {
  const anioActual = Number(hoy().slice(0, 4));
  const [meses, anios] = await Promise.all([resumenAnioRuta(anio), aniosRuta()]);
  const opciones = [...new Set([...anios, anioActual, anioActual + 1])].sort((a, b) => b - a);
  const mesActual = anio === anioActual ? Number(hoy().slice(5, 7)) : null;

  const totales = meses.map((m) => (m.modo === "historico" ? m.mensual : m.modo === "automatico" ? m.mensual + m.variable : null));
  const filas = meses.map((m, i) => {
    const total = totales[i];
    const acumulado = Math.round(totales.slice(0, i + 1).reduce<number>((s, t) => s + (t ?? 0), 0) * 100) / 100;
    return { ...m, mes: i + 1, total, acumulado: total !== null ? acumulado : null };
  });
  const conDatos = filas.filter((f) => f.total !== null);
  const sumaDe = (fn: (f: (typeof filas)[number]) => number) => Math.round(conDatos.reduce((s, f) => s + fn(f), 0) * 100) / 100;
  const anual = sumaDe((f) => f.total ?? 0);
  const variable = sumaDe((f) => (f.modo === "automatico" ? f.variable : 0));
  const caja = sumaDe((f) => (f.modo === "automatico" ? f.cajaEstructura : 0));
  const observaciones = sumaDe((f) => ("observaciones" in f ? (f.observaciones ?? 0) : 0));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">Objetivos</h1>
            <AlternarEmpresa actual="ruta" href={(e) => `/objetivos?empresa=${e}&anio=${anio}`} />
          </div>
          <p className="text-sm text-stone-500">
            Hasta septiembre 2026: lo que dice la planilla, sin recalcular. Desde octubre 2026: fees, sueldos, one shots, gastos y repartos calculados por la app.
          </p>
        </div>
        <div className="flex gap-1">
          {opciones.map((a) => (
            <Link
              key={a}
              href={`/objetivos?empresa=ruta&anio=${a}`}
              className={`rounded-md border px-3 py-1.5 text-sm ${a === anio ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white hover:border-stone-900"}`}
            >
              {a}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="tarjeta">
          <p className="text-xs uppercase tracking-wide text-stone-500">Rentabilidad anual {anio}</p>
          <p className={`mt-1 font-mono text-xl font-semibold ${anual < 0 ? "text-red-700" : ""}`}>{formatoPesos(anual)}</p>
          <p className="text-xs text-stone-500">Suma del resultado de cada mes (mensual + variable)</p>
        </div>
        <div className="tarjeta">
          <p className="text-xs uppercase tracking-wide text-stone-500">Rentabilidad variable (desde octubre)</p>
          <p className={`mt-1 font-mono text-xl font-semibold ${variable < 0 ? "text-red-700" : ""}`}>{formatoPesos(variable)}</p>
          <p className="text-xs text-stone-500">Balance de los eventos de {NOMBRE_EMPRESA.ruta}</p>
        </div>
        <div className="tarjeta">
          <p className="text-xs uppercase tracking-wide text-stone-500">Caja estructura (desde octubre)</p>
          <p className="mt-1 font-mono text-xl font-semibold">{formatoPesos(caja)}</p>
          {observaciones > 0 && <p className="text-xs font-medium text-amber-700">{observaciones} observaciones para revisar en el año</p>}
        </div>
      </div>

      <section className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Mes</th>
              <th className="px-4 py-3">Origen</th>
              <th className="px-4 py-3 text-right">Rent. mensual</th>
              <th className="px-4 py-3 text-right">Rent. variable</th>
              <th className="px-4 py-3 text-right">Resultado del mes</th>
              <th className="px-4 py-3 text-right">Acumulado</th>
              <th className="px-4 py-3">Revisar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filas.map((f) => (
              <tr key={f.periodo} className={f.mes === mesActual ? "bg-amber-50/60" : "hover:bg-stone-50"}>
                <td className="px-4 py-2">
                  {f.modo === "sin_datos" ? (
                    <span className="text-stone-400">{MESES[f.mes - 1]}</span>
                  ) : (
                    <Link href={`/objetivos/${anio}/${f.mes}?empresa=ruta`} className="font-medium underline decoration-stone-300 hover:decoration-stone-900">
                      {MESES[f.mes - 1]}
                    </Link>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-stone-600">
                  {f.modo === "historico"
                    ? "Planilla (histórico)"
                    : f.modo === "automatico"
                      ? `Automático${f.cerrado ? " · cerrado" : " · abierto"}`
                      : f.modo === "sin_cargar"
                        ? "Sin cargar"
                        : "—"}
                </td>
                <td className={`px-4 py-2 text-right font-mono ${"mensual" in f && (f.mensual ?? 0) < 0 ? "text-red-700" : ""}`}>{"mensual" in f && f.mensual !== undefined ? formatoPesos(f.mensual) : ""}</td>
                <td className="px-4 py-2 text-right font-mono text-stone-600">
                  {f.modo === "automatico" ? formatoPesos(f.variable) : f.modo === "historico" ? <span className="text-xs">incluida</span> : ""}
                </td>
                <td className={`px-4 py-2 text-right font-mono font-medium ${f.total !== null && f.total < 0 ? "text-red-700" : ""}`}>{f.total !== null ? formatoPesos(f.total) : ""}</td>
                <td className={`px-4 py-2 text-right font-mono ${f.acumulado !== null && f.acumulado < 0 ? "text-red-700" : "text-stone-600"}`}>
                  {f.acumulado !== null ? formatoPesos(f.acumulado) : ""}
                </td>
                <td className="px-4 py-2 text-xs">
                  {"observaciones" in f && f.observaciones ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">{f.observaciones}</span> : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-stone-500">
        En el histórico, la rentabilidad variable ya está dentro del resultado mensual de la planilla. Desde octubre se calculan por separado y el resultado del mes es la suma de las dos.
      </p>
    </div>
  );
}
