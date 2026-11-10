"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type ProveedorCuenta = { id: string; nombre: string; cuit: string | null };

const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Proveedor con cuenta corriente de un gasto de la planilla (opcional): un
 * botón que abre un buscador. Con pagos ya hechos desde la cuenta queda fijo.
 */
export function SelectorProveedor({
  valor,
  proveedores,
  empresa,
  editable,
  bloqueado,
  alCambiar,
}: {
  valor: string | null | undefined;
  proveedores: ProveedorCuenta[];
  empresa: string;
  editable: boolean;
  /** Tiene pagos desde la cuenta corriente: no se puede cambiar ni quitar. */
  bloqueado: boolean;
  alCambiar: (id: string | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const caja = useRef<HTMLSpanElement>(null);
  const elegido = proveedores.find((p) => p.id === valor);

  // Se cierra al tocar afuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: PointerEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  const texto = normalizar(busqueda.trim());
  const visibles = proveedores.filter((p) => !texto || normalizar(p.nombre).includes(texto) || (p.cuit ?? "").includes(texto)).slice(0, 60);
  const elegir = (id: string | null) => {
    setAbierto(false);
    setBusqueda("");
    if (id !== (valor ?? null)) alCambiar(id);
  };

  const nombre = elegido ? elegido.nombre : valor ? "Proveedor (no disponible)" : null;
  return (
    <span ref={caja} className="relative flex items-center gap-1">
      <button
        type="button"
        disabled={!editable || bloqueado}
        onClick={() => setAbierto(!abierto)}
        title={bloqueado ? "Tiene pagos registrados desde la cuenta corriente: para cambiarlo, eliminá primero esos pagos" : "Proveedor con cuenta corriente (opcional)"}
        className={`w-full min-w-40 truncate rounded border border-transparent px-1.5 py-0.5 text-left text-xs hover:border-stone-200 disabled:hover:border-transparent ${
          nombre ? "font-medium text-stone-900" : "text-stone-400"
        }`}
      >
        {nombre ?? "Sin cuenta corriente"}
        {bloqueado && " 🔒"}
      </button>
      {valor && (
        <Link
          href={`/facturas/cuentas/${valor}?empresa=${empresa}`}
          title="Ver la cuenta corriente del proveedor"
          className="shrink-0 px-0.5 text-xs text-stone-400 hover:text-stone-900 print:hidden"
        >
          ↗
        </Link>
      )}
      {abierto && (
        <span className="absolute left-0 top-full z-30 mt-1 block w-72 max-w-[85vw] rounded-lg border border-stone-200 bg-white p-2 text-left shadow-lg">
          <input
            autoFocus
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar proveedor…"
            aria-label="Buscar proveedor"
            className="campo py-1 text-sm"
          />
          <span className="mt-1 block max-h-60 overflow-y-auto">
            <button type="button" onClick={() => elegir(null)} className="block w-full rounded px-2 py-1.5 text-left text-sm text-stone-500 hover:bg-stone-100">
              Sin cuenta corriente
            </button>
            {visibles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => elegir(p.id)}
                className={`block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-stone-100 ${p.id === valor ? "font-semibold" : ""}`}
              >
                {p.nombre}
                {p.cuit && <span className="ml-1 text-xs text-stone-400">{p.cuit}</span>}
              </button>
            ))}
            {!visibles.length && <span className="block px-2 py-1.5 text-sm text-stone-500">No hay proveedores con ese nombre.</span>}
          </span>
        </span>
      )}
    </span>
  );
}
