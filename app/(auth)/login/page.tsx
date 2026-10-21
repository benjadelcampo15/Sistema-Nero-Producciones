"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";

export default function PaginaLogin() {
  return (
    <Suspense>
      <FormularioLogin />
    </Suspense>
  );
}

function FormularioLogin() {
  const parametros = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    parametros.get("error") === "inactivo"
      ? "Tu usuario está desactivado. Hablá con el administrador."
      : null,
  );
  const [enviando, setEnviando] = useState(false);

  async function ingresar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const datos = new FormData(e.currentTarget);
    // El login va directo desde el navegador a Supabase: así el límite de
    // intentos se aplica por IP de cada persona y no a la del servidor.
    const { error } = await crearClienteNavegador().auth.signInWithPassword({
      email: String(datos.get("email")).trim(),
      password: String(datos.get("password")),
    });

    if (error) {
      setError(
        error.status === 429
          ? "Demasiados intentos. Esperá unos minutos."
          : "Email o contraseña incorrectos.",
      );
      setEnviando(false);
      return;
    }

    // El proxy decide el siguiente paso (cambiar contraseña o 2FA).
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={ingresar} className="tarjeta space-y-4">
      <h1 className="text-lg font-semibold">Ingresar</h1>
      {error && <p className="alerta-error">{error}</p>}
      <div>
        <label htmlFor="email" className="etiqueta">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="campo" />
      </div>
      <div>
        <label htmlFor="password" className="etiqueta">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="campo" />
      </div>
      <button type="submit" disabled={enviando} className="boton w-full">
        {enviando ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
