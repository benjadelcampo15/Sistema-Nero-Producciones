"use client";

import { useEffect } from "react";

function imprimir(titulo: string) {
  // El navegador usa el título de la página como nombre del PDF.
  document.title = titulo;
  window.print();
}

/** Con automatico, abre la ventana para guardar el PDF apenas carga la página. */
export function BotonImprimir({ titulo, automatico = false }: { titulo: string; automatico?: boolean }) {
  useEffect(() => {
    if (!automatico) return;
    const t = setTimeout(() => imprimir(titulo), 300);
    return () => clearTimeout(t);
  }, [automatico, titulo]);

  return (
    <button type="button" className="boton" onClick={() => imprimir(titulo)}>
      Descargar PDF / Imprimir
    </button>
  );
}
