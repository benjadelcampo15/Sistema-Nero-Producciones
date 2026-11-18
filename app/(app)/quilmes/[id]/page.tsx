import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerDetalleEvento, obtenerEvento, obtenerPlanillaEvento, versionPlanilla } from "@/lib/eventos/consultas";
import { proveedoresParaEvento } from "@/lib/eventos/cuenta-gastos";
import { solicitudesEvento } from "@/lib/quilmes/consultas";
import { datosPresupuesto, presupuestoEmitido, versionesPresupuesto, type DocumentoPresupuesto } from "@/lib/quilmes/presupuesto";
import { formatoFecha, formatoFechaHora, formatoPesos } from "@/lib/formato";
import { TablaMovimientos } from "@/components/tabla-movimientos";
import { EtiquetaEmpresa } from "@/components/empresa";
import { DocumentoPresupuestoQuilmes } from "@/components/documento-presupuesto-quilmes";
import { SinAcceso } from "../../sin-acceso";
import { PlanillaEvento } from "../../eventos/[id]/planilla-evento";
import { EstadoDelEvento, IndicadorSincronizacion } from "../../eventos/[id]/estado-evento";
import { DuplicarPlanilla } from "../../eventos/[id]/duplicar-planilla";
import { SolicitudesComerciales } from "./solicitudes-comerciales";
import { AccionesPresupuesto } from "./acciones-presupuesto";

type Vista = "planilla" | "solicitudes" | "presupuesto" | "movimientos";

/**
 * Evento Quilmes. La planilla interna (Solicitudes + Gastos reales +
 * rentabilidad) y los movimientos solo con el permiso de costos; el
 * presupuesto comercial y su PDF, con el permiso de Quilmes.
 */
