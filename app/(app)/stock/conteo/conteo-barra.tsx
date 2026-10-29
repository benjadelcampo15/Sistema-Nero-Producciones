"use client";

import dynamic from "next/dynamic";

/**
 * El conteo se arma solo en el navegador: así puede retomar el borrador que
 * quedó guardado en el celular (si se bloqueó o se recargó la página).
 */
export const ConteoBarra = dynamic(() => import("./conteo-cliente").then((m) => m.ConteoCliente), {
  ssr: false,
  loading: () => <p className="py-10 text-center text-sm text-stone-500">Cargando el conteo…</p>,
});
