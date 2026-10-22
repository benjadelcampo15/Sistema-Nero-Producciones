"use client";

import { useActionState } from "react";
import { enviarFacturaPorMail } from "@/lib/facturar/acciones";

export function EnviarMail({ id, emailSugerido, yaEnviada }: { id: string; emailSugerido: string; yaEnviada: boolean }) {
  const [estado, accion, enviando] = useActionState(enviarFacturaPorMail.bind(null, id), {});

  return (
    <form action={accion} className="space-y-2">
      <input name="para" type="email" required defaultValue={emailSugerido} placeholder="cliente@empresa.com" className="campo" />
      <button type="submit" disabled={enviando} className="boton-secundario w-full">
        {enviando ? "Enviando…" : yaEnviada ? "Reenviar por mail" : "Enviar por mail"}
      </button>
      {estado.error && <p className="text-xs text-red-700">{estado.error}</p>}
      {estado.ok && <p className="text-xs text-green-700">{estado.ok}</p>}
    </form>
  );
}
