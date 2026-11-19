import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { eventosConStock } from "@/lib/stock/por-evento";
import { formatoFecha, hoy } from "@/lib/formato";
import { EtiquetaEmpresa } from "@/components/empresa";
import { SinAcceso } from "../../sin-acceso";
import { NavegacionStock } from "../navegacion";

/** Stock por evento: elegir qué productos se usan en cada evento y bajar el PDF con su stock. */
export default async function PaginaStockEventos() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;
  const eventos = await eventosConStock();
  const fechaHoy = hoy();
  // Primero los próximos (del más cercano al más lejano), después los pasados.
  const proximos = eventos.filter((e) => e.fecha >= fechaHoy).reverse();
  const pasados = eventos.filter((e) => e.fecha < fechaHoy);

  const lista = (titulo: string, items: typeof eventos) =>
    items.length > 0 && (
      <section className="space-y-2">
        <h2 className="font-semibold">{titulo}</h2>
        <ul className="tarjeta divide-y divide-stone-100 p-0">
          {items.map((e) => (
            <li key={e.id}>
              <Link href={`/stock/eventos/${e.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm hover:bg-stone-50">
                <span className="w-24 font-mono text-stone-600">{formatoFecha(e.fecha)}</span>
                <span className="font-medium">{e.nombre}</span>
                <EtiquetaEmpresa empresa={e.empresa} />
                {e.tipo === "quilmes" && <span className="rounded bg-sky-100 px-1 text-[10px] font-bold uppercase text-sky-900">Quilmes</span>}
                <span className={`ml-auto text-xs ${e.productos ? "text-stone-700" : "text-stone-400"}`}>
                  {e.productos ? `${e.productos} producto${e.productos === 1 ? "" : "s"}` : "Sin productos"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Stock por evento</h1>
        <p className="text-sm text-stone-500">Elegí los productos que se usan en cada evento y bajá un PDF con el stock de esos productos. No mueve stock.</p>
      </div>
      <NavegacionStock actual="/stock/eventos" />
      {eventos.length === 0 ? <p className="tarjeta text-center text-sm text-stone-500">No hay eventos.</p> : null}
      {lista("Próximos", proximos)}
      {lista("Anteriores", pasados)}
    </div>
  );
}
