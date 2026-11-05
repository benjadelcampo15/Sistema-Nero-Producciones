import { formatoFecha, formatoPesos } from "@/lib/formato";
import { CLASIFICACIONES, ESTADOS, PRIORIDADES_INTERNAS, nombreDe, type Adjunto, type EstadoSolicitud, type EventoSolicitud } from "@/lib/solicitudes/tipos";

export function EtiquetaEstado({ estado }: { estado: EstadoSolicitud }) {
  const e = ESTADOS.find((x) => x.id === estado) ?? ESTADOS[0];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${e.clase}`}>{e.nombre}</span>;
}

const fechaHora = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
export const formatoFechaHora = (iso: string) => fechaHora.format(new Date(iso));

const tamano = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

export function ListaAdjuntos({ adjuntos }: { adjuntos: Adjunto[] }) {
  if (!adjuntos.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {adjuntos.map((a) => (
        <li key={a.id}>
          <a
            href={`/solicitudes/adjunto/${a.id}`}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-stone-50 ${a.interno ? "border-amber-300 bg-amber-50" : "border-stone-300 bg-white"}`}
          >
            📎 <span className="max-w-48 truncate">{a.nombre}</span> <span className="text-stone-500">{tamano(a.tamano)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Lo que pasó en un evento del historial, en palabras. */
function describir(e: EventoSolicitud) {
  const d = (e.datos ?? {}) as Record<string, unknown>;
  const a = d.a as string | null;
  switch (e.tipo) {
    case "creada":
      return "Creó la solicitud";
    case "estado":
      return `Cambió el estado a "${nombreDe(ESTADOS, a)}"`;
    case "responsable":
      return a ? `Asignó a ${a}` : "Sacó al responsable";
    case "prioridad":
      return a ? `Prioridad interna: ${nombreDe(PRIORIDADES_INTERNAS, a)}` : "Sacó la prioridad interna";
    case "fecha":
      return a ? `Fecha estimada: ${formatoFecha(a)}` : "Sacó la fecha estimada";
    case "clasificacion":
      return `Clasificación comercial: ${nombreDe(CLASIFICACIONES, a)}`;
    case "cotizacion":
      return d.monto === null ? "Retiró la cotización" : `Envió una cotización por ${formatoPesos(Number(d.monto))}`;
    case "cotizacion_respuesta":
      return d.aprobada ? "Aprobó la cotización" : "Rechazó la cotización";
    case "resolucion":
      return "Indicó qué se modificó";
    case "nota_interna":
      return "Nota interna";
    case "adjunto":
      return "Adjuntó archivos";
    default:
      return null;
  }
}

/** Historial: comentarios y cambios en orden, con sus adjuntos. */
export function Historial({ eventos, adjuntos }: { eventos: EventoSolicitud[]; adjuntos: Adjunto[] }) {
  return (
    <ol className="space-y-3">
      {eventos.map((e) => {
        const titulo = describir(e);
        const esMensaje = e.tipo === "comentario" || e.tipo === "nota_interna" || e.tipo === "resolucion";
        // Los adjuntos del pedido original se muestran con la descripción.
        const suyos = e.tipo === "creada" ? [] : adjuntos.filter((a) => a.evento_id === e.id);
        return (
          <li key={e.id} className={`flex ${e.lado === "equipo" ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-full rounded-xl border px-3 py-2 sm:max-w-[85%] ${
                e.interno ? "border-amber-300 bg-amber-50" : esMensaje ? (e.lado === "equipo" ? "border-stone-200 bg-white" : "border-sky-200 bg-sky-50") : "border-dashed border-stone-300 bg-stone-50"
              }`}
            >
              <p className="text-xs text-stone-500">
                <span className="font-semibold text-stone-700">{e.autor_nombre}</span>
                {e.lado === "equipo" && " · Equipo Planix"} · {formatoFechaHora(e.creado_en)}
                {e.interno && <span className="ml-1 font-semibold text-amber-800">· interno (el cliente no lo ve)</span>}
              </p>
              {titulo && <p className={`text-sm ${esMensaje ? "text-xs font-semibold text-stone-600" : ""}`}>{titulo}</p>}
              {e.texto && <p className="mt-0.5 whitespace-pre-line text-sm">{e.texto}</p>}
              <ListaAdjuntos adjuntos={suyos} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
