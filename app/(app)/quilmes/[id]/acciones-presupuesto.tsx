"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { emitirPresupuestoQuilmes } from "@/lib/quilmes/acciones";

/**
 * Generar presupuesto para Quilmes: emite la versión (si no cambió nada, reusa
 * la última) y la descarga o imprime. Solo trabaja con el documento comercial:
 * no recibe ni manda costos.
 */
export function AccionesPresupuesto({ eventoId, version, editable, accion }: { eventoId: string; version: number | null; editable: boolean; accion?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const hecho = useRef(false);
  const pdf = version ? `/quilmes/${eventoId}/presupuesto/${version}/pdf` : null;

  // Después de emitir: la acción pedida se hace una sola vez sobre la versión emitida.
  useEffect(() => {
    if (!version || hecho.current || !accion) return;
    hecho.current = true;
    if (accion === "imprimir") window.print();
    else if (accion === "pdf" && pdf) window.location.assign(pdf);
  }, [accion, version, pdf]);

  const emitir = (despues: "pdf" | "imprimir") =>
    iniciar(async () => {
      setError(null);
      const r = await emitirPresupuestoQuilmes(eventoId);
      if (r.error || !r.version) return setError(r.error ?? "No se pudo emitir");
      setAviso(r.nueva ? `Versión ${r.version} emitida.` : `Sin cambios desde la versión ${r.version}: se usa esa.`);
      router.push(`/quilmes/${eventoId}?vista=presupuesto&v=${r.version}&accion=${despues}`);
    });

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {version ? (
        <>
          <a href={pdf!} className="boton">Descargar PDF</a>
          <button type="button" onClick={() => window.print()} className="boton-secundario">Imprimir</button>
        </>
      ) : editable ? (
        <>
          <button type="button" disabled={pendiente} onClick={() => emitir("pdf")} className="boton">{pendiente ? "Emitiendo…" : "Emitir y descargar PDF"}</button>
          <button type="button" disabled={pendiente} onClick={() => emitir("imprimir")} className="boton-secundario">Emitir e imprimir</button>
        </>
      ) : (
        <p className="text-sm text-stone-500">Para emitir el presupuesto hace falta permiso de edición de Quilmes.</p>
      )}
      {aviso && <p className="text-sm text-green-700">{aviso}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <p className="basis-full text-xs text-stone-500">
        Emitir, imprimir o descargar no genera cobros, facturas ni movimientos, y no cambia el estado del evento. Si los precios no cambiaron, no se crea otra versión.
      </p>
    </div>
  );
}
