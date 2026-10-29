import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarDepositos, obtenerStock } from "@/lib/stock/consultas";
import { SinAcceso } from "../sin-acceso";
import { NavegacionStock } from "./navegacion";
import { ListaStock } from "./lista-stock";

export default async function PaginaStock({ searchParams }: PageProps<"/stock">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;

  const { deposito: parametro } = await searchParams;
  const [depositos, stock] = await Promise.all([listarDepositos(), obtenerStock()]);
  const deposito = depositos.find((d) => d.id === parametro);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Stock</h1>
        {puede(usuario, "stock", "editar") && (
          <Link href="/stock/movimientos" className="boton">+ Movimiento</Link>
        )}
      </div>

      <NavegacionStock actual="/stock" />

      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {[undefined, ...depositos].map((d) => (
          <Link
            key={d?.id ?? "general"}
            href={d ? `/stock?deposito=${d.id}` : "/stock"}
            scroll={false}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
              deposito?.id === d?.id
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
            }`}
          >
            {d ? d.nombre : "General"}
          </Link>
        ))}
      </nav>

      <ListaStock stock={stock} depositos={depositos} depositoId={deposito?.id ?? null} />
    </div>
  );
}