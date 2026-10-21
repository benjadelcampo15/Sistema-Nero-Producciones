"use client";

import { useActionState, useState } from "react";
import { responderPresupuesto } from "@/lib/presupuestos/publico";

export function AccionesCliente({ token, puedeResponder, titulo }: { token: string; puedeResponder: boolean; titulo: string }) {
  const [respuesta, setRespuesta] = useState<"aceptado" | "rechazado" | null>(null);

  return (
    <div className="space-y-3 print:hidden">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="boton-secundario"
          onClick={() => {
            // El nombre del PDF sale del título de la página.
            document.title = titulo;
            window.print();
          }}
        >
          Descargar PDF / Imprimir
        </button>
        {puedeResponder && !respuesta && (
          <>
            <button type="button" className="boton" onClick={() => setRespuesta("aceptado")}>
              Aceptar presupuesto
            </button>
            <button type="button" className="boton-secundario" onClick={() => setRespuesta("rechazado")}>
              Rechazar
            </button>
          </>
        )}
      </div>
      {puedeResponder && respuesta && <Confirmacion token={token} respuesta={respuesta} cancelar={() => setRespuesta(null)} />}
    </div>
  );
}

function Confirmacion({
  token,
  respuesta,
  cancelar,
}: {
  token: string;
  respuesta: "aceptado" | "rechazado";
  cancelar: () => void;
}) {
  const [estado, accion, enviando] = useActionState(responderPresupuesto.bind(null, token, respuesta), {});

  if (estado.ok) {
    return (
      <p className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
        {respuesta === "aceptado" ? "¡Listo! Recibimos tu aceptación. Nos vamos a contactar a la brevedad." : "Registramos que no vas a avanzar. ¡Gracias por avisar!"}
      </p>
    );
  }

  return (
    <form action={accion} className="tarjeta space-y-3">
      <p className="text-sm">
        {respuesta === "aceptado" ? "Para confirmar la aceptación, escribí tu nombre:" : "Para registrar el rechazo, escribí tu nombre:"}
      </p>
      {estado.error && <p className="alerta-error">{estado.error}</p>}
      <input name="nombre" required minLength={2} maxLength={120} placeholder="Nombre y apellido" className="campo max-w-sm" />
      <div className="flex gap-2">
        <button type="submit" disabled={enviando} className="boton">
          {enviando ? "Enviando…" : respuesta === "aceptado" ? "Confirmar aceptación" : "Confirmar rechazo"}
        </button>
        <button type="button" onClick={cancelar} className="text-sm text-stone-600 hover:text-stone-900">Cancelar</button>
      </div>
    </form>
  );
}
