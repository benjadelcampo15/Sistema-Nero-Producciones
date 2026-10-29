"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type ItemMenu = { href: string; nombre: string };
export type GrupoMenu = { nombre: string; items: ItemMenu[] };

/** El ítem de la ruta actual: el de href más largo que la contiene (/stock/pedidos gana a /stock). */
function itemActivo(grupos: GrupoMenu[], ruta: string) {
  return grupos
    .flatMap((g) => g.items)
    .filter((i) => ruta === i.href || ruta.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/** Menú lateral en grupos desplegables; el grupo de la pantalla actual arranca abierto. */
export function EnlacesMenu({ grupos }: { grupos: GrupoMenu[] }) {
  const ruta = usePathname();
  const activo = itemActivo(grupos, ruta);
  const grupoActivo = grupos.find((g) => g.items.some((i) => i.href === activo))?.nombre;
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(grupoActivo ? [grupoActivo] : []));
  // Al navegar a otro grupo (por un link dentro de una pantalla), ese grupo se abre.
  const [ultimoActivo, setUltimoActivo] = useState(grupoActivo);
  if (grupoActivo !== ultimoActivo) {
    setUltimoActivo(grupoActivo);
    if (grupoActivo && !abiertos.has(grupoActivo)) setAbiertos(new Set([...abiertos, grupoActivo]));
  }

  const alternar = (nombre: string) =>
    setAbiertos((a) => {
      const n = new Set(a);
      if (n.has(nombre)) n.delete(nombre);
      else n.add(nombre);
      return n;
    });

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 pb-3">
      {grupos.map((grupo) => {
        const abierto = abiertos.has(grupo.nombre);
        return (
          <div key={grupo.nombre}>
            <button
              type="button"
              onClick={() => alternar(grupo.nombre)}
              aria-expanded={abierto}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs font-semibold uppercase tracking-widest hover:bg-stone-900 hover:text-white ${
                grupo.nombre === grupoActivo ? "text-white" : "text-stone-400"
              }`}
            >
              {grupo.nombre}
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`}>
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
              </svg>
            </button>
            {abierto && (
              <div className="mb-2 mt-0.5 flex flex-col gap-0.5 border-l border-stone-800 pl-2 ml-3">
                {grupo.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${item.href === activo ? "bg-stone-800 font-medium text-white" : "hover:bg-stone-900 hover:text-white"}`}
                  >
                    {item.nombre}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
