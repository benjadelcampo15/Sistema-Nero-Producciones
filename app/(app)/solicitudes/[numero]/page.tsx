import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario } from "@/lib/auth/sesion";
import { centralConfigurada } from "@/lib/solicitudes/central";
import { marcarVista, obtenerSolicitud } from "@/lib/solicitudes/consultas";
import { CLASIFICACIONES, PRIORIDADES, PRIORIDADES_INTERNAS, TIPOS, codigoSolicitud, leerCodigo, nombreDe } from "@/lib/solicitudes/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { EtiquetaEstado, Historial, ListaAdjuntos, formatoFechaHora } from "@/components/solicitudes/comunes";
import { SinConfigurar } from "../sin-configurar";
import { FormularioComentario, PanelEquipo, RespuestaCotizacion } from "./componentes";

export default async function PaginaSolicitud({ params, searchParams }: PageProps<"/solicitudes/[numero]">) {
  if (!centralConfigurada()) return <SinConfigurar />;
  const usuario = await obtenerUsuario();
  const numero = leerCodigo((await params).numero);
  if (!numero) notFound();
  const datos = await obtenerSolicitud(usuario, numero);
  if (!datos) notFound();
  const { equipo, solicitud: s, eventos, adjuntos } = datos;
  const aviso = await searchParams;
  // Al abrirla, se apaga el aviso de novedades de esta solicitud.
  await marcarVista(usuario, s.id);
  const delInicio = adjuntos.filter((a) => a.evento_id === eventos.find((e) => e.tipo === "creada")?.id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/solicitudes" className="text-sm text-stone-500 hover:text-stone-900">← Solicitudes</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-stone-500">{codigoSolicitud(s.numero)}</span>
          <EtiquetaEstado estado={s.estado} />
        </div>
        <h1 className="text-2xl font-semibold">{s.titulo}</h1>
        <p className="text-sm text-stone-500">
          {nombreDe(TIPOS, s.tipo)} · pedida por {s.creado_por_nombre}
          {equipo && ` (${s.empresa_nombre})`} el {formatoFechaHora(s.creado_en)}
        </p>
      </div>

      {aviso.creada === "1" && <p className="rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-900">¡Listo! Recibimos tu solicitud. Te vamos a responder por acá.</p>}
      {aviso.adjuntos === "error" && <p className="alerta-error">La solicitud quedó creada, pero no se pudo subir algún archivo: volvé a adjuntarlo en un comentario.</p>}
      {s.estado === "informacion" && !equipo && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span className="font-semibold">Necesitamos más información.</span> Respondé abajo con un comentario.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <section className="tarjeta space-y-2">
            <h2 className="font-semibold">Descripción</h2>
            <p className="whitespace-pre-line text-sm">{s.descripcion}</p>
            <ListaAdjuntos adjuntos={delInicio} />
          </section>

          {s.estado === "resuelta" && s.resolucion && (
            <section className="rounded-xl border border-green-300 bg-green-50 p-4">
              <h2 className="font-semibold text-green-900">Qué se modificó</h2>
              <p className="mt-1 whitespace-pre-line text-sm text-green-950">{s.resolucion}</p>
            </section>
          )}

          {s.cotizacion_estado && (
            <section className={`rounded-xl border p-4 ${s.cotizacion_estado === "pendiente" ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"}`}>
              <h2 className="font-semibold">Cotización</h2>
              <p className="mt-1 font-mono text-xl font-semibold">{formatoPesos(s.cotizacion_monto ?? 0)}</p>
              {s.cotizacion_detalle && <p className="mt-1 whitespace-pre-line text-sm">{s.cotizacion_detalle}</p>}
              {s.cotizacion_estado === "pendiente" ? (
                equipo ? (
                  <p className="mt-2 text-sm text-amber-900">Esperando que el cliente la apruebe.</p>
                ) : (
                  <RespuestaCotizacion numero={s.numero} />
                )
              ) : (
                <p className={`mt-2 text-sm font-medium ${s.cotizacion_estado === "aprobada" ? "text-green-800" : "text-red-800"}`}>
                  {s.cotizacion_estado === "aprobada" ? "Aprobada" : "Rechazada"} por {s.cotizacion_respondida_por}
                  {s.cotizacion_respondida_en && ` el ${formatoFechaHora(s.cotizacion_respondida_en)}`}
                </p>
              )}
            </section>
          )}

          <section className="space-y-3">
            <h2 className="font-semibold">Historial y comentarios</h2>
            <Historial eventos={eventos} adjuntos={adjuntos} />
            <FormularioComentario numero={s.numero} equipo={equipo} />
          </section>
        </div>

        <aside className="space-y-4">
          <section className="tarjeta space-y-2 text-sm">
            <h2 className="font-semibold">Datos</h2>
            <Dato nombre="Estado"><EtiquetaEstado estado={s.estado} /></Dato>
            <Dato nombre="Prioridad sugerida">{nombreDe(PRIORIDADES, s.prioridad_sugerida)}</Dato>
            <Dato nombre="Fecha estimada">{s.fecha_estimada ? formatoFecha(s.fecha_estimada) : "—"}</Dato>
            {equipo && (
              <>
                <Dato nombre="Empresa">{s.empresa_nombre}</Dato>
                <Dato nombre="Pidió">{s.creado_por_nombre} · {s.creado_por_email}</Dato>
                <Dato nombre="Responsable">{s.responsable ?? "—"}</Dato>
                <Dato nombre="Prioridad interna">{nombreDe(PRIORIDADES_INTERNAS, s.prioridad_interna)}</Dato>
                <Dato nombre="Clasificación">{nombreDe(CLASIFICACIONES, s.clasificacion)}</Dato>
              </>
            )}
            <Dato nombre="Última actualización">{formatoFechaHora(s.actualizado_en)}</Dato>
          </section>
          {equipo && <PanelEquipo solicitud={s} />}
        </aside>
      </div>
    </div>
  );
}

function Dato({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-stone-500">{nombre}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
