import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerCategorias } from "@/lib/financiero/consultas";
import { SinAcceso } from "../../sin-acceso";
import { FormularioCategoria, BotonEstadoCategoria } from "./controles";

export default async function PaginaCategorias() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "editar")) return <SinAcceso />;

  const categorias = await obtenerCategorias({ incluirInactivas: true });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/financiero" className="text-sm text-stone-500 hover:text-stone-900">← Financiero</Link>
        <h1 className="mt-1 text-2xl font-semibold">Categorías</h1>
        <p className="mt-1 text-sm text-stone-600">
          Las categorías desactivadas no aparecen al cargar movimientos, pero se conservan en los existentes.
        </p>
      </div>

      <FormularioCategoria />

      <div className="grid gap-6 sm:grid-cols-2">
        {(["ingreso", "egreso"] as const).map((tipo) => (
          <section key={tipo} className="tarjeta p-0">
            <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">
              {tipo === "ingreso" ? "Ingresos" : "Egresos"}
            </h2>
            <ul className="divide-y divide-stone-100">
              {categorias
                .filter((c) => c.tipo === tipo)
                .map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className={c.activa ? "" : "text-stone-400 line-through"}>{c.nombre}</span>
                    <BotonEstadoCategoria id={c.id} activa={c.activa} />
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
