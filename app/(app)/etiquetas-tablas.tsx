"use client";

import { useEffect } from "react";

const TABLAS = 'table[class*="min-w-"], table.tabla-movil';

/** A cada celda le pone el título de su columna: en el celular se ve como etiqueta (ver globals.css). */
function etiquetar() {
  document.querySelectorAll<HTMLTableElement>(TABLAS).forEach((tabla) => {
    const titulos: string[] = [];
    const encabezado = tabla.tHead?.rows[tabla.tHead.rows.length - 1];
    for (const celda of encabezado?.cells ?? []) {
      for (let i = 0; i < celda.colSpan; i++) titulos.push(celda.textContent?.trim() ?? "");
    }
    for (const seccion of [...tabla.tBodies, ...(tabla.tFoot ? [tabla.tFoot] : [])]) {
      for (const fila of seccion.rows) {
        let columna = 0;
        for (const celda of fila.cells) {
          const titulo = celda.colSpan === 1 ? titulos[columna] : "";
          if (titulo && celda.getAttribute("data-etiqueta") !== titulo) celda.setAttribute("data-etiqueta", titulo);
          columna += celda.colSpan;
        }
      }
    }
  });
}

/** Mantiene las etiquetas al día cuando las tablas cambian (filtros, filas nuevas, navegación). */
export function EtiquetasTablas() {
  useEffect(() => {
    let pendiente: ReturnType<typeof setTimeout>;
    // Solo hacen falta en el celular (en la compu se ve la tabla con su encabezado).
    const celular = window.matchMedia("(max-width: 767px)");
    // Con una espera: las tablas que llegan en streaming tienen que hidratarse antes de tocarlas.
    const programar = () => {
      clearTimeout(pendiente);
      if (celular.matches) pendiente = setTimeout(etiquetar, 300);
    };
    programar();
    const observador = new MutationObserver(programar);
    observador.observe(document.body, { childList: true, subtree: true });
    celular.addEventListener("change", programar);
    return () => {
      observador.disconnect();
      celular.removeEventListener("change", programar);
      clearTimeout(pendiente);
    };
  }, []);
  return null;
}
