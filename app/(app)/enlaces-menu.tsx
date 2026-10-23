"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ItemMenu = { href: string; nombre: string; grupo: string };
export type GrupoMenu = { nombre: string; items: ItemMenu[] };

export function EnlacesMenu({ grupos }: { grupos: GrupoMenu[] }) {
  const ruta = usePathname();

  return (
    <nav className="flex flex-1 gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:gap-4 md:overflow-visible">
      {grupos.map((grupo) => (
        <div key={grupo.nombre} className="flex gap-1 md:flex-col">
          {/* En el celular el menú es una fila: los títulos de grupo solo se ven en la barra lateral. */}
          <p className="hidden px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-stone-500 md:block">{grupo.nombre}</p>
          {grupo.items.map((item) => {
            const activo = ruta === item.href || ruta.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${
                  activo ? "bg-stone-800 font-medium text-white" : "hover:bg-stone-900 hover:text-white"
                }`}
              >
                {item.nombre}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
