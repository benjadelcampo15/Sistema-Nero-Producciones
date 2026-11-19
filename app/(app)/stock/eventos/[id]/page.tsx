import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { stockDelEvento } from "@/lib/stock/por-evento";
import { formatoFecha } from "@/lib/formato";
import { EtiquetaEmpresa } from "@/components/empresa";
import { SinAcceso } from "../../../sin-acceso";
import { NavegacionStock } from "../../navegacion";
import { EditorStockEvento } from "./editor";

/** Los productos que se usan en un evento, con su stock actual por depósito. */
export default async function PaginaStockEvento({ params }: PageProps<"/stock/eventos/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;
  const { id } = await params;
  const datos = await stockDelEvento(id);
  if (!datos) notFound();
  const { evento } = datos;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/stock/eventos" className="text-sm text-stone-500 hover:text-stone-900">← Stock por evento</Link>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {evento.nombre} <EtiquetaEmpresa empresa={evento.empresa} />
          </h1>
          <p className="text-sm text-stone-500">
            {formatoFecha(evento.fecha)}
            {evento.lugar && ` · ${evento.lugar}`} ·{" "}
            <Link href={`/${evento.tipo === "quilmes" ? "quilmes" : "eventos"}/${evento.id}`} className="underline">ver evento</Link>
          </p>
        </div>
        <a href={`/stock/eventos/${evento.id}/pdf`} className="boton">Descargar PDF</a>
      </div>
      <NavegacionStock actual="/stock/eventos" />
      <EditorStockEvento
        key={evento.id}
        eventoId={evento.id}
        inicial={datos.lista}
        depositos={datos.depositos.map((d) => ({ id: d.id, nombre: d.nombre }))}
        stock={datos.stock.map((s) => ({ id: s.producto.id, nombre: s.producto.nombre, unidad: s.producto.unidad, codigo: s.producto.codigo, porDeposito: s.porDeposito, total: s.total }))}
        editable={puede(usuario, "stock", "editar")}
      />
    </div>
  );
}
