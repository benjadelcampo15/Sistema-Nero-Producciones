import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { leerEmpresa } from "@/lib/empresas";
import { formatoFecha, sumar } from "@/lib/formato";
import { leerPeriodo, obtenerLibro } from "@/lib/contabilidad/consultas";
import { SinAcceso } from "../sin-acceso";
import { Avisos, EncabezadoContabilidad, Importe, hrefOrigen } from "./encabezado";

const ORIGEN = { movimiento: "Financiero", cheque: "Cheque", manual: "Manual" } as const;


export default async function PaginaLibroDiario({ searchParams }: PageProps<"/contabilidad">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "financiero", "editar");
  const params = await searchParams;
  const empresa = leerEmpresa(params.empresa);
  const periodo = leerPeriodo(params, "mes");
  const libro = await obtenerLibro(empresa, periodo.hasta);

  // Número de asiento dentro del ejercicio (año calendario), en orden de fecha.
  const numero = new Map<string, number>();
  const porAnio = new Map<string, number>();
  for (const a of libro.asientos) {
    const anio = a.fecha.slice(0, 4);
    const n = (porAnio.get(anio) ?? 0) + 1;
    porAnio.set(anio, n);
    numero.set(a.id, n);
  }
  const asientos = libro.asientos.filter((a) => a.fecha >= periodo.desde);
  const totalDebe = sumar(asientos.flatMap((a) => a.lineas.map((l) => l.debe)));
  const totalHaber = sumar(asientos.flatMap((a) => a.lineas.map((l) => l.haber)));
  const consulta = new URLSearchParams({ empresa, ...periodo }).toString();

  return (
    <div className="space-y-6">
      <EncabezadoContabilidad
        actual="/contabilidad"
        empresa={empresa}
        periodo={periodo}
        acciones={
          <>
            <a href={`/contabilidad/exportar?vista=diario&${consulta}`} className="boton-secundario">Exportar a Excel</a>
            {editable && <Link href={`/contabilidad/asientos/nuevo?empresa=${empresa}`} className="boton">+ Asiento manual</Link>}
          </>
        }
      />

      <p className="text-sm text-stone-500">
        Los asientos de Financiero se arman solos con cada movimiento real o pendiente (y los cheques debitados o cobrados). Para cambiar uno, editá el movimiento; para
        cambiar a qué cuenta va, usá Imputación. Los manuales son para apertura, ajustes, amortizaciones o lo que no pasa por Financiero.
      </p>

      <Avisos avisos={libro.avisos} />

      <section className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Cuenta</th>
              <th className="px-4 py-3 text-right">Debe</th>
              <th className="px-4 py-3 text-right">Haber</th>
            </tr>
          </thead>
          {asientos.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-stone-500">No hay asientos en este período.</td>
              </tr>
            </tbody>
          )}
          {asientos.map((a) => (
            <tbody key={a.id} className="border-b border-stone-200">
              <tr className="bg-stone-50/60">
                <td colSpan={3} className="px-4 pb-1 pt-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-xs text-stone-500">N° {numero.get(a.id)}</span>
                    <span className="font-medium">{formatoFecha(a.fecha)}</span>
                    <Link href={hrefOrigen(a)} className="underline decoration-stone-300 hover:decoration-stone-900">{a.descripcion}</Link>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${a.origen === "manual" ? "bg-violet-100 text-violet-800" : "bg-stone-200 text-stone-700"}`}>
                      {ORIGEN[a.origen]}
                    </span>
                    {a.nota && <span className="text-xs text-stone-500">{a.nota}</span>}
                  </div>
                </td>
              </tr>
              {a.lineas.map((l, i) => {
                const cuenta = libro.cuentaPorId.get(l.cuenta_id);
                return (
                  <tr key={i}>
                    <td className={`py-1 pr-4 ${l.haber ? "pl-12" : "pl-6"}`}>
                      <span className="font-mono text-xs text-stone-500">{cuenta?.codigo}</span> {cuenta?.nombre ?? "Cuenta borrada"}
                      {l.detalle && <span className="text-xs text-stone-500"> · {l.detalle}</span>}
                    </td>
                    <td className="px-4 py-1 text-right"><Importe valor={l.debe} /></td>
                    <td className="px-4 py-1 text-right"><Importe valor={l.haber} /></td>
                  </tr>
                );
              })}
            </tbody>
          ))}
          <tfoot className="border-t-2 border-stone-300 font-semibold">
            <tr>
              <td className="px-4 py-3">Totales · {asientos.length} asientos</td>
              <td className="px-4 py-3 text-right"><Importe valor={totalDebe} /></td>
              <td className="px-4 py-3 text-right"><Importe valor={totalHaber} /></td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
