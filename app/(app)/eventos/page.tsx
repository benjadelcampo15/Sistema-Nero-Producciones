import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { leerEstado, listarEventos } from "@/lib/eventos/consultas";
import { COLOR_ESTADO_EVENTO, ESTADOS_EVENTO, NOMBRE_ESTADO_EVENTO } from "@/lib/eventos/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { BarraPresupuesto } from "@/components/barra-presupuesto";
import { SinAcceso } from "../sin-acceso";
import { AlternarEmpresa } from "@/components/empresa";
import { NOMBRE_EMPRESA, leerEmpresa } from "@/lib/empresas";

export default async function PaginaEventos({ searchParams }: PageProps<"/eventos">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "eventos", "ver")) return <SinAcceso />;

  const { estado: parametro, empresa: parametroEmpresa } = await searchParams;
  const estado = leerEstado(parametro);
  const empresa = leerEmpresa(parametroEmpresa);
  const eventos = await listarEventos(empresa, estado);
  const href = (cambios: { empresa?: string; estado?: string | null }) => {
    const p = new URLSearchParams({ empresa: cambios.empresa ?? empresa });
    const e = cambios.estado === undefined ? estado : cambios.estado;
    if (e) p.set("estado", e);
    return `/eventos?${p}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Eventos</h1>
          <AlternarEmpresa actual={empresa} href={(e) => href({ empresa: e })} />
        </div>
        {puede(usuario, "eventos", "editar") && (
          <Link href={`/eventos/nuevo?empresa=${empresa}`} className="boton">+ Nuevo evento</Link>
        )}
      </div>

      {/* Links: navegan sin recargar la página. */}
      <nav className="flex flex-wrap gap-2">
        {[undefined, ...ESTADOS_EVENTO].map((e) => (
          <Link
            key={e ?? "todos"}
            href={href({ estado: e ?? null })}
            scroll={false}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              estado === e
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
            }`}
          >
            {e ? NOMBRE_ESTADO_EVENTO[e] : "Todos"}
          </Link>
        ))}
      </nav>

      {eventos.length === 0 ? (
        <p className="tarjeta text-center text-sm text-stone-500">No hay eventos de {NOMBRE_EMPRESA[empresa]}{estado ? " en este estado" : ""}.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {eventos.map((e) => {
            const uso = e.presupuesto ? e.balance.egresos / e.presupuesto : null;
            return (
              <Link key={e.id} href={`/eventos/${e.id}`} className="tarjeta block space-y-4 p-5 transition hover:border-stone-400 hover:shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{e.nombre}</h2>
                    <p className="text-xs text-stone-500">
                      {formatoFecha(e.fecha)}
                      {e.lugar && ` · ${e.lugar}`}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO_EVENTO[e.estado]}`}>
                    {NOMBRE_ESTADO_EVENTO[e.estado]}
                  </span>
                </div>

                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-stone-500">Ingresos</dt>
                    <dd className="font-mono text-green-700">{formatoPesos(e.balance.ingresos)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-stone-500">Egresos</dt>
                    <dd className="font-mono text-red-700">{formatoPesos(e.balance.egresos)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-stone-100 pt-1">
                    <dt className="font-medium">Balance</dt>
                    <dd className={`font-mono font-semibold ${e.balance.resultado >= 0 ? "text-stone-900" : "text-red-700"}`}>
                      {formatoPesos(e.balance.resultado)}
                    </dd>
                  </div>
                </dl>

                {uso !== null && <BarraPresupuesto uso={uso} />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
