"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { salir } from "@/lib/auth/acciones";
import { CampoCodigo } from "../campo-codigo";

type Alta = { factorId: string; qr: string; secreto: string };

export default function PaginaConfigurar2FA() {
  const [alta, setAlta] = useState<Alta | null>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const iniciado = useRef(false);

  useEffect(() => {
    // En desarrollo React ejecuta los efectos dos veces; esto evita dar de alta dos factores.
    if (iniciado.current) return;
    iniciado.current = true;

    (async () => {
      const supabase = crearClienteNavegador();

      // Si quedó un alta a medias de otro intento, se descarta.
      const { data: factores } = await supabase.auth.mfa.listFactors();
      for (const factor of factores?.all ?? []) {
        if (factor.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Nero Admin",
        issuer: "Nero Producciones",
      });
      if (error || !data) {
        setError("No se pudo iniciar la configuración. Recargá la página.");
        return;
      }
      setAlta({ factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret });
    })();
  }, []);

  async function verificar(codigo: string) {
    if (!alta) return;
    setEnviando(true);
    setError(null);
    const { error } = await crearClienteNavegador().auth.mfa.challengeAndVerify({
      factorId: alta.factorId,
      code: codigo,
    });
    if (error) {
      setError("Código incorrecto. Revisá que la hora del celular esté bien y probá con el código nuevo.");
      setEnviando(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="tarjeta space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Configurá la verificación en dos pasos</h1>
        <p className="mt-1 text-sm text-stone-600">
          Escaneá el código con Google Authenticator, Microsoft Authenticator o similar. Después ingresá el código de 6 dígitos que te muestra la app.
        </p>
      </div>

      {error && <p className="alerta-error">{error}</p>}

      {alta ? (
        <>
          <div className="flex justify-center rounded-md border border-stone-200 bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- QR en data URL generado por Supabase */}
            <img src={alta.qr} alt="Código QR para la app de autenticación" className="h-48 w-48" />
          </div>
          <details className="text-sm text-stone-600">
            <summary className="cursor-pointer">¿No podés escanearlo? Ingresá esta clave a mano</summary>
            <code className="mt-2 block break-all rounded bg-stone-100 p-2 font-mono text-xs">{alta.secreto}</code>
          </details>
          <CampoCodigo onCompleto={verificar} deshabilitado={enviando} />
        </>
      ) : (
        !error && <p className="text-sm text-stone-500">Generando código…</p>
      )}

      <form action={salir}>
        <button type="submit" className="w-full text-center text-sm text-stone-500 hover:text-stone-900">
          Salir
        </button>
      </form>
    </div>
  );
}
