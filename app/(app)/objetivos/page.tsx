import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { aniosConDatos, mesesDelAnio } from "@/lib/objetivos/consultas";
import { MESES, calcularMes } from "@/lib/objetivos/tipos";
import { formatoPesos, hoy } from "@/lib/formato";
import { SinAcceso } from "../sin-acceso";
import { AlternarEmpresa } from "@/components/empresa";
import { leerEmpresa } from "@/lib/empresas";
import { AnioRuta } from "./anio-ruta";

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);

export default async function PaginaObjetivos({ searchParams }: PageProps<"/objetivos">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "objetivos", "ver")) return <SinAcceso />;

  const { anio: anioParam, empresa: parametroEmpresa } = await searchParams;
  const empresa = leerEmpresa(parametroEmpresa);
  const anioActual = Number(hoy().slice(0, 4));
  const anio = Number(anioParam) >= 2000 && Number(anioParam) <= 2100 ? Number(anioParam) : anioActual;
  // Ruta tiene su propio modelo (fees por cliente, sueldos por porcentaje, one shots y eventos).
  if (empresa === "ruta") return <AnioRuta anio={anio} />;
  const [meses, anios] = await Promise.all([mesesDelAnio(empresa, anio), aniosConDatos(empresa)]);
  const opciones = [...new Set([...anios, anioActual, anioActual + 1])].sort((a, b) => b - a);
  const mesActual = anio === anioActual ? Number(hoy().slice(5, 7)) : null;

  const filas: { mes: number; nombre: string; c: ReturnType<typeof calcularMes> | null; acumulado: number | null }[] = [];
  let acumulado = 0;
  for (const [i, nombre] of MESES.entries()) {
    const datos = meses.get(i + 1);
    const c = datos ? calcularMes(datos) : null;
    if (c) acumulado += c.final;
    filas.push({ mes: i + 1, nombre, c, acumulado: c ? acumulado : null });
  }
  const conDatos = filas.filter((f) => f.c);
  const total = {
    ingreso: conDatos.reduce((s, f) => s + f.c!.ingreso, 0),
    costos: conDatos.reduce((s, f) => s + f.c!.costos, 0),
    final: conDatos.reduce((s, f) => s + f.c!.final, 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">Objetivos</h1>
            <AlternarEmpresa actual={empresa} href={(e) => `/objetivos?empresa=${e}&anio=${anio}`} />
          </div>
          <p className="text-sm text-stone-500">Análisis mensual de rentabilidad: ingresos, costos, ratios y distribución.</p>
        </div>
        <div className="flex gap-1">
          {opciones.map((a) => (
            <Link
              key={a}
              href={`/objetivos?empresa=${empresa}&anio=${a}`}
              className={`rounded-md border px-3 py-1.5 text-sm ${a === anio ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white hover:border-stone-900"}`}
            >
              {a}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="tarjeta">
          <p className="text-xs uppercase tracking-wide text-stone-500">Ingresos {anio}</p>
          <p className="mt-1 font-mono text-xl font-semibold text-green-700">{formatoPesos(total.ingreso)}</p>
        </div>
        <div className="tarjeta">
          <p className="text-xs uppercase tracking-wide text-stone-500">Costos {anio}</p>
          <p className="mt-1 font-mono text-xl font-semibold text-red-700">{formatoPesos(total.costos)}</p>
        </div>
        <div className="tarjeta">
          <p className="text-xs uppercase tracking-wide text-stone-500">Rentabilidad anual</p>
          <p className={`mt-1 font-mono text-xl font-semibold ${total.final < 0 ? "text-red-700" : ""}`}>{formatoPesos(total.final)}</p>
          <p className="text-xs text-stone-500">{pct(total.ingreso ? total.final / total.ingreso : null)} sobre ventas</p>
        </div>
      </div>

      <section className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Mes</th>
              <th className="px-4 py-3 text-right">Ingresos</th>
              <th className="px-4 py-3 text-right">Costos</th>
              <th className="px-4 py-3 text-right">Rentabilidad</th>
              <th className="px-4 py-3 text-right">% s/ ventas</th>
              <th className="px-4 py-3 text-right">Acumulada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filas.map((f) => (
              <tr key={f.mes} className={f.mes === mesActual ? "bg-amber-50/60" : "hover:bg-stone-50"}>
                <td className="px-4 py-2">
                  <Link href={`/objetivos/${anio}/${f.mes}?empresa=${empresa}`} className="font-medium underline decoration-stone-300 hover:decoration-stone-900">
                    {f.nombre}
                  </Link>
                  {!f.c && <span className="ml-2 text-xs text-stone-400">sin cargar</span>}
                </td>
                <td className="px-4 py-2 text-right font-mono text-green-700">{f.c ? formatoPesos(f.c.ingreso) : ""}</td>
                <td className="px-4 py-2 text-right font-mono text-red-700">{f.c ? formatoPesos(f.c.costos) : ""}</td>
                <td className={`px-4 py-2 text-right font-mono font-medium ${f.c && f.c.final < 0 ? "text-red-700" : ""}`}>{f.c ? formatoPesos(f.c.final) : ""}</td>
                <td className="px-4 py-2 text-right font-mono text-stone-600">{f.c ? pct(f.c.ratios.at(-1)!.valor) : ""}</td>
                <td className={`px-4 py-2 text-right font-mono ${f.acumulado !== null && f.acumulado < 0 ? "text-red-700" : "text-stone-600"}`}>
                  {f.acumulado !== null ? formatoPesos(f.acumulado) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
