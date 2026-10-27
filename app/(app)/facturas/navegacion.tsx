import Link from "next/link";

const ENLACES = [
  { href: "/facturas", nombre: "Facturas" },
  { href: "/facturas/proveedores", nombre: "Proveedores" },
];

export function NavegacionFacturas({ actual }: { actual: string }) {
  return (
    <nav className="flex gap-1 border-b border-stone-200">
      {ENLACES.map((e) => (
        <Link
          key={e.href}
          href={e.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
            actual === e.href ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-900"
          }`}
        >
          {e.nombre}
        </Link>
      ))}
    </nav>
  );
}
