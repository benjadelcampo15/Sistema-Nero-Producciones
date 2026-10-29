import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { leerEmpresa } from "@/lib/empresas";
import { formatoPesos, sumar } from "@/lib/formato";
import { calcularSaldos, leerPeriodo, obtenerLibro } from "@/lib/contabilidad/consultas";
import { SinAcceso } from "../../sin-acceso";
import { Avisos, EncabezadoContabilidad, Importe, Saldo } from "../encabezado";

export default async function PaginaSumasYSaldos({ searchParams }: PageProps<"/contabilidad/sumas">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const params = await searchParams;
  const empresa = leerEmpresa(params.empresa);
  const periodo = leerPeriodo(params, "anio");
  const libro = await obtenerLibro(empresa, periodo.hasta);
  const filas = calcularSaldos(libro, periodo.desde, periodo.hasta).filter((f) => f.inicial || f.debe || f.haber || f.final);

  const raices = filas.filter((f) => f.nivel === 0);
  const debe = sumar(raices.map((f) => f.debe));
  const haber = sumar(raices.map((f) => f.haber));
  const final = sumar(raices.map((f) => f.final));
  const mayor = (id: string) => `/contabilidad/mayor?${new URLSearchParams({ empresa, ...periodo, cuenta: id })}`;

  return (
    <div className="space-y-6">
      <EncabezadoContabilidad
        actual="/contabilidad/sumas"
        empresa={empresa}
        periodo={periodo}
        acciones={<a href={`/contabilidad/exportar?${new URLSearchParams({ vista: "sumas", empresa, ...periodo })}`} className="boton-secundario">Exportar a Excel</a>}
      />
      <Avisos avisos={libro.avisos} />

      <section className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Cuenta</th>
              <th className="px-4 py-3 text-right">Saldo inicial</th>
              <th className="px-4 py-3 text-right">Debe</th>
              <th className="px-4 py-3 text-right">Haber</th>
              <th className="px-4 py-3 text-right">Saldo final</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-stone-500">No hay movimientos.</td>
              </tr>
            )}
            {filas.map((f) => (
              <tr key={f.cuenta.id} className={f.cuenta.imputable ? "hover:bg-stone-50" : "bg-stone-50/60 font-semibold"}>
                <td className="py-1.5 pr-4" style={{ paddingLeft: `${1 + f.nivel * 1.25}rem` }}>
                  <span className="font-mono text-xs text-stone-500">{f.cuenta.codigo}</span>{" "}
                  {f.cuenta.imputable ? (
                    <Link href={mayor(f.cuenta.id)} className="underline decoration-stone-300 hover:decoration-stone-900">{f.cuenta.nombre}</Link>
                  ) : (
                    f.cuenta.nombre
                  )}
                </td>
                <td className="px-4 py-1.5 text-right"><Saldo valor={f.inicial} /></td>
                <td className="px-4 py-1.5 text-right"><Importe valor={f.debe} /></td>
                <td className="px-4 py-1.5 text-right"><Importe valor={f.haber} /></td>
                <td className="px-4 py-1.5 text-right"><Saldo valor={f.final} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-300 font-semibold">
            <tr>
              <td className="px-4 py-3">Totales</td>
              <td />
              <td className="px-4 py-3 text-right"><Importe valor={debe} /></td>
              <td className="px-4 py-3 text-right"><Importe valor={haber} /></td>
              <td className="px-4 py-3 text-right"><Saldo valor={final} /></td>
            </tr>
          </tfoot>
        </table>
      </section>
      <p className={`text-sm ${debe === haber && final === 0 ? "text-green-700" : "text-red-700"}`}>
        {debe === haber && final === 0
          ? "Balancea: el total del debe es igual al del haber."
          : `No balancea: diferencia de ${formatoPesos(sumar([debe, -haber]))}. Revisá los asientos manuales.`}
      </p>
    </div>
  );
}
