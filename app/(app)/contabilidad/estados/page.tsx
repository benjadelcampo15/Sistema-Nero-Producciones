import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { leerEmpresa } from "@/lib/empresas";
import { formatoFecha, formatoPesos, sumar } from "@/lib/formato";
import { calcularSaldos, leerPeriodo, obtenerLibro, type FilaSaldo } from "@/lib/contabilidad/consultas";
import { SinAcceso } from "../../sin-acceso";
import { Avisos, EncabezadoContabilidad, Importe } from "../encabezado";

export default async function PaginaEstados({ searchParams }: PageProps<"/contabilidad/estados">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const params = await searchParams;
  const empresa = leerEmpresa(params.empresa);
  const periodo = leerPeriodo(params, "anio");
  const libro = await obtenerLibro(empresa, periodo.hasta);

  // Resultados: lo que se movió en el período. Ingresos en positivo (haber − debe), egresos en positivo (debe − haber).
  const delPeriodo = calcularSaldos(libro, periodo.desde, periodo.hasta);
  const resultados = (raiz: string, signo: 1 | -1) =>
    delPeriodo
      .filter((f) => f.cuenta.codigo === raiz || f.cuenta.codigo.startsWith(`${raiz}.`))
      .map((f) => ({ fila: f, valor: sumar([f.debe, -f.haber]) * signo }))
      .filter((x) => x.valor);
  const ingresos = resultados("4", -1);
  const egresos = resultados("5", 1);
  const totalIngresos = ingresos.find((x) => x.fila.nivel === 0)?.valor ?? 0;
  const totalEgresos = egresos.find((x) => x.fila.nivel === 0)?.valor ?? 0;
  const resultado = sumar([totalIngresos, -totalEgresos]);

  // Situación patrimonial al cierre del período, con el resultado del ejercicio en curso.
  const anio = periodo.hasta.slice(0, 4);
  const alCierre = calcularSaldos(libro, `${anio}-01-01`, periodo.hasta);
  const saldo = (codigo: string) => alCierre.find((f) => f.cuenta.codigo === codigo)?.final ?? 0;
  const patrimonio = (raiz: string, signo: 1 | -1) =>
    alCierre
      .filter((f) => f.cuenta.codigo === raiz || f.cuenta.codigo.startsWith(`${raiz}.`))
      .map((f) => ({ fila: f, valor: f.final * signo }))
      .filter((x) => x.valor);
  const activo = saldo("1");
  const pasivo = -saldo("2");
  const pn = -saldo("3");
  const resultadoEjercicio = -sumar([saldo("4"), saldo("5")]);
  const diferencia = sumar([activo, -pasivo, -pn, -resultadoEjercicio]);

  return (
    <div className="space-y-6">
      <EncabezadoContabilidad actual="/contabilidad/estados" empresa={empresa} periodo={periodo} />
      <Avisos avisos={libro.avisos} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Cifra titulo="Ingresos del período" valor={totalIngresos} />
        <Cifra titulo="Egresos del período" valor={totalEgresos} />
        <Cifra titulo={resultado >= 0 ? "Ganancia" : "Pérdida"} valor={resultado} color={resultado >= 0 ? "text-green-700" : "text-red-700"} />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          Estado de resultados <span className="text-sm font-normal text-stone-500">· {formatoFecha(periodo.desde)} al {formatoFecha(periodo.hasta)}</span>
        </h2>
        <div className="tarjeta overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-sm">
            <tbody className="divide-y divide-stone-100">
              <Filas filas={ingresos} />
              <Filas filas={egresos} />
            </tbody>
            <tfoot className="border-t-2 border-stone-300 font-semibold">
              <tr>
                <td className="px-4 py-3">Resultado del período</td>
                <td className={`px-4 py-3 text-right font-mono ${resultado < 0 ? "text-red-700" : ""}`}>{formatoPesos(resultado)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          Situación patrimonial <span className="text-sm font-normal text-stone-500">· al {formatoFecha(periodo.hasta)}</span>
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="tarjeta overflow-x-auto p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-stone-100">
                <Filas filas={patrimonio("1", 1)} />
              </tbody>
              <tfoot className="border-t-2 border-stone-300 font-semibold">
                <tr>
                  <td className="px-4 py-3">Total activo</td>
                  <td className="px-4 py-3 text-right font-mono">{formatoPesos(activo)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="tarjeta overflow-x-auto p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-stone-100">
                <Filas filas={patrimonio("2", -1)} />
                <Filas filas={patrimonio("3", -1)} />
                <tr className="bg-stone-50/60 font-semibold">
                  <td className="px-4 py-1.5">Resultado del ejercicio {anio}</td>
                  <td className={`px-4 py-1.5 text-right font-mono ${resultadoEjercicio < 0 ? "text-red-700" : ""}`}>{formatoPesos(resultadoEjercicio)}</td>
                </tr>
              </tbody>
              <tfoot className="border-t-2 border-stone-300 font-semibold">
                <tr>
                  <td className="px-4 py-3">Total pasivo + patrimonio neto</td>
                  <td className="px-4 py-3 text-right font-mono">{formatoPesos(sumar([pasivo, pn, resultadoEjercicio]))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        {diferencia !== 0 && <p className="alerta-error">El activo no es igual al pasivo más el patrimonio neto: diferencia de {formatoPesos(diferencia)}.</p>}
        <p className="text-xs text-stone-500">
          Es un estado de gestión armado con lo cargado en Financiero: para que refleje la realidad hace falta un asiento de apertura con los saldos iniciales (bancos,
          deudas, capital) y que los movimientos tengan fecha y medio de pago.
        </p>
      </section>
    </div>
  );
}

function Filas({ filas }: { filas: { fila: FilaSaldo; valor: number }[] }) {
  return filas.map(({ fila, valor }) => (
    <tr key={fila.cuenta.id} className={fila.cuenta.imputable ? "" : "bg-stone-50/60 font-semibold"}>
      <td className="py-1.5 pr-4" style={{ paddingLeft: `${1 + fila.nivel * 1.25}rem` }}>
        <span className="font-mono text-xs text-stone-500">{fila.cuenta.codigo}</span> {fila.cuenta.nombre}
      </td>
      <td className={`px-4 py-1.5 text-right ${valor < 0 ? "text-red-700" : ""}`}>
        {valor < 0 && <span className="font-mono">−</span>}
        <Importe valor={Math.abs(valor)} />
      </td>
    </tr>
  ));
}

function Cifra({ titulo, valor, color = "" }: { titulo: string; valor: number; color?: string }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{titulo}</p>
      <p className={`mt-1 font-mono text-xl font-semibold ${color}`}>{formatoPesos(Math.abs(valor))}</p>
    </div>
  );
}
