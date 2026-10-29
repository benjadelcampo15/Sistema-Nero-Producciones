"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { borrarComprobante } from "@/lib/facturar/acciones";
import { borrarCliente } from "@/lib/clientes/acciones";

/** Borra un comprobante de la app. Si es real y autorizado, avisa que en ARCA sigue existiendo. */
export function BotonBorrarComprobante({ id, irA, real = false }: { id: string; irA?: string; real?: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      className="text-xs text-red-700 hover:underline disabled:opacity-50"
      onClick={() => {
        const aviso = real
          ? "Es una factura REAL autorizada por ARCA. Se borra solo de la app: para ARCA sigue existiendo y para anularla hay que emitir una nota de crédito. ¿Borrarla igual?"
          : "¿Borrar este comprobante de la app? No se puede deshacer.";
        if (!window.confirm(aviso)) return;
        iniciar(async () => {
          const r = await borrarComprobante(id);
          if (r.error) window.alert(r.error);
          else if (irA) router.push(irA);
        });
      }}
    >
      {pendiente ? "Borrando…" : "Borrar"}
    </button>
  );
}

export function BotonBorrarCliente({ id, nombre, irA }: { id: string; nombre: string; irA?: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      className="text-xs text-red-700 hover:underline disabled:opacity-50"
      onClick={(e) => {
        e.preventDefault();
        if (!window.confirm(`¿Borrar a ${nombre}?`)) return;
        iniciar(async () => {
          const r = await borrarCliente(id);
          if (r.error) window.alert(r.error);
          else if (irA) router.push(irA);
        });
      }}
    >
      Borrar
    </button>
  );
}
