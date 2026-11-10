import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { NOMBRE_EMPRESA } from "@/lib/empresas";
import { datosParaSubir, listarReglas, listarResumenes } from "@/lib/tarjetas/consultas";
import { formatoDolares, mesDelResumen } from "@/lib/tarjetas/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../sin-acceso";
import { SubidaResumen } from "./subida";
import { ListaReglas } from "./reglas";

// La lectura del PDF con la IA puede tardar (resúmenes largos o reintentos con otro modelo).
export const maxDuration = 300;

export default async function PaginaTarjetas() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "financiero", "editar");
  const [resumenes, reglas, subir] = await Promise.all([listarResumenes(), listarReglas(), datosParaSubir()]);

  const total = resumenes.reduce(
    (t, r) => ({
      nero: t.nero + r.totales.empresa.nero,
      ruta: t.ruta + r.totales.empresa.ruta,
      cargosNero: t.cargosNero + r.totales.cargos.nero,
      cargosRuta: t.cargosRuta + r.totales.cargos.ruta,
    }),
    { nero: 0, ruta: 0, cargosNero: 0, cargosRuta: 0 },
  );
  const anios = [...new Set(resumenes.map((r) => r.fecha_cierre.slice(0, 4)))];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tarjetas de crédito</h1>
          <p className="text-sm text-stone-500">
            Subí el resumen mensual del banco: se leen los consumos y los impuestos, cada consumo se asigna a {NOMBRE_EMPRESA.nero} o {NOMBRE_EMPRESA.ruta} (las
            asignaciones se recuerdan para los meses siguientes) y los cargos generales se reparten entre las dos.
          </p>
        </div>
        {resumenes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {anios.map((a) => (
              <a key={a} href={`/tarjetas/excel?anio=${a}`} className="boton-secundario">Excel {anios.length > 1 ? a : ""}</a>
            ))}
          </div>
        )}
      </div>

      {editable && <SubidaResumen tarjetas={subir.tarjetas} cotizacion={subir.cotizacion} />}

      <section className="space-y-2">
        <h2 className="font-semibold">Resumen general</h2>
        <div className="tarjeta overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Mes</th>
                <th className="px-4 py-3 text-right">{NOMBRE_EMPRESA.nero}</th>
                <th className="px-4 py-3 text-right">{NOMBRE_EMPRESA.ruta}</th>
                <th className="px-4 py-3 text-right">Sin asignar</th>
                <th className="px-4 py-3 text-right">Cargos ({NOMBRE_EMPRESA.nero} / {NOMBRE_EMPRESA.ruta})</th>
                <th className="px-4 py-3 text-right">Cotización</th>
                <th className="px-4 py-3">Control</th>
                <th className="px-4 py-3">Financiero</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {resumenes.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-stone-500">Todavía no se subió ningún resumen.</td>
                </tr>
              )}
              {resumenes.map((r) => {
                const sin = r.totales.consumos.sin;
                return (
                  <tr key={r.id} className="hover:bg-stone-50">
                    <td className="px-4 py-2">
                      <Link href={`/tarjetas/${r.id}`} className="font-medium underline decoration-stone-300 hover:decoration-stone-900">
                        {mesDelResumen(r.fecha_cierre)}
                      </Link>
                      <p className="text-xs text-stone-500">
                        {r.tarjeta} · cierre {formatoFecha(r.fecha_cierre)}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{formatoPesos(r.totales.empresa.nero)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{formatoPesos(r.totales.empresa.ruta)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono">
                      {sin.cantidad ? (
                        <span className="text-amber-700">
                          {sin.cantidad} · {formatoPesos(sin.pesos)}
                          {sin.dolares ? ` · ${formatoDolares(sin.dolares)}` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-stone-600">
                      {formatoPesos(r.totales.cargos.nero)} / {formatoPesos(r.totales.cargos.ruta)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono">
                      {r.cotizacion_usd ? formatoPesos(r.cotizacion_usd) : r.totales.faltaCotizacion ? <span className="text-amber-700">Falta</span> : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {r.controlOk === null ? (
                        <span className="text-xs text-stone-500">Sin totales</span>
                      ) : r.controlOk ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Cierra</span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">No cierra</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {r.financiero_en ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Pasado</span>
                      ) : (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">No</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {resumenes.length > 1 && (
              <tfoot className="border-t border-stone-200 bg-stone-50 font-semibold">
                <tr>
                  <td className="px-4 py-2">Total</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{formatoPesos(total.nero)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{formatoPesos(total.ruta)}</td>
                  <td />
                  <td className="whitespace-nowrap px-4 py-2 text-right font-mono">
                    {formatoPesos(total.cargosNero)} / {formatoPesos(total.cargosRuta)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="text-xs text-stone-500">
          Lo de cada empresa son sus consumos (los dólares a la cotización del mes) más su parte de los impuestos y cargos.
        </p>
      </section>

      <ListaReglas reglas={reglas} editable={editable} />
    </div>
  );
}
