"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * En la compu el menú se ve siempre; en el celular queda arriba solo el logo
 * con un botón "Menú" que lo despliega (y se cierra al ir a otra pantalla).
 */
export function BarraLateral({ encabezado, children }: { encabezado: React.ReactNode; children: React.ReactNode }) {
  const ruta = usePathname();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  // Adentro de una sección (por ejemplo /stock/conteo) hay flecha para volver.
  const seccion = `/${ruta.split("/")[1] ?? ""}`;
  const hayAtras = ruta.split("/").filter(Boolean).length > 1;

  function volver() {
    // Si se llegó desde otra pantalla de la app, vuelve a esa; si se entró directo, al inicio de la sección.
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) router.back();
    else router.push(seccion);
  }
  const [ultimaRuta, setUltimaRuta] = useState(ruta);
  if (ruta !== ultimaRuta) {
    setUltimaRuta(ruta);
    setAbierto(false);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 pr-3 md:pr-0">
        <div className="flex min-w-0 items-center">
          {hayAtras && (
            <button
              type="button"
              onClick={volver}
              aria-label="Volver"
              className="ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white active:bg-stone-800 md:hidden"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-6 w-6">
                <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          {encabezado}
        </div>
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          className="flex h-10 items-center gap-2 rounded-lg border border-stone-700 px-3 text-sm font-medium text-white active:bg-stone-800 md:hidden"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-5 w-5">
            {abierto ? (
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L8.94 10l-4.72 4.72a.75.75 0 1 0 1.06 1.06L10 11.06l4.72 4.72a.75.75 0 1 0 1.06-1.06L11.06 10l4.72-4.72a.75.75 0 0 0-1.06-1.06L10 8.94 5.28 4.22Z" />
            ) : (
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
            )}
          </svg>
          Menú
        </button>
      </div>
      <div className={`${abierto ? "flex" : "hidden"} min-h-0 flex-1 flex-col md:flex`}>{children}</div>
    </>
  );
}
