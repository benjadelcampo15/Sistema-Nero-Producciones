"use client";

import { useEffect, useRef } from "react";
import { colorAvatar, iniciales, type Usuario } from "@/lib/tareas/tipos";

/** Avatar con iniciales (color fijo por persona). */
export function Avatar({ usuario, tam = 28, titulo }: { usuario: Pick<Usuario, "id" | "nombre"> | undefined; tam?: number; titulo?: string }) {
  if (!usuario) return null;
  return (
    <span
      title={titulo ?? usuario.nombre}
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ring-2 ring-white"
      style={{ width: tam, height: tam, fontSize: Math.round(tam * 0.4), background: colorAvatar(usuario.id) }}
    >
      {iniciales(usuario.nombre)}
    </span>
  );
}

/** Ventana superpuesta (cierra con Escape o clic afuera). */
export function Ventana({
  titulo,
  cerrar,
  children,
  ancho = "max-w-lg",
  sinTitulo,
}: {
  titulo: string;
  cerrar: () => void;
  children: React.ReactNode;
  ancho?: string;
  sinTitulo?: boolean;
}) {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [cerrar]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 sm:items-start sm:px-4 sm:py-12"
      onMouseDown={(e) => {
        if (!caja.current?.contains(e.target as Node)) cerrar();
      }}
    >
      <div ref={caja} role="dialog" aria-modal="true" aria-label={titulo} className={`relative w-full ${ancho} max-h-[94vh] overflow-y-auto rounded-t-2xl bg-stone-50 shadow-2xl sm:max-h-none sm:rounded-xl`}>
        {!sinTitulo && (
          <div className="flex items-center justify-between gap-2 border-b border-stone-200 px-5 py-3">
            <h2 className="font-semibold">{titulo}</h2>
            <button type="button" onClick={cerrar} aria-label="Cerrar" className="rounded p-1 text-xl leading-none text-stone-500 hover:bg-stone-200">
              ×
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Menú desplegable chico (estilo Trello), anclado al botón que lo abre. */
export function Menu({ abierto, cerrar, children, className = "" }: { abierto: boolean; cerrar: () => void; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && cerrar();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    const t = setTimeout(() => document.addEventListener("mousedown", fuera));
    window.addEventListener("keydown", tecla);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("keydown", tecla);
    };
  }, [abierto, cerrar]);
  if (!abierto) return null;
  return (
    <div ref={ref} className={`absolute z-40 mt-1 w-72 max-w-[90vw] rounded-lg border border-stone-200 bg-white p-2 text-sm text-stone-800 shadow-xl ${className}`}>
      {children}
    </div>
  );
}

export function OpcionMenu({ children, onClick, peligro, disabled }: { children: React.ReactNode; onClick: () => void; peligro?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`block w-full rounded px-3 py-1.5 text-left hover:bg-stone-100 disabled:opacity-50 ${peligro ? "text-red-700" : ""}`}
    >
      {children}
    </button>
  );
}
