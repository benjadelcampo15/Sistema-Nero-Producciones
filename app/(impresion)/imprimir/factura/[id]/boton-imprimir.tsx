"use client";

export function BotonImprimir({ titulo }: { titulo: string }) {
  return (
    <button
      type="button"
      className="boton"
      onClick={() => {
        // El navegador usa el título de la página como nombre del PDF.
        document.title = titulo;
        window.print();
      }}
    >
      Descargar PDF / Imprimir
    </button>
  );
}
