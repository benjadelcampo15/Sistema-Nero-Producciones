"use client";

import { useEffect, useState, useTransition } from "react";
import { guardarSolicitudesQuilmes } from "@/lib/quilmes/acciones";
import type { Solicitud } from "@/lib/quilmes/solicitudes";
import { TablaSolicitudes } from "@/components/tabla-solicitudes-quilmes";

/** Solicitudes Quilmes para quien maneja el presupuesto comercial sin ver los costos internos. */
export function SolicitudesComerciales({ eventoId, inicial, editable }: { eventoId: string; inicial: Solicitud[]; editable: boolean }) {
  const [lista, setLista] = useState(inicial);
  const [sinGuardar, setSinGuardar] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar]);

  const cambiar = (l: Solicitud[]) => {
    setLista(l);
    setSinGuardar(true);
    setMensaje(null);
  };
  const guardar = () =>
    iniciar(async () => {
      const r = await guardarSolicitudesQuilmes(eventoId, lista);
      if (r.error) return setMensaje({ tipo: "error", texto: r.error });
      if (r.solicitudes) setLista(r.solicitudes);
      setSinGuardar(false);
      setMensaje({ tipo: "ok", texto: "Solicitudes guardadas" });
    });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Solicitudes Quilmes <span className="text-sm font-normal text-stone-500">— precio de venta presupuestado</span></h2>
        {editable && (
          <div className="flex items-center gap-2">
            {mensaje && <p className={`text-sm ${mensaje.tipo === "error" ? "text-red-700" : "text-green-700"}`}>{mensaje.texto}</p>}
            <button type="button" onClick={guardar} disabled={pendiente || !sinGuardar} className="boton">
              {pendiente ? "Guardando…" : sinGuardar ? "Guardar solicitudes" : "Guardadas"}
            </button>
          </div>
        )}
      </div>
      <TablaSolicitudes lista={lista} editable={editable} alCambiar={cambiar} alQuitar={(id) => cambiar(lista.filter((s) => s.id !== id))} />
    </section>
  );
}
