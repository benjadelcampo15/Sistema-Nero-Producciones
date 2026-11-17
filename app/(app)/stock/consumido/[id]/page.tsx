import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { consumidoEvento } from "@/lib/stock/consumido";
import { formatoFecha } from "@/lib/formato";
import { EtiquetaEmpresa } from "@/components/empresa";
import { SinAcceso } from "../../../sin-acceso";
import { NavegacionStock } from "../../navegacion";
import { ImportarFudo } from "../importar";
import { VistaConsumido } from "./vista";

/** Consumido de un evento: comparación, conteo físico, ventas de FUDO e historial de importaciones. */
export default async function PaginaConsumidoEvento({ params, searchParams }: PageProps<"/stock/consumido/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;
  const { id } = await params;
  const { vista } = await searchParams;
  const datos = await consumidoEvento(id);
  if (!datos) notFound();
  const { evento } = datos;
  const edita = puede(usuario, "stock", "editar");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/stock/consumido" className="text-sm text-stone-500 hover:text-stone-900">← Consumido</Link>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {evento.nombre} <EtiquetaEmpresa empresa={evento.empresa} />
          </h1>
          <p className="text-sm text-stone-500">
            {formatoFecha(evento.fecha)}
            {evento.lugar && ` · ${evento.lugar}`} · <Link href={`/eventos/${evento.id}`} className="underline">ver evento</Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/stock/consumido/${evento.id}/excel`} className="boton-secundario">Exportar a Excel</a>
          {edita && <ImportarFudo eventos={[]} eventoFijo={{ id: evento.id, nombre: evento.nombre, fecha: evento.fecha, empresa: evento.empresa }} />}
        </div>
      </div>
      <NavegacionStock actual="/stock/consumido" />
      <VistaConsumido datos={datos} edita={edita} esAdmin={usuario.esAdmin} vistaInicial={typeof vista === "string" ? vista : "comparacion"} />
    </div>
  );
}
