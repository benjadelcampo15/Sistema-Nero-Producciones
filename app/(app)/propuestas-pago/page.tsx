import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarPropuestas } from "@/lib/propuestas/consultas";
import { COLOR_ESTADO_PROPUESTA, ESTADOS_PROPUESTA, NOMBRE_ESTADO_PROPUESTA, type EstadoPropuesta } from "@/lib/propuestas/tipos";
import { EMPRESAS, NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";
import { formatoFecha, formatoFechaHora, formatoPesos, hoy } from "@/lib/formato";
import { EtiquetaEmpresa } from "@/components/empresa";
import { SinAcceso } from "../sin-acceso";
import { NuevaPropuesta } from "./nueva";

/**
 * Propuesta de pagos: repartir el dinero disponible entre los pagos que se
 * quieren hacer. Es planificación: no registra pagos ni toca Financiero.
 */
export default async function PaginaPropuestasPago({ searchParams }: PageProps<"/propuestas-pago">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "financiero", "editar");

  const p = await searchParams;
  const empresa = EMPRESAS.includes(p.empresa as Empresa) ? (p.empresa as Empresa) : undefined;
  const estado = ESTADOS_PROPUESTA.includes(p.estado as EstadoPropuesta) ? (p.estado as EstadoPropuesta) : undefined;
  const propuestas = await listarPropuestas({ empresa, estado });

  const href = (cambio: { empresa?: Empresa | null; estado?: EstadoPropuesta | null }) => {
    const q = new URLSearchParams();
    const e = cambio.empresa === undefined ? empresa : cambio.empresa;
    const s = cambio.estado === undefined ? estado : cambio.estado;
    if (e) q.set("empresa", e);
    if (s) q.set("estado", s);
    const t = q.toString();
    return `/propuestas-pago${t ? `?${t}` : ""}`;
  };
  const pastilla = (activo: boolean) =>
    `rounded-full px-3 py-1 text-sm font-medium ${activo ? "bg-stone-900 text-white" : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Propuesta de pagos</h1>
          <p className="text-sm text-stone-500">
            Repartí el dinero disponible entre los pagos que hay que hacer y mirá cuánto queda. Es planificación: no registra pagos, no mueve Financiero ni
            Cuentas corrientes y no cambia las Solicitudes de pagos.
          </p>
        </div>
        {editable && <NuevaPropuesta empresa={empresa ?? "nero"} hoy={hoy()} />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ empresa: null })} className={pastilla(!empresa)}>Todas</Link>
        {EMPRESAS.map((e) => (
          <Link key={e} href={href({ empresa: e })} className={pastilla(empresa === e)}>{NOMBRE_EMPRESA[e]}</Link>
        ))}
        <span className="mx-1 h-5 w-px bg-stone-300" aria-hidden />
        <Link href={href({ estado: null })} className={pastilla(!estado)}>Todos los estados</Link>
        {ESTADOS_PROPUESTA.map((s) => (
          <Link key={s} href={href({ estado: s })} className={pastilla(estado === s)}>{NOMBRE_ESTADO_PROPUESTA[s]}</Link>
        ))}
      </div>

      {propuestas.length === 0 ? (
        <p className="tarjeta text-center text-sm text-stone-500">
          {empresa || estado ? "No hay propuestas con estos filtros." : "Todavía no hay propuestas de pago. Creá la primera con “+ Nueva propuesta de pagos”."}
        </p>
      ) : (
        <div className="tarjeta overflow-x-auto p-0">
          <table className="tabla-movil w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Propuesta</th>
                <th className="px-3 py-2">Empresa</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Disponible</th>
                <th className="px-3 py-2 text-right">Pagos propuestos</th>
                <th className="px-3 py-2 text-right">Saldo restante</th>
                <th className="px-3 py-2">Última modificación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {propuestas.map((x) => {
                const saldo = Math.round((x.disponible - x.total) * 100) / 100;
                return (
                  <tr key={x.id} className="hover:bg-stone-50">
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatoFecha(x.fecha)}
                      <span className="block text-[11px] text-stone-400">#{x.numero}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/propuestas-pago/${x.id}`} className="font-medium underline-offset-2 hover:underline">{x.nombre}</Link>
                      <span className="block text-xs text-stone-500">{x.pagos} pago{x.pagos === 1 ? "" : "s"}</span>
                    </td>
                    <td className="px-3 py-2"><EtiquetaEmpresa empresa={x.empresa} /></td>
                    <td className="px-3 py-2">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO_PROPUESTA[x.estado]}`}>{NOMBRE_ESTADO_PROPUESTA[x.estado]}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatoPesos(x.disponible)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatoPesos(x.total)}</td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-mono font-semibold ${saldo < 0 ? "text-red-700" : "text-green-700"}`}>{formatoPesos(saldo)}</td>
                    <td className="px-3 py-2 text-xs text-stone-500">
                      {formatoFechaHora(x.actualizado_en)}
                      {x.modificador && <span className="block">{x.modificador}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
