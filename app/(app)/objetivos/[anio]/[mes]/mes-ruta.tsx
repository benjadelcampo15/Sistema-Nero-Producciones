import Link from "next/link";
import { MESES } from "@/lib/objetivos/tipos";
import { PRIMER_PERIODO_AUTOMATICO, periodo, type Historico } from "@/lib/objetivos/ruta";
import {
  eventosRutaDelMes,
  listarClientesRuta,
  listarColaboradoresRuta,
  mesNuevoRuta,
  mesesRuta,
  resumenAnioRuta,
} from "@/lib/objetivos/ruta-consultas";
import { formatoPesos } from "@/lib/formato";
import { EtiquetaEmpresa } from "@/components/empresa";
import { EditorRuta } from "./editor-ruta";

/** Un mes de los objetivos de Ruta: foto de la planilla (histórico) o cálculo automático. */
export async function MesRuta({ anio, mes, editable }: { anio: number; mes: number; editable: boolean }) {
  const p = periodo(anio, mes);
  const [meses, resumen] = await Promise.all([mesesRuta(anio), resumenAnioRuta(anio)]);
  const fila = meses.get(p);
  // Resultado acumulado del año hasta el mes anterior (el del mes se suma en pantalla).
  const acumuladoAnterior = resumen
    .slice(0, mes - 1)
    .reduce((s, m) => s + (m.modo === "historico" ? m.mensual : m.modo === "automatico" ? m.mensual + m.variable : 0), 0);

  const encabezado = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <Link href={`/objetivos?empresa=ruta&anio=${anio}`} className="text-sm text-stone-500 hover:text-stone-900">← Objetivos {anio}</Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          {MESES[mes - 1]} {anio} <EtiquetaEmpresa empresa="ruta" />
        </h1>
      </div>
      <div className="flex gap-2 text-sm">
        {mes > 1 && <Link href={`/objetivos/${anio}/${mes - 1}?empresa=ruta`} className="boton-secundario">← {MESES[mes - 2]}</Link>}
        {mes < 12 && <Link href={`/objetivos/${anio}/${mes + 1}?empresa=ruta`} className="boton-secundario">{MESES[mes]} →</Link>}
      </div>
    </div>
  );

  if (fila?.modo === "historico") {
    return (
      <div className="space-y-4">
        {encabezado}
        <VistaHistorico h={fila.historico} acumulado={acumuladoAnterior + fila.historico.resultado.rentabilidad} />
      </div>
    );
  }
  if (p < PRIMER_PERIODO_AUTOMATICO) {
    return (
      <div className="space-y-4">
        {encabezado}
        <p className="tarjeta text-center text-sm text-stone-500">No hay datos de este mes en la planilla de Ruta.</p>
      </div>
    );
  }

  const [clientes, colaboradores, eventosEnVivo] = await Promise.all([listarClientesRuta(), listarColaboradoresRuta(), eventosRutaDelMes(anio, mes)]);
  const nuevo = fila?.modo === "automatico" ? null : await mesNuevoRuta(anio, mes, clientes, colaboradores);
  const cerrado = fila?.modo === "automatico" && fila.cerrado;
  const eventos = fila?.modo === "automatico" && fila.eventosAlCierre ? fila.eventosAlCierre : eventosEnVivo;

  return (
    <div className="space-y-4">
      {encabezado}
      <EditorRuta
        key={p}
        anio={anio}
        mes={mes}
        inicial={fila?.modo === "automatico" ? fila.datos : nuevo!.datos}
        copiadoDe={nuevo?.copiadoDe ?? null}
        guardado={!!fila}
        cerrado={cerrado}
        clientes={clientes}
        colaboradores={colaboradores}
        eventos={eventos}
        acumuladoAnterior={Math.round(acumuladoAnterior * 100) / 100}
        editable={editable}
      />
    </div>
  );
}

const formatoPorcentaje = (n: number) => `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n * 100)}%`;
const valor = (n: number | null, tipo: "pesos" | "porcentaje") => (n === null ? "" : tipo === "porcentaje" ? formatoPorcentaje(n) : formatoPesos(n));

