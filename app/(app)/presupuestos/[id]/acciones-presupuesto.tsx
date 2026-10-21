"use client";

import { useActionState, useState, useTransition } from "react";
import {
  cambiarEstadoPresupuesto,
  crearEventoDesdePresupuesto,
  enviarPresupuestoPorMail,
  publicarPresupuesto,
  regenerarLink,
} from "@/lib/presupuestos/acciones";
import type { EstadoPresupuesto } from "@/lib/presupuestos/tipos";

export function AccionesPresupuesto({
  id,
  estado,
  emailCliente,
  mailHabilitado,
  tieneEvento,
}: {
  id: string;
  estado: EstadoPresupuesto;
  emailCliente: string | null;
  mailHabilitado: boolean;
  tieneEvento: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [mostrarMail, setMostrarMail] = useState(false);

  const ejecutar = (accion: () => Promise<{ error?: string } | void>, ok?: string, confirmar?: string) => {
    if (confirmar && !window.confirm(confirmar)) return;
    setAviso(null);
    iniciar(async () => {
      const r = await accion();
      if (r && "error" in r && r.error) setAviso({ tipo: "error", texto: r.error });
      else if (ok) setAviso({ tipo: "ok", texto: ok });
    });
  };

  const copiarLink = () =>
    iniciar(async () => {
      const r = await publicarPresupuesto(id);
      if (r.error || !r.url) {
        setAviso({ tipo: "error", texto: r.error ?? "No se pudo obtener el link" });
        return;
      }
      await navigator.clipboard.writeText(r.url).catch(() => undefined);
      setAviso({ tipo: "ok", texto: `Link copiado: ${r.url}` });
    });

  return (
    <div className="tarjeta space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pendiente} onClick={copiarLink} className="boton">Copiar link</button>
        <button type="button" disabled={pendiente} onClick={() => setMostrarMail((v) => !v)} className="boton-secundario">Enviar por mail</button>
        {estado !== "aceptado" && (
          <button type="button" disabled={pendiente} onClick={() => ejecutar(() => cambiarEstadoPresupuesto(id, "aceptado"), "Marcado como aceptado", "¿Marcar como aceptado?")} className="boton-secundario">
            Marcar aceptado
          </button>
        )}
        {estado !== "rechazado" && estado !== "aceptado" && (
          <button type="button" disabled={pendiente} onClick={() => ejecutar(() => cambiarEstadoPresupuesto(id, "rechazado"), "Marcado como rechazado", "¿Marcar como rechazado?")} className="boton-secundario">
            Marcar rechazado
          </button>
        )}
        {estado === "aceptado" && !tieneEvento && (
          <button type="button" disabled={pendiente} onClick={() => ejecutar(() => crearEventoDesdePresupuesto(id), undefined, "¿Crear el evento a partir de este presupuesto?")} className="boton">
            Crear evento
          </button>
        )}
        <button
          type="button"
          disabled={pendiente}
          onClick={() => ejecutar(() => regenerarLink(id), "Link nuevo generado: el anterior ya no funciona", "¿Generar un link nuevo? El que ya mandaste deja de funcionar.")}
          className="text-xs text-stone-500 underline hover:text-stone-900"
        >
          Anular link y generar otro
        </button>
      </div>
      <p className="text-xs text-stone-500">
        Al copiar el link o mandarlo por mail, el presupuesto pasa a “Enviado” y el cliente puede verlo.
      </p>

      {mostrarMail && <FormularioMail id={id} emailCliente={emailCliente} habilitado={mailHabilitado} />}

      {aviso && (
        <p className={aviso.tipo === "ok" ? "break-all text-sm text-green-700" : "alerta-error"}>{aviso.texto}</p>
      )}
    </div>
  );
}

function FormularioMail({ id, emailCliente, habilitado }: { id: string; emailCliente: string | null; habilitado: boolean }) {
  const [estado, accion, enviando] = useActionState(enviarPresupuestoPorMail.bind(null, id), {});

  if (!habilitado) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        El envío por mail todavía no está configurado. Por ahora usá “Copiar link”.
      </p>
    );
  }
  return (
    <form action={accion} className="space-y-3 border-t border-stone-200 pt-3">
      <div>
        <label htmlFor="para" className="etiqueta">Para</label>
        <input id="para" name="para" type="email" required defaultValue={emailCliente ?? ""} className="campo max-w-md" />
      </div>
      <div>
        <label htmlFor="mensaje" className="etiqueta">Mensaje <span className="font-normal text-stone-400">(opcional)</span></label>
        <textarea id="mensaje" name="mensaje" rows={3} maxLength={2000} placeholder="Te compartimos el presupuesto…" className="campo" />
      </div>
      {estado.error && <p className="alerta-error">{estado.error}</p>}
      {estado.ok && <p className="text-sm text-green-700">{estado.ok}</p>}
      <button type="submit" disabled={enviando} className="boton">{enviando ? "Enviando…" : "Enviar"}</button>
    </form>
  );
}