export default async function PaginaEventoQuilmes({ params, searchParams }: PageProps<"/quilmes/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "quilmes", "ver")) return <SinAcceso />;
  const veCostos = puede(usuario, "quilmes_costos", "ver");
  const editaCostos = puede(usuario, "quilmes_costos", "editar");
  const edita = puede(usuario, "quilmes", "editar");

  const { id } = await params;
  const sp = await searchParams;
  const pedida = typeof sp.vista === "string" ? sp.vista : "";
  const vista: Vista =
    pedida === "presupuesto" ? "presupuesto" : pedida === "movimientos" && veCostos ? "movimientos" : veCostos && pedida !== "solicitudes" ? "planilla" : "solicitudes";

  const evento = await obtenerEvento(id);
  if (!evento) notFound();
  if (evento.tipo !== "quilmes") redirect(`/eventos/${id}`);

  const version = typeof sp.v === "string" && /^\d+$/.test(sp.v) ? Number(sp.v) : null;
  const [solicitudes, planilla, detalle, documento, versiones, versionGuardada] = await Promise.all([
    vista === "planilla" || vista === "solicitudes" ? solicitudesEvento(id) : null,
    vista === "planilla" ? obtenerPlanillaEvento(id) : null,
    vista === "movimientos" ? obtenerDetalleEvento(id) : null,
    vista === "presupuesto"
      ? version
        ? presupuestoEmitido(id, version)
        : datosPresupuesto(id).then((d): DocumentoPresupuesto | null => (d ? { ...d, numero: null, version: null, emitido_en: null } : null))
      : null,
    vista === "presupuesto" ? versionesPresupuesto(id) : null,
    vista === "planilla" ? versionPlanilla(id) : null,
  ]);
  const proveedores = planilla && evento.planilla_en_financiero ? await proveedoresParaEvento(evento.empresa) : undefined;
  const editaMovimientos = editaCostos || puede(usuario, "financiero", "editar");

  const pestanas: { clave: Vista; nombre: string; href: string }[] = [
    ...(veCostos ? [{ clave: "planilla" as const, nombre: "Planilla interna", href: `/quilmes/${id}` }] : [{ clave: "solicitudes" as const, nombre: "Solicitudes", href: `/quilmes/${id}?vista=solicitudes` }]),
    { clave: "presupuesto", nombre: "Presupuesto para Quilmes", href: `/quilmes/${id}?vista=presupuesto` },
    ...(veCostos ? [{ clave: "movimientos" as const, nombre: "Movimientos", href: `/quilmes/${id}?vista=movimientos` }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link href="/quilmes" className="text-sm text-stone-500 hover:text-stone-900">← Quilmes</Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{evento.nombre}</h1>
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-900">Quilmes</span>
              <EtiquetaEmpresa empresa={evento.empresa} />
              {/* Cerrar o reabrir mueve Financiero: hace falta el permiso de costos. */}
              <EstadoDelEvento evento={evento} editable={edita && editaCostos} />
            </div>
            <p className="text-sm text-stone-500">
              {formatoFecha(evento.fecha)}
              {evento.lugar && ` · ${evento.lugar}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/quilmes/${id}?vista=presupuesto`} className="boton">Generar presupuesto para Quilmes</Link>
            {veCostos && <Link href={`/quilmes/${id}`} className="boton-secundario">Ver rentabilidad interna</Link>}
            {edita && <Link href={`/quilmes/${id}/editar`} className="boton-secundario">Editar evento</Link>}
            {edita && <DuplicarPlanilla evento={evento} />}
            {editaMovimientos && <Link href={`/eventos/${id}/movimiento`} className="boton-secundario">+ Movimiento</Link>}
          </div>
        </div>
        {evento.notas && <p className="mt-2 max-w-3xl whitespace-pre-line text-sm text-stone-600">{evento.notas}</p>}
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-stone-200 print:hidden">
        {pestanas.map((t) => (
          <Link key={t.clave} href={t.href} className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${t.clave === vista ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-900"}`}>
            {t.nombre}
          </Link>
        ))}
      </nav>

      {vista === "planilla" && planilla && solicitudes && (
        <PlanillaEvento
          key={evento.id}
          eventoId={evento.id}
          inicial={planilla}
          version={versionGuardada}
          solicitudes={solicitudes}
          editable={edita && editaCostos}
          enFinanciero={evento.planilla_en_financiero}
          cerrado={evento.estado === "cerrado"}
          indicador={<IndicadorSincronizacion evento={evento} editable={edita && editaCostos} />}
          proveedores={proveedores}
          empresa={evento.empresa}
        />
      )}

      {vista === "solicitudes" && solicitudes && <SolicitudesComerciales eventoId={evento.id} inicial={solicitudes} editable={edita} />}

      {vista === "presupuesto" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
            <div>
              <h2 className="text-lg font-semibold">{version ? `Presupuesto emitido · versión ${version}` : "Vista previa del presupuesto para Quilmes"}</h2>
              <p className="text-sm text-stone-600">Solo los servicios presupuestados y sus precios de venta. Nunca incluye gastos reales, proveedores ni rentabilidad.</p>
              {version && <Link href={`/quilmes/${id}?vista=presupuesto`} className="text-sm underline">Ver la vista previa actual</Link>}
            </div>
            {documento && <AccionesPresupuesto eventoId={id} version={version} editable={edita} accion={typeof sp.accion === "string" ? sp.accion : undefined} />}
          </div>
          {documento ? (
            documento.items.length ? (
              <DocumentoPresupuestoQuilmes doc={documento} />
            ) : (
              <p className="tarjeta text-center text-sm text-stone-500">Todavía no hay solicitudes con precio: cargalas para generar el presupuesto.</p>
            )
          ) : (
            <p className="tarjeta text-center text-sm text-stone-500">No se encontró esa versión.</p>
          )}
          {versiones && versiones.length > 0 && (
            <section className="tarjeta p-0 print:hidden">
              <h3 className="border-b border-stone-200 px-3 py-2 font-semibold">Versiones emitidas</h3>
              <ul className="divide-y divide-stone-100 text-sm">
                {versiones.map((v) => (
                  <li key={v.version} className={`flex flex-wrap items-center gap-3 px-3 py-2 ${v.version === version ? "bg-stone-50" : ""}`}>
                    <span className="font-semibold">v{v.version}</span>
                    <span className="text-stone-600">N° {String(v.numero).padStart(4, "0")}</span>
                    <span className="font-mono">{formatoPesos(v.total)}</span>
                    <span className="text-stone-500">{formatoFechaHora(v.emitido_en)} · {v.emitido_por}</span>
                    <span className="ml-auto flex gap-3">
                      <Link href={`/quilmes/${id}?vista=presupuesto&v=${v.version}`} className="underline">Ver</Link>
                      <a href={`/quilmes/${id}/presupuesto/${v.version}/pdf`} className="underline">PDF</a>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {vista === "movimientos" && detalle && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Movimientos ({detalle.transacciones.length})</h2>
          <TablaMovimientos transacciones={detalle.transacciones} editable={editaMovimientos} volverA={`/quilmes/${id}?vista=movimientos`} mostrarEvento={false} />
        </section>
      )}
    </div>
  );
}
