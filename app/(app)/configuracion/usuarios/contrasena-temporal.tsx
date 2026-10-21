"use client";

import { useState } from "react";

export function ContrasenaTemporal({ email, contrasena }: { email?: string; contrasena: string }) {
  const [copiada, setCopiada] = useState(false);

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
      <p className="font-medium text-amber-900">Contraseña temporal{email ? ` de ${email}` : ""}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="rounded bg-white px-2 py-1 font-mono text-base">{contrasena}</code>
        <button
          type="button"
          className="boton-secundario"
          onClick={async () => {
            await navigator.clipboard.writeText(contrasena);
            setCopiada(true);
          }}
        >
          {copiada ? "Copiada" : "Copiar"}
        </button>
      </div>
      <p className="mt-2 text-amber-900">
        Pasásela por un medio privado. Se muestra una sola vez: la va a tener que cambiar en su primer ingreso y después configurar la verificación en dos pasos.
      </p>
    </div>
  );
}
