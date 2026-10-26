"use client";

import { useState } from "react";
import { parsearMonto } from "@/lib/formato";

/** "-1.234,50" → -1234.5 (montos a la argentina, con signo). */
export function leerMonto(texto: string) {
  const negativo = texto.trim().startsWith("-");
  const valor = parsearMonto(texto.trim().replace(/^-/, ""));
  return valor === null ? null : negativo ? -valor : valor;
}

const mostrar = (n: number) => (n ? new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n) : "");

/**
 * Celda de monto tipo planilla: se escribe a la argentina ("1.500.000,50"),
 * se valida al escribir y al salir se muestra con separadores de miles.
 */
export function CampoMonto({
  valor,
  alCambiar,
  disabled,
  etiqueta,
  className = "",
}: {
  valor: number;
  alCambiar: (n: number) => void;
  disabled?: boolean;
  etiqueta: string;
  className?: string;
}) {
  // Mientras se escribe se muestra lo tecleado; si no, el valor (que puede cambiar por un cálculo automático).
  const [borrador, setBorrador] = useState<string | null>(null);
  const error = borrador !== null && borrador.trim() !== "" && leerMonto(borrador) === null;

  return (
    <input
      value={borrador ?? mostrar(valor)}
      disabled={disabled}
      inputMode="decimal"
      aria-label={etiqueta}
      onFocus={() => setBorrador(mostrar(valor))}
      onChange={(e) => {
        setBorrador(e.target.value);
        const n = e.target.value.trim() ? leerMonto(e.target.value) : 0;
        if (n !== null) alCambiar(n);
      }}
      onBlur={() => !error && setBorrador(null)}
      className={`w-full min-w-24 rounded border px-1.5 py-0.5 text-right font-mono text-sm ${
        error ? "border-red-400 bg-red-50" : "border-transparent bg-transparent hover:border-stone-200"
      } focus:border-stone-400 focus:bg-white focus:outline-none disabled:hover:border-transparent ${className}`}
    />
  );
}
