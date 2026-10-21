"use client";

import { useState } from "react";

/** Campo para el código de 6 dígitos; envía solo al completarlo o con Enter. */
export function CampoCodigo({
  onCompleto,
  deshabilitado,
}: {
  onCompleto: (codigo: string) => void;
  deshabilitado: boolean;
}) {
  const [codigo, setCodigo] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (codigo.length === 6) onCompleto(codigo);
      }}
      className="space-y-3"
    >
      <label htmlFor="codigo" className="etiqueta">Código</label>
      <input
        id="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        value={codigo}
        disabled={deshabilitado}
        onChange={(e) => {
          const limpio = e.target.value.replace(/\D/g, "").slice(0, 6);
          setCodigo(limpio);
          if (limpio.length === 6) onCompleto(limpio);
        }}
        className="campo text-center font-mono text-2xl tracking-[0.5em]"
        placeholder="000000"
      />
      <button type="submit" disabled={deshabilitado || codigo.length !== 6} className="boton w-full">
        {deshabilitado ? "Verificando…" : "Verificar"}
      </button>
    </form>
  );
}
