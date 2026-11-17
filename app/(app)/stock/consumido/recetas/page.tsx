import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { productosStock, recetasEmpresa } from "@/lib/stock/consumido";
import { EMPRESAS, NOMBRE_EMPRESA } from "@/lib/empresas";
import { SinAcceso } from "../../../sin-acceso";
import { NavegacionStock } from "../../navegacion";
import { EditorRecetas } from "./editor";

/** Mapeo FUDO → Stock: qué productos de stock (y cuánto) consume cada producto vendido en FUDO. */
export default async function PaginaRecetas({ searchParams }: PageProps<"/stock/consumido/recetas">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;
  const { empresa: e } = await searchParams;
  const empresa = EMPRESAS.find((x) => x === e) ?? EMPRESAS[0];
  const [recetas, productos] = await Promise.all([recetasEmpresa(empresa), productosStock()]);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/stock/consumido" className="text-sm text-stone-500 hover:text-stone-900">← Consumido</Link>
        <h1 className="text-2xl font-semibold">Productos de FUDO y recetas</h1>
        <p className="text-sm text-stone-500">
          Cada producto vendido en FUDO se traduce a productos de stock: un combo “CORONA X 6” consume 6 Corona; un trago consume una fracción de botella. Los productos nuevos de cada importación aparecen como pendientes y no se atribuyen hasta configurarlos.
        </p>
      </div>
      <NavegacionStock actual="/stock/consumido" />
      <nav className="flex gap-1">
        {EMPRESAS.map((x) => (
          <Link key={x} href={`/stock/consumido/recetas?empresa=${x}`} className={`rounded-full px-3 py-1 text-sm ${x === empresa ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}>
            {NOMBRE_EMPRESA[x]}
          </Link>
        ))}
      </nav>
      <EditorRecetas key={empresa} recetas={recetas} productos={productos} edita={puede(usuario, "stock", "editar")} />
    </div>
  );
}
