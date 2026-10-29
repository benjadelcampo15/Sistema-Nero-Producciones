/**
 * Logo de Planix: una "P" armada con bloques, como un tablero de planificación.
 * Los bloques se iluminan en ámbar uno tras otro (una ola suave), recorriendo
 * la P de abajo hacia arriba y por la panza. Toma el color del texto
 * (currentColor). La animación es CSS (globals.css) y se apaga con "reducir movimiento".
 */
const LADO = 12.5;
const ESPACIO = 3;
const X0 = 10;
const Y0 = 3.75;

// Bloques de la P en una grilla de 2 columnas × 3 filas, en el orden en que se iluminan.
const BLOQUES: [columna: number, fila: number][] = [
  [0, 2],
  [0, 1],
  [0, 0],
  [1, 0],
  [1, 1],
];

export function LogoPlanix({ className = "h-8 w-8", animado = true }: { className?: string; animado?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Planix">
      {BLOQUES.map(([c, f], i) => {
        // La panza de la P (arriba a la derecha) va más redondeada.
        const panza = c === 1;
        return (
          <rect
            key={`${c}-${f}`}
            x={X0 + c * (LADO + ESPACIO)}
            y={Y0 + f * (LADO + ESPACIO)}
            width={LADO}
            height={LADO}
            rx={panza ? 5 : 3}
            fill={!animado && i === BLOQUES.length - 1 ? "#f59e0b" : "currentColor"}
            className={animado ? "planix-bloque" : undefined}
            style={animado ? { animationDelay: `${i * 0.35}s` } : undefined}
          />
        );
      })}
    </svg>
  );
}
