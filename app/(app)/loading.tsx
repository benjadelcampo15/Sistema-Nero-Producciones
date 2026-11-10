/**
 * Mientras llega una pantalla: la forma de la página (título, tarjetas y tabla)
 * en gris suave. Aparece con un leve retraso, así en las cargas rápidas no se ve.
 */
export default function Cargando() {
  return (
    <div className="esqueleto space-y-6" role="status" aria-live="polite" aria-label="Cargando">
      <div className="space-y-2">
        <div className="h-7 w-56 max-w-full rounded-md bg-stone-200" />
        <div className="h-4 w-96 max-w-full rounded bg-stone-200/70" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="tarjeta space-y-3 p-4">
            <div className="h-3 w-24 rounded bg-stone-200/80" />
            <div className="h-6 w-36 max-w-full rounded bg-stone-200" />
          </div>
        ))}
      </div>

      <div className="tarjeta overflow-hidden p-0">
        <div className="flex gap-6 border-b border-stone-200 bg-stone-50 px-4 py-3">
          {[20, 32, 16, 16].map((w, i) => (
            <div key={i} className="h-3 rounded bg-stone-200" style={{ width: `${w}%` }} />
          ))}
        </div>
        {[0, 1, 2, 3, 4, 5, 6].map((fila) => (
          <div key={fila} className="flex gap-6 border-b border-stone-100 px-4 py-3.5 last:border-0">
            {[20, 32, 16, 16].map((w, i) => (
              <div key={i} className="h-3.5 rounded bg-stone-200/70" style={{ width: `${w - ((fila + i) % 3) * 3}%` }} />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
