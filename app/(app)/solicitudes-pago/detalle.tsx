"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarEstadoSolicitudPago, marcarNotificacionesLeidas, quitarPagoSolicitud, registrarPagoSolicitud } from "@/lib/pagos/acciones";
import { MEDIOS_PAGO, type MovimientoHistorial, type PagoSolicitud, type SolicitudPago } from "@/lib/pagos/tipos";
import { formatoFecha, formatoFechaHora, formatoPesos, hoy } from "@/lib/formato";
import { CampoMonto } from "@/components/campo-monto";
import { FormularioSolicitud, type Opciones } from "./formulario";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Detalle de una solicitud: datos, acciones según permisos, pagos registrados e historial. */
export function DetalleSolicitud({
  s,
  pagos,
  historial,
  opciones,
  contabilidad,
  esMia,
}: {
  s: SolicitudPago;
  pagos: PagoSolicitud[];
  historial: MovimientoHistorial[];
  opciones: Opciones;
  contabilidad: boolean;
  esMia: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const falta = r2(s.monto - s.pagado);
  const abierta = ["pendiente", "aprobada", "parcial"].includes(s.estado);
  const puedeEditar = contabilidad ? abierta : esMia && s.estado === "pendiente";

  const estado = (nuevo: "pendiente" | "aprobada" | "rechazada" | "cancelada", pedirNota = false) => {
    let nota: string | undefined;
    if (pedirNota) {
      const t = window.prompt(nuevo === "rechazada" ? "Motivo del rechazo (opcional):" : "Observación (opcional):");
      if (t === null) return;
      nota = t;
    } else if (nuevo === "cancelada" && !window.confirm("¿Cancelar la solicitud?")) return;
    setError(null);
    iniciar(async () => {
      const r = await cambiarEstadoSolicitudPago(s.id, nuevo, nota);
      if (r.error) setError(r.error);
    });
  };

  if (editando) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <h3 className="mb-3 font-semibold">Modificar solicitud #{s.numero}</h3>
        <FormularioSolicitud opciones={opciones} inicial={s} contabilidad={contabilidad} alTerminar={() => setEditando(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-stone-200 bg-white p-4">
      <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Dato titulo="Solicitada">{formatoFechaHora(s.creado_en)} · {s.solicitante ?? "—"}</Dato>
        <Dato titulo="Monto solicitado">
          <span className="font-mono font-semibold">{formatoPesos(s.monto)}</span>
        </Dato>
        <Dato titulo="Pagado">
          <span className="font-mono">{formatoPesos(s.pagado)}</span>
          {s.pagado > 0 && falta > 0 && <span className="ml-2 font-mono text-amber-800">falta {formatoPesos(falta)}</span>}
        </Dato>
        <Dato titulo="Alias / CBU">
          <span className="font-mono">{s.datos_bancarios}</span>
          <button type="button" onClick={() => navigator.clipboard?.writeText(s.datos_bancarios)} className="ml-2 text-xs text-stone-500 underline">
            copiar
          </button>
        </Dato>
        {s.motivo && <Dato titulo="Motivo" ancho>{s.motivo}</Dato>}
        {s.nota_admin && <Dato titulo="Observación de Contabilidad" ancho>{s.nota_admin}</Dato>}
        {s.estado_en && (
          <Dato titulo="Último cambio de estado">
            {formatoFechaHora(s.estado_en)}
            {s.estado_por ? ` · ${s.estado_por}` : ""}
          </Dato>
        )}
      </div>

      {error && <p className="alerta-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {contabilidad && s.estado === "pendiente" && (
          <>
            <button type="button" disabled={pendiente} onClick={() => estado("aprobada")} className="boton py-1.5 text-sm">Aprobar</button>
            <button type="button" disabled={pendiente} onClick={() => estado("rechazada", true)} className="boton-secundario py-1.5 text-sm text-red-700">Rechazar</button>
          </>
        )}
        {contabilidad && abierta && (
          <button type="button" disabled={pendiente} onClick={() => setPagando(!pagando)} className="boton py-1.5 text-sm">
            {s.estado === "parcial" ? "Registrar otro pago" : "Marcar como pagada"}
          </button>
        )}
        {contabilidad && (s.estado === "aprobada" || s.estado === "rechazada" || s.estado === "cancelada") && s.pagado === 0 && (
          <button type="button" disabled={pendiente} onClick={() => estado("pendiente", true)} className="boton-secundario py-1.5 text-sm">Volver a pendiente</button>
        )}
        {puedeEditar && (
          <button type="button" onClick={() => setEditando(true)} className="boton-secundario py-1.5 text-sm">Modificar</button>
        )}
        {((contabilidad && abierta && s.pagado === 0) || (esMia && s.estado === "pendiente")) && (
          <button type="button" disabled={pendiente} onClick={() => estado("cancelada")} className="boton-secundario py-1.5 text-sm">Cancelar solicitud</button>
        )}
      </div>

      {pagando && <FormularioPago s={s} falta={falta} alTerminar={() => setPagando(false)} />}

      {pagos.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Pagos registrados</h4>
          <ul className="mt-1 divide-y divide-stone-100 text-sm">
            {pagos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <span>{formatoFecha(p.fecha)}</span>
                <span className="font-mono font-semibold">{formatoPesos(p.importe)}</span>
                <span>{p.medio}</span>
                {p.observacion && <span className="text-stone-500">{p.observacion}</span>}
                {p.comprobante_path && (
                  <a href={`/solicitudes-pago/comprobante/${p.id}`} target="_blank" rel="noreferrer" className="text-xs underline">
                    Ver comprobante
                  </a>
                )}
                {contabilidad && (
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => {
                      if (!window.confirm(`¿Quitar el pago de ${formatoPesos(p.importe)}? Es solo el registro: no toca Financiero.`)) return;
                      iniciar(async () => {
                        const r = await quitarPagoSolicitud(p.id);
                        if (r.error) setError(r.error);
                      });
                    }}
                    className="ml-auto text-xs text-red-700 hover:underline"
                  >
                    Quitar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {historial.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-stone-500">Historial ({historial.length})</summary>
          <ol className="mt-1 space-y-1 text-sm">
            {historial.map((h, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="text-stone-500">{formatoFechaHora(h.creado_en)}</span>
                <span className="font-medium">{h.accion}</span>
                {h.detalle && <span className="text-stone-700">— {h.detalle}</span>}
                {h.usuario && <span className="text-stone-500">({h.usuario})</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function Dato({ titulo, children, ancho }: { titulo: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <div className={ancho ? "sm:col-span-2" : ""}>
      <p className="text-xs text-stone-500">{titulo}</p>
      <div className="whitespace-pre-line break-words">{children}</div>
    </div>
  );
}

/** Registrar un pago: fecha, importe (si es menos que lo que falta, queda pagada en parte), medio, observación y comprobante. */
function FormularioPago({ s, falta, alTerminar }: { s: SolicitudPago; falta: number; alTerminar: () => void }) {
  const [importe, setImporte] = useState(falta);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        datos.set("importe", String(importe));
        setError(null);
        if (!(importe > 0)) return setError("El importe tiene que ser mayor a cero");
        iniciar(async () => {
          const r = await registrarPagoSolicitud(s.id, datos);
          if (r.error) setError(r.error);
          else alTerminar();
        });
      }}
      className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-3"
    >
      <p className="text-sm text-green-900">
        Registrá el pago que ya se hizo. Es seguimiento: <strong>no crea un egreso en Financiero</strong> ni toca la cuenta corriente.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="etiqueta">Fecha del pago</span>
          <input type="date" name="fecha" defaultValue={hoy()} required className="campo" />
        </label>
        <label className="block">
          <span className="etiqueta">Importe pagado</span>
          <span className="campo flex items-center bg-white p-0">
            <CampoMonto valor={importe} alCambiar={setImporte} etiqueta="Importe pagado" />
          </span>
          {importe > 0 && importe < falta && <span className="text-xs text-amber-800">Pago parcial: falta {formatoPesos(r2(falta - importe))}</span>}
          {importe > falta && <span className="text-xs text-amber-800">Supera lo que falta ({formatoPesos(falta)})</span>}
        </label>
        <label className="block">
          <span className="etiqueta">Medio de pago</span>
          <select name="medio" required defaultValue="Transferencia" className="campo">
            {MEDIOS_PAGO.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="etiqueta">Observación o N° de comprobante</span>
          <input name="observacion" maxLength={500} className="campo" />
        </label>
        <label className="block sm:col-span-2">
          <span className="etiqueta">Comprobante (opcional, PDF o imagen)</span>
          <input type="file" name="comprobante" accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm" />
        </label>
      </div>
      {error && <p className="alerta-error">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pendiente} className="boton py-1.5 text-sm">
          {pendiente ? "Guardando…" : "Registrar pago"}
        </button>
        <button type="button" onClick={alTerminar} className="boton-secundario py-1.5 text-sm">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Novedades del usuario (solicitudes nuevas o cambios de estado), con "marcar como leídas". */
export function Novedades({ lista }: { lista: { id: string; titulo: string; detalle: string | null; href: string | null; creado_en: string }[] }) {
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  if (!lista.length) return null;
  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-red-950">Novedades ({lista.length})</h2>
        <button type="button" disabled={pendiente} onClick={() => iniciar(async () => void (await marcarNotificacionesLeidas()))} className="text-xs text-red-900 underline">
          Marcar todas como leídas
        </button>
      </div>
      <ul className="mt-1 divide-y divide-red-100">
        {lista.map((n) => (
          <li key={n.id} className="flex flex-wrap items-baseline gap-x-2 py-1">
            <span className="text-xs text-red-800">{formatoFechaHora(n.creado_en)}</span>
            {n.href ? (
              <a
                href={n.href}
                onClick={(e) => {
                  e.preventDefault();
                  const destino = n.href ?? "/solicitudes-pago";
                  iniciar(async () => {
                    await marcarNotificacionesLeidas([n.id]);
                    router.push(destino, { scroll: false });
                  });
                }}
                className="font-medium text-red-950 underline"
              >
                {n.titulo}
              </a>
            ) : (
              <span className="font-medium text-red-950">{n.titulo}</span>
            )}
            {n.detalle && <span className="text-red-900">{n.detalle}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
