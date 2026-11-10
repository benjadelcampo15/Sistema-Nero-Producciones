"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { actualizarSolicitud, comentar, responderCotizacion } from "@/lib/solicitudes/acciones";
import { ACEPTA_ADJUNTOS, CLASIFICACIONES, ESTADOS, PRIORIDADES_INTERNAS, type Solicitud } from "@/lib/solicitudes/tipos";
import { parsearMonto } from "@/lib/formato";

/** Comentario (o nota interna, para el equipo) con adjuntos. */
export function FormularioComentario({ numero, equipo }: { numero: number; equipo: boolean }) {
  const formulario = useRef<HTMLFormElement>(null);
  const [estado, accion, enviando] = useActionState(async (previo: Awaited<ReturnType<typeof comentar>>, formData: FormData) => {
    const r = await comentar(numero, previo, formData);
    if (!r.error) formulario.current?.reset();
    return r;
  }, {});
  return (
    <form ref={formulario} action={accion} className="tarjeta space-y-3">
      <label htmlFor="texto" className="etiqueta">{equipo ? "Responder o agregar una nota" : "Agregar un comentario"}</label>
      <textarea id="texto" name="texto" rows={3} maxLength={8000} defaultValue={estado.valores?.texto} placeholder={equipo ? "Respuesta para el cliente…" : "Respondé una pregunta o sumá información…"} className="campo" />
      <div className="flex flex-wrap items-center gap-3">
        <input name="adjuntos" type="file" multiple accept={ACEPTA_ADJUNTOS} aria-label="Adjuntos" className="min-w-0 flex-1 text-sm" />
        {equipo && (
          <label className="flex items-center gap-2 text-sm text-amber-900">
            <input type="checkbox" name="interno" />
            Nota interna (el cliente no la ve)
          </label>
        )}
        <button type="submit" disabled={enviando} className="boton">{enviando ? "Enviando…" : "Enviar"}</button>
      </div>
      {estado.error && <p className="alerta-error">{estado.error}</p>}
      {estado.ok && <p className="text-sm text-green-700">{estado.ok}</p>}
    </form>
  );
}

/** El cliente aprueba o rechaza la cotización. */
export function RespuestaCotizacion({ numero }: { numero: number }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const responder = (aprobar: boolean) => {
    if (!window.confirm(aprobar ? "¿Aprobás la cotización? El equipo de Planix va a empezar el desarrollo." : "¿Rechazás la cotización?")) return;
    iniciar(async () => {
      const r = await responderCotizacion(numero, aprobar);
      if (r.error) setError(r.error);
    });
  };
  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm text-amber-900">Este desarrollo tiene un costo adicional. Se empieza cuando lo aprobás.</p>
      <div className="flex gap-2">
        <button type="button" disabled={pendiente} onClick={() => responder(true)} className="boton">Aprobar cotización</button>
        <button type="button" disabled={pendiente} onClick={() => responder(false)} className="boton-secundario">Rechazar</button>
      </div>
      {error && <p className="alerta-error">{error}</p>}
    </div>
  );
}

