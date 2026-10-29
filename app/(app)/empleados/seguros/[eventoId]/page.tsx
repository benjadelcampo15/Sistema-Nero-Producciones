import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarPersonal, segurosDeEvento } from "@/lib/empleados/consultas";
import { formatoFecha } from "@/lib/formato";
import { SinAcceso } from "../../../sin-acceso";
import { AgregarPersonal, FormularioPoliza, MarcarTodos, PuestosEvento, TablaPersonal, VerPoliza } from "./componentes";

export default async function PaginaSegurosDeEvento({ params }: PageProps<"/empleados/seguros/[eventoId]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "operativa", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "operativa", "editar");

  const { eventoId } = await params;
  const [datos, personal] = await Promise.all([segurosDeEvento(eventoId), editable ? listarPersonal() : []]);
  if (!datos) notFound();
  const { evento, convocados, polizas, puestos } = datos;
  const cantidades: Record<string, number> = {};
  for (const c of convocados) if (c.puesto_id) cantidades[c.puesto_id] = (cantidades[c.puesto_id] ?? 0) + 1;
  const enEvento = new Set(convocados.map((c) => c.persona.id));
  const cubiertos = convocados.filter((c) => c.seguro === "cubierto").length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/empleados/seguros" className="text-sm text-stone-500 hover:text-stone-900">← Por evento</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">
            {evento.nombre} <span className="text-base font-normal text-stone-500">· {formatoFecha(evento.fecha)}</span>
          </h1>
          {convocados.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <a href={`/empleados/seguros/${evento.id}/puestos`} target="_blank" rel="noreferrer" className="boton">
                PDF por puestos
              </a>
              <a href={`/empleados/seguros/${evento.id}/exportar`} className="boton-secundario">
                Lista para la aseguradora
              </a>
            </div>
          )}
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Puestos de trabajo</h2>
        <PuestosEvento eventoId={evento.id} puestos={puestos} cantidades={cantidades} editable={editable} />
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            Personal del evento ({convocados.length}){" "}
            {convocados.length > 0 && (
              <span className={`text-sm font-normal ${cubiertos === convocados.length ? "text-green-700" : "text-amber-700"}`}>
                · {cubiertos} con seguro
              </span>
            )}
          </h2>
          {editable && convocados.length > 0 && <MarcarTodos eventoId={evento.id} polizas={polizas} />}
        </div>
        <TablaPersonal convocados={convocados} polizas={polizas} puestos={puestos} editable={editable} />
        {editable && <AgregarPersonal eventoId={evento.id} personal={personal.filter((p) => !enEvento.has(p.id))} puestos={puestos} />}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Pólizas</h2>
        <div className="tarjeta divide-y divide-stone-100 p-0">
          {polizas.length === 0 && <p className="p-4 text-sm text-stone-500">Todavía no se cargó la póliza.</p>}
          {polizas.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="flex-1 font-medium">{p.aseguradora}{p.numero ? ` · N° ${p.numero}` : ""}</span>
              <span className="text-xs text-stone-500">
                {p.vigencia_desde ? formatoFecha(p.vigencia_desde) : "—"} al {p.vigencia_hasta ? formatoFecha(p.vigencia_hasta) : "—"}
              </span>
              {p.archivo_path && <VerPoliza path={p.archivo_path} />}
            </div>
          ))}
        </div>
        {editable && (
          <details className="tarjeta">
            <summary className="cursor-pointer font-semibold">+ Cargar póliza</summary>
            <div className="mt-4">
              <FormularioPoliza eventoId={evento.id} />
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
