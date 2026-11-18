"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cambiosSinGuardar } from "@/lib/cambios-pendientes";

type Aviso = { tipo: "ok" | "error"; texto: string } | null;

/**
 * Actualizar: vuelve a pedir al servidor los datos de la pantalla (lo que
 * guardaron los demás) sin recargar la página: misma URL, mismos filtros,
 * empresa, período y evento. No repite ninguna operación (solo lee). Si hay
 * cambios sin guardar, avisa y no los pisa.
 */
export function BotonActualizar() {
  const router = useRouter();
  const [actualizando, iniciar] = useTransition();
  const [aviso, setAviso] = useState<Aviso>(null);
  const [pendientes, setPendientes] = useState<{ nombre: string; guardar?: () => void }[] | null>(null);
  const [pedido, setPedido] = useState(false);

  // Cuando termina la actualización, se confirma (discreto, se va solo).
  const [estabaActualizando, setEstabaActualizando] = useState(false);
  if (actualizando !== estabaActualizando) {
    setEstabaActualizando(actualizando);
    if (!actualizando && pedido) {
      setPedido(false);
      setAviso({ tipo: "ok", texto: "Datos actualizados correctamente" });
    }
  }
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.tipo === "ok" ? 2500 : 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  const actualizar = async () => {
    setAviso(null);
    // Primero se verifica la conexión: si falla, la información visible queda como está.
    try {
      const r = await fetch(window.location.href, { method: "HEAD", cache: "no-store", credentials: "same-origin" });
      if (!r.ok && r.status !== 405) throw new Error();
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo conectar con el servidor. Revisá la conexión y volvé a intentar: no se perdió nada de lo que ves." });
      return;
    }
    setPedido(true);
    iniciar(() => router.refresh());
  };

  const pedir = () => {
    const sinGuardar = cambiosSinGuardar();
    if (sinGuardar.length) return setPendientes(sinGuardar);
    void actualizar();
  };

  return (
    <div className="relative flex items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={pedir}
        disabled={actualizando}
        aria-busy={actualizando}
        title="Traer los cambios que hicieron otros usuarios (sin recargar la página)"
        className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 shadow-sm hover:border-stone-500 hover:text-stone-900 disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${actualizando ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
          <path d="M3 21v-5h5" />
          <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
        {actualizando ? "Actualizando…" : "Actualizar"}
      </button>
      {aviso && (
        <span role="status" className={`text-xs ${aviso.tipo === "ok" ? "text-green-700" : "max-w-xs text-red-700"}`}>
          {aviso.texto}
        </span>
      )}

      {pendientes && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && setPendientes(null)}>
          <div role="alertdialog" aria-modal="true" aria-label="Cambios sin guardar" className="w-full max-w-md space-y-3 rounded-t-2xl bg-white p-5 text-sm shadow-xl sm:rounded-2xl">
            <h2 className="text-lg font-semibold">Tenés cambios sin guardar</h2>
            <p className="text-stone-700">Guardá tus modificaciones antes de actualizar. Actualizar ahora no los borra: primero hay que guardarlos o cancelar.</p>
            <ul className="list-disc pl-5 text-stone-600">
              {pendientes.map((p, i) => <li key={i}>{p.nombre}</li>)}
            </ul>
            <div className="flex flex-wrap gap-2">
              {pendientes.some((p) => p.guardar) && (
                <button
                  type="button"
                  onClick={() => {
                    for (const p of pendientes) p.guardar?.();
                    setPendientes(null);
                    setAviso({ tipo: "ok", texto: "Guardando… cuando termine, tocá Actualizar" });
                  }}
                  className="boton"
                >
                  Guardar cambios
                </button>
              )}
              <button type="button" onClick={() => setPendientes(null)} className="boton-secundario">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
