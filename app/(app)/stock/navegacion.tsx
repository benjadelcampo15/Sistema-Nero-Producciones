import Link from "next/link";

const ENLACES = [
  { href: "/stock", nombre: "Stock" },
  { href: "/stock/movimientos", nombre: "Movimientos" },
  { href: "/stock/pedidos", nombre: "Pedidos" },
  { href: "/stock/productos", nombre: "Productos" },
  { href: "/stock/depositos", nombre: "Depósitos" },
  { href: "/stock/importar", nombre: "Importar Excel" },
];

/** Sub-navegación de la sección Stock. */
export function NavegacionStock({ actual }: { actual: string }) {
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-stone-200 px-4 md:mx-0 md:px-0">
      {ENLACES.map((e) => (
        <Link
          key={e.href}
          href={e.href}
          className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
            actual === e.href ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-900"
          }`}
        >
          {e.nombre}
        </Link>
      ))}
    </nav>
  );
}
