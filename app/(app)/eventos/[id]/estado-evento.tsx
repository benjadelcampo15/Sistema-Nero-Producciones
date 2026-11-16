"use client";

import { useState, useTransition } from "react";
import { cambiarEstadoEvento, reintentarSincronizacion } from "@/lib/eventos/acciones";
import { COLOR_ESTADO_EVENTO, ESTADOS_EVENTO, NOMBRE_ESTADO_EVENTO, type EstadoEvento, type Evento } from "@/lib/eventos/tipos";

export const MENSAJE_CIERRE = "¿Confirmás el cierre de este evento? Al cerrarlo, sus ingresos y gastos se sincronizarán con el módulo Financiero.";
export const MENSAJE_REAPERTURA =
  "Este evento ya tiene movimientos sincronizados con Financiero. Si cambiás el estado, los movimientos pendientes que salieron de la planilla dejan de contar en Financiero hasta que lo vuelvas a cerrar (los pagos y cobros reales quedan). ¿Seguir?";

/** Estado del evento: se cambia acá, con confirmación al cerrar (sincroniza) o al reabrir uno cerrado. */
export function EstadoDelEvento({ evento, editable }: { evento: Evento; editable: boolean }) {
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cambiar = (estado: EstadoEvento) => {
    if (estado === evento.estado) return;
    if (estado === "cerrado" && !window.confirm(MENSAJE_CIERRE)) return;
    if (evento.estado === "cerrado" && evento.planilla_en_financiero && !window.confirm(MENSAJE_REAPERTURA)) return;
    setMensaje(null);
    iniciar(async () => {
      const r = await cambiarEstadoEvento(evento.id, estado);
      setMensaje(r.error ? { tipo: "error", texto: r.error } : { tipo: "ok", texto: r.ok ?? "Listo" });
    });
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {editable ? (
        <select
          value={evento.estado}
          disabled={pendiente}
          onChange={(e) => cambiar(e.target.value as EstadoEvento)}
          aria-label="Estado del evento"
          className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO_EVENTO[evento.estado]}`}
        >
          {ESTADOS_EVENTO.map((e) => (
            <option key={e} value={e}>{NOMBRE_ESTADO_EVENTO[e]}</option>
          ))}
        </select>
      ) : (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO_EVENTO[evento.estado]}`}>{NOMBRE_ESTADO_EVENTO[evento.estado]}</span>
      )}
      {pendiente && <span className="text-xs text-stone-500">{evento.estado !== "cerrado" ? "Sincronizando…" : "Guardando…"}</span>}
      {mensaje && (
        <span role="status" className={`basis-full text-xs ${mensaje.tipo === "error" ? "text-red-700" : "text-green-700"}`}>
          {mensaje.texto}
        </span>
      )}
    </span>
  );
}

/** Indicador de sincronización con Financiero (en la planilla). */
export function IndicadorSincronizacion({ evento, editable }: { evento: Evento; editable: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  if (!evento.planilla_en_financiero) {
    return <p className="text-xs text-stone-500">Evento anterior al vínculo automático: sus movimientos se cargan a mano en Financiero.</p>;
  }
  if (evento.estado !== "cerrado") {
    return (
      <p className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
        <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden /> Pendiente de cierre — No enviado a Financiero
      </p>
    );
  }
  if (evento.sync_estado === "error") {
    return (
      <span className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-1 text-xs text-red-900 ring-1 ring-red-200">
        <span className="h-2 w-2 rounded-full bg-red-600" aria-hidden />
        <strong>Error: sincronización pendiente de completar.</strong>
        {evento.sync_error && <span>{evento.sync_error}</span>}
        {editable && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              iniciar(async () => {
                const r = await reintentarSincronizacion(evento.id);
                setError(r.error ?? null);
              })
            }
            className="font-medium underline"
          >
            {pendiente ? "Reintentando…" : "Reintentar"}
          </button>
        )}
        {error && <span className="basis-full">{error}</span>}
      </span>
    );
  }
  return (
    <p className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-900 ring-1 ring-green-200">
      <span className="h-2 w-2 rounded-full bg-green-600" aria-hidden /> Sincronizado con Financiero
    </p>
  );
}
