import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { eventosConSeguros } from "@/lib/empleados/consultas";
import { formatoFecha, hoy } from "@/lib/formato";
import { SinAcceso } from "../../sin-acceso";
import { NavegacionEmpleados } from "../navegacion";

export default async function PaginaSegurosEventos() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "operativa", "ver")) return <SinAcceso />;

  const eventos = await eventosConSeguros();
  const fechaHoy = hoy();
  // Primero los próximos (del más cercano al más lejano), después los pasados.
  const proximos = eventos.filter((e) => e.fecha >= fechaHoy).reverse();
  const pasados = eventos.filter((e) => e.fecha < fechaHoy);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Empleados</h1>
        <p className="text-sm text-stone-500">Por evento: quién trabaja, en qué puesto, el pedido del seguro y la póliza.</p>
      </div>
      <NavegacionEmpleados actual="/empleados/seguros" />
      {[
        { titulo: "Próximos eventos", lista: proximos },
        { titulo: "Eventos pasados", lista: pasados },
      ].map(({ titulo, lista }) =>
        lista.length ? (
          <section key={titulo} className="space-y-2">
            <h2 className="font-semibold">{titulo}</h2>
            <div className="tarjeta divide-y divide-stone-100 p-0">
              {lista.map((e) => (
                <Link key={e.id} href={`/empleados/seguros/${e.id}`} className="flex items-center gap-4 px-4 py-3 text-sm hover:bg-stone-50">
                  <span className="w-24 shrink-0 font-mono text-stone-600">{formatoFecha(e.fecha)}</span>
                  <span className="flex-1 font-medium">{e.nombre}</span>
                  {e.total ? (
                    <span className={`text-xs ${e.cubiertos === e.total ? "text-green-700" : "text-amber-700"}`}>
                      {e.total} personas · {e.cubiertos} con seguro
                    </span>
                  ) : (
                    <span className="text-xs text-stone-400">Sin personal</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}