const GRUPOS: { id: Historico["secciones"][number]["grupo"]; nombre: string }[] = [
  { id: "ingresos", nombre: "Ingresos" },
  { id: "costos", nombre: "Costos" },
  { id: "variable", nombre: "Rentabilidad variable" },
  { id: "reparto", nombre: "Repartos" },
  { id: "info", nombre: "Referencias (no entran en el resultado)" },
];

/** La foto de una pestaña de la planilla, sin recalcular nada. */
function VistaHistorico({ h, acumulado }: { h: Historico; acumulado: number }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        Histórico de la pestaña <span className="font-medium">“{h.pestana}”</span>. {h.modelo} Los importes son los de la planilla y no se modifican.
      </p>

      {h.observaciones.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <h2 className="font-semibold">Para revisar ({h.observaciones.length})</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {h.observaciones.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Cifra titulo="Total ingresos" valor={h.resultado.ingresos} />
        <Cifra titulo="Total gastos" valor={h.resultado.gastos} />
        <Cifra titulo="Rentabilidad" valor={h.resultado.rentabilidad} nota={h.resultado.formula} />
        <Cifra titulo="Acumulado del año" valor={Math.round(acumulado * 100) / 100} nota={h.anualPlanilla !== null ? `Planilla: ${formatoPesos(h.anualPlanilla)}` : undefined} />
      </div>

      {h.extras.length > 0 && (
        <section className="tarjeta grid gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {h.extras.map((e) => (
            <div key={e.detalle} className="flex justify-between gap-2" title={e.formula}>
              <span className="text-stone-600">{e.detalle}</span>
              <span className={`font-mono ${e.monto !== null && e.monto < 0 ? "text-red-700" : ""}`}>{e.monto === null ? "—" : formatoPesos(e.monto)}</span>
            </div>
          ))}
        </section>
      )}

      {GRUPOS.map((g) => {
        const secciones = h.secciones.filter((s) => s.grupo === g.id && s.filas.length);
        if (!secciones.length) return null;
        return (
          <div key={g.id} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{g.nombre}</h2>
            <div className="grid gap-4 xl:grid-cols-2">
              {secciones.map((s) => (
                <section key={s.titulo} className="tarjeta overflow-x-auto p-0 text-sm">
                  <h3 className="border-b border-stone-200 bg-stone-50 px-3 py-2 font-semibold">{s.titulo}</h3>
                  <table className="w-full">
                    {s.columnas.length > 1 && (
                      <thead className="text-xs text-stone-500">
                        <tr>
                          <th />
                          {s.columnas.map((c) => (
                            <th key={c.titulo} className="px-3 py-1 text-right font-medium">{c.titulo}</th>
                          ))}
                        </tr>
                      </thead>
                    )}
                    <tbody className="divide-y divide-stone-100">
                      {s.filas.map((f, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5">{f.detalle}</td>
                          {f.valores.map((v, j) => (
                            <td key={j} className={`whitespace-nowrap px-3 py-1.5 text-right font-mono ${v !== null && v < 0 ? "text-red-700" : ""}`}>
                              {valor(v, s.columnas[j].tipo)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {s.totales.some((t) => t !== null) && (
                      <tfoot className="border-t border-stone-200 bg-stone-50 font-semibold">
                        <tr>
                          <td className="px-3 py-1.5">Total (planilla)</td>
                          {s.totales.map((t, j) => (
                            <td key={j} className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{valor(t, s.columnas[j].tipo)}</td>
                          ))}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  {s.formulas.length > 0 && <p className="border-t border-stone-100 px-3 py-1.5 font-mono text-[11px] text-stone-500">{s.formulas.join(" · ")}</p>}
                </section>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Cifra({ titulo, valor: v, nota }: { titulo: string; valor: number | null; nota?: string }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{titulo}</p>
      <p className={`mt-1 font-mono text-lg font-semibold ${v !== null && v < 0 ? "text-red-700" : ""}`}>{v === null ? "—" : formatoPesos(v)}</p>
      {nota && <p className="mt-1 break-words font-mono text-[11px] text-stone-500">{nota}</p>}
    </div>
  );
}
