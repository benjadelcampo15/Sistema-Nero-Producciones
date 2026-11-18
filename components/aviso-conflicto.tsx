"use client";

/**
 * Otra persona guardó el mismo documento mientras se editaba: se elige entre
 * traer su versión (se descartan los cambios propios) o reemplazarla con la propia.
 */
export function AvisoConflicto({ alVerSuVersion, alGuardarIgual, pendiente }: { alVerSuVersion: () => void; alGuardarIgual: () => void; pendiente?: boolean }) {
  return (
    <div role="alert" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 print:hidden">
      <p>
        <strong>Otra persona guardó cambios acá mientras editabas.</strong> Para no perder nada sin querer, no se guardó tu versión.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pendiente} onClick={() => window.confirm("Se descartan tus cambios sin guardar y se traen los de la otra persona. ¿Seguir?") && alVerSuVersion()} className="boton-secundario py-1 text-sm">
          Ver su versión
        </button>
        <button type="button" disabled={pendiente} onClick={() => window.confirm("Tu versión reemplaza lo que guardó la otra persona. ¿Guardar igual?") && alGuardarIgual()} className="boton py-1 text-sm">
          Guardar igual
        </button>
      </div>
    </div>
  );
}
