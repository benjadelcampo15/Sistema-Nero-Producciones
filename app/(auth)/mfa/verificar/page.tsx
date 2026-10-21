"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { salir } from "@/lib/auth/acciones";
import { CampoCodigo } from "../campo-codigo";

export default function PaginaVerificar2FA() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function verificar(codigo: string) {
    setEnviando(true);
    setError(null);
    const supabase = crearClienteNavegador();

    const { data: factores } = await supabase.auth.mfa.listFactors();
    const factor = factores?.totp[0];
    if (!factor) {
      setError("No encontramos tu verificación en dos pasos. Hablá con el administrador.");
      setEnviando(false);
      return;
    }

    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: codigo });
    if (error) {
      setError(
        error.status === 429
          ? "Demasiados intentos. Esperá unos minutos."
          : "Código incorrecto. Probá con el código nuevo.",
      );
      setEnviando(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="tarjeta space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Verificación en dos pasos</h1>
        <p className="mt-1 text-sm text-stone-600">Ingresá el código de 6 dígitos de tu app de autenticación.</p>
      </div>
      {error && <p className="alerta-error">{error}</p>}
      <CampoCodigo onCompleto={verificar} deshabilitado={enviando} />
      <p className="text-xs text-stone-500">
        ¿Perdiste el celular? Pedile al administrador que restablezca tu verificación en dos pasos.
      </p>
      <form action={salir}>
        <button type="submit" className="w-full text-center text-sm text-stone-500 hover:text-stone-900">
          Salir
        </button>
      </form>
    </div>
  );
}
