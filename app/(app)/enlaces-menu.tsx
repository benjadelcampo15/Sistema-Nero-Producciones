"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ItemMenu = { href: string; nombre: string };

export function EnlacesMenu({ items }: { items: ItemMenu[] }) {
  const ruta = usePathname();

  return (
    <nav className="flex flex-1 gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
      {items.map((item) => {
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
    </nav>
  );
}