/** Lo que administra el equipo de Planix: estado, responsable, prioridad, fecha, clasificación, cotización y resolución. */
export function PanelEquipo({ solicitud: s }: { solicitud: Solicitud }) {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ error?: string; ok?: string }>({});
  const [estado, setEstado] = useState(s.estado);
  const [responsable, setResponsable] = useState(s.responsable ?? "");
  const [prioridad, setPrioridad] = useState(s.prioridad_interna ?? "");
  const [fecha, setFecha] = useState(s.fecha_estimada ?? "");
  const [clasificacion, setClasificacion] = useState(s.clasificacion);
  const [resolucion, setResolucion] = useState(s.resolucion ?? "");
  const [monto, setMonto] = useState(s.cotizacion_monto === null ? "" : String(s.cotizacion_monto).replace(".", ","));
  const [detalle, setDetalle] = useState(s.cotizacion_detalle ?? "");

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setMensaje({});
    const valor = monto.trim() ? parsearMonto(monto) : null;
    if (monto.trim() && valor === null) return setMensaje({ error: "Monto de la cotización inválido" });
    iniciar(async () => {
      const r = await actualizarSolicitud(s.numero, {
        estado,
        responsable,
        prioridad_interna: prioridad as "",
        fecha_estimada: fecha,
        clasificacion,
        resolucion,
        cotizacion_monto: valor,
        cotizacion_detalle: detalle,
      });
      setMensaje(r.error ? r : { ok: "Guardado" });
    });
  }

  return (
    <form onSubmit={guardar} className="tarjeta space-y-3 border-stone-900">
      <h2 className="font-semibold">Administrar (equipo Planix)</h2>
      <div>
        <label htmlFor="p_estado" className="etiqueta">Estado</label>
        <select id="p_estado" value={estado} onChange={(e) => setEstado(e.target.value as Solicitud["estado"])} className="campo">
          {ESTADOS.map((x) => (
            <option key={x.id} value={x.id}>{x.nombre}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="p_responsable" className="etiqueta">Responsable</label>
        <input id="p_responsable" value={responsable} onChange={(e) => setResponsable(e.target.value)} maxLength={80} placeholder="Quién lo toma" className="campo" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="p_prioridad" className="etiqueta">Prioridad interna</label>
          <select id="p_prioridad" value={prioridad} onChange={(e) => setPrioridad(e.target.value)} className="campo">
            <option value="">Sin definir</option>
            {PRIORIDADES_INTERNAS.map((x) => (
              <option key={x.id} value={x.id}>{x.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="p_fecha" className="etiqueta">Fecha estimada</label>
          <input id="p_fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo" />
        </div>
      </div>
      <div>
        <label htmlFor="p_clasificacion" className="etiqueta">Clasificación comercial</label>
        <select id="p_clasificacion" value={clasificacion} onChange={(e) => setClasificacion(e.target.value as Solicitud["clasificacion"])} className="campo">
          {CLASIFICACIONES.map((x) => (
            <option key={x.id} value={x.id}>{x.nombre}</option>
          ))}
        </select>
      </div>
      {(clasificacion === "cotizacion" || s.cotizacion_estado) && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Cotización para el cliente</p>
          <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="Monto (vacío = sin cotización)" aria-label="Monto de la cotización" className="campo text-right font-mono" />
          <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={3} maxLength={4000} placeholder="Qué incluye, plazos…" aria-label="Detalle de la cotización" className="campo" />
          <p className="text-xs text-amber-900">Al guardarla, el cliente la ve y la tiene que aprobar.</p>
        </div>
      )}
      {(estado === "resuelta" || s.resolucion) && (
        <div>
          <label htmlFor="p_resolucion" className="etiqueta">Qué se modificó</label>
          <textarea id="p_resolucion" value={resolucion} onChange={(e) => setResolucion(e.target.value)} rows={3} maxLength={4000} placeholder="Lo va a ver el cliente" className="campo" />
        </div>
      )}
      {mensaje.error && <p className="alerta-error">{mensaje.error}</p>}
      {mensaje.ok && <p className="text-sm text-green-700">{mensaje.ok}</p>}
      <button type="submit" disabled={pendiente} className="boton w-full">{pendiente ? "Guardando…" : "Guardar cambios"}</button>
    </form>
  );
}

/** Copia el título y la descripción de la solicitud al portapapeles. */
export function CopiarDescripcion({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  const [estado, setEstado] = useState<"listo" | "copiado" | "error">("listo");
  const copiar = async () => {
    const texto = `${titulo}\n\n${descripcion}`;
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("copiado");
    } catch {
      // Navegadores sin permiso de portapapeles: se copia con un campo temporal.
      const campo = document.createElement("textarea");
      campo.value = texto;
      campo.style.position = "fixed";
      campo.style.opacity = "0";
      document.body.appendChild(campo);
      campo.select();
      const ok = document.execCommand("copy");
      campo.remove();
      setEstado(ok ? "copiado" : "error");
    }
    setTimeout(() => setEstado("listo"), 2000);
  };
  return (
    <button
      type="button"
      onClick={copiar}
      title="Copiar el título y la descripción"
      className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
        <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h7A1.5 1.5 0 0 1 17 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 12.5v-9Z" />
        <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5V15H8.5A2.5 2.5 0 0 1 6 12.5V6H4.5Z" />
      </svg>
      {estado === "copiado" ? "¡Copiado!" : estado === "error" ? "No se pudo copiar" : "Copiar"}
    </button>
  );
}
