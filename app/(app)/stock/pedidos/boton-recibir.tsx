"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { recibirPedidoCompleto } from "@/lib/pedidos/acciones";

/**
 * Marcar un pedido como recibido desde el historial: si llegó todo, entra al
 * stock de una (como movimiento de entrada); si llegó distinto, se corrige en el pedido.
 */
export function BotonRecibir({ id }: { id: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="boton-secundario whitespace-nowrap px-3 py-1 text-xs">
        Recibido
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-green-200 bg-green-50 p-2 text-xs">
      <span className="font-medium text-green-900">¿Llegó todo?</span>
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await recibirPedidoCompleto(id);
            if (r.error) return setError(r.error);
            setAbierto(false);
            router.refresh();
          })
        }
        className="rounded bg-green-700 px-2 py-1 font-semibold text-white hover:bg-green-800 disabled:opacity-50"
      >
        {pendiente ? "Cargando…" : "Sí, cargar al stock"}
      </button>
      <Link href={`/stock/pedidos/${id}?recibir=1`} className="rounded border border-stone-300 bg-white px-2 py-1 text-stone-700 hover:bg-stone-50">
        Llegó distinto
      </Link>
      <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="px-1 text-stone-500 hover:text-stone-900">×</button>
      {error && <span className="w-full text-red-700">{error}</span>}
    </div>
  );
}
