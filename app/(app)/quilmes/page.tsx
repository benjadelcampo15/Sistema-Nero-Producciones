import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { leerEstado, listarEventos } from "@/lib/eventos/consultas";
import { COLOR_ESTADO_EVENTO, ESTADOS_EVENTO, NOMBRE_ESTADO_EVENTO } from "@/lib/eventos/tipos";
import { formatoFecha, formatoPesos, colorResultado } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/server";
import { totalesSolicitudes } from "@/lib/quilmes/solicitudes";
import { SinAcceso } from "../sin-acceso";
import { AlternarEmpresa } from "@/components/empresa";
import { NOMBRE_EMPRESA, leerEmpresa } from "@/lib/empresas";

/** QUILMES: proyectos que funcionan como Eventos, separados del listado general. */
export default async function PaginaQuilmes({ searchParams }: PageProps<"/quilmes">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "quilmes", "ver")) return <SinAcceso />;
  const veCostos = puede(usuario, "quilmes_costos", "ver");

  const { estado: parametro, empresa: parametroEmpresa } = await searchParams;
  const estado = leerEstado(parametro);
  const empresa = leerEmpresa(parametroEmpresa);
  const [eventos, { data: solicitudes }] = await Promise.all([
    listarEventos(empresa, estado, "quilmes"),
    (await crearClienteServidor()).from("quilmes_solicitudes").select("evento_id, neto, iva, tipo_iva"),
  ]);
  const presupuestado = (id: string) =>
    totalesSolicitudes((solicitudes ?? []).filter((s) => s.evento_id === id).map((s) => ({ neto: Number(s.neto), iva: Number(s.iva), tipo_iva: s.tipo_iva }))).total;
  const href = (cambios: { empresa?: string; estado?: string | null }) => {
    const p = new URLSearchParams({ empresa: cambios.empresa ?? empresa });
    const e = cambios.estado === undefined ? estado : cambios.estado;
    if (e) p.set("estado", e);
    return `/quilmes?${p}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Quilmes</h1>
          <AlternarEmpresa actual={empresa} href={(e) => href({ empresa: e })} />
        </div>
        {puede(usuario, "quilmes", "editar") && (
          <Link href={`/quilmes/nuevo?empresa=${empresa}`} className="boton">+ Nuevo evento</Link>
        )}
      </div>

      <nav className="flex flex-wrap gap-2">
        {[undefined, ...ESTADOS_EVENTO].map((e) => (
          <Link
            key={e ?? "todos"}
            href={href({ estado: e ?? null })}
            scroll={false}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              estado === e ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
            }`}
          >
            {e ? NOMBRE_ESTADO_EVENTO[e] : "Todos"}
          </Link>
        ))}
      </nav>

      {eventos.length === 0 ? (
        <p className="tarjeta text-center text-sm text-stone-500">No hay eventos Quilmes de {NOMBRE_EMPRESA[empresa]}{estado ? " en este estado" : ""}.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {eventos.map((e) => (
            <Link key={e.id} href={`/quilmes/${e.id}`} className="tarjeta block space-y-4 p-5 transition hover:border-stone-400 hover:shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{e.nombre}</h2>
                  <p className="text-xs text-stone-500">
                    {formatoFecha(e.fecha)}
                    {e.lugar && ` · ${e.lugar}`}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO_EVENTO[e.estado]}`}>{NOMBRE_ESTADO_EVENTO[e.estado]}</span>
              </div>
              <dl className="overflow-hidden rounded-lg border border-stone-200 text-sm">
                <div className="flex justify-between gap-2 border-b border-stone-100 bg-sky-50 px-3 py-1">
                  <dt className="text-xs font-medium uppercase tracking-wide text-sky-900">Presupuestado a Quilmes</dt>
                  <dd className="whitespace-nowrap font-mono">{formatoPesos(presupuestado(e.id))}</dd>
                </div>
                {/* Costos y rentabilidad: solo con el permiso de costos internos. */}
                {veCostos && (
                  <>
                    {(
                      [
                        ["Total ingresos", e.resumen.ingresos],
                        ["Total gastos", e.resumen.gastos],
                        ["IVA a pagar", e.resumen.iva],
                        ["IIBB", e.resumen.iibb],
                      ] as const
                    ).map(([concepto, valor]) => (
                      <div key={concepto} className="flex justify-between gap-2 border-b border-stone-100 px-3 py-1">
                        <dt className="text-xs font-medium uppercase tracking-wide text-stone-600">{concepto}</dt>
                        <dd className="whitespace-nowrap font-mono">{formatoPesos(valor)}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between gap-2 bg-green-100 px-3 py-1.5">
                      <dt className="text-xs font-bold uppercase tracking-wide text-stone-900">Rentabilidad real</dt>
                      <dd className={`whitespace-nowrap font-mono font-semibold ${colorResultado(e.resumen.rentabilidad)}`}>{formatoPesos(e.resumen.rentabilidad)}</dd>
                    </div>
                  </>
                )}
              </dl>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
