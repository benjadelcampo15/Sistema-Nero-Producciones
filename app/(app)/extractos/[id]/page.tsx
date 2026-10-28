import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerConciliacion } from "@/lib/extractos/consultas";
import { obtenerCategorias } from "@/lib/financiero/consultas";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../../sin-acceso";
import { Conciliacion } from "./conciliacion";

export default async function PaginaExtracto({ params }: PageProps<"/extractos/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const { id } = await params;
  const [c, categorias] = await Promise.all([obtenerConciliacion(id), obtenerCategorias()]);
  if (!c) notFound();
  const { extracto, cuenta, lineas } = c;
  const cuenta_ = (estado: string) => lineas.filter((l) => l.estado === estado).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/extractos" className="text-sm text-stone-500 hover:text-stone-900">← Extractos bancarios</Link>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">
            {cuenta.nombre} · {formatoFecha(extracto.desde)} al {formatoFecha(extracto.hasta)}
          </h1>
          {extracto.tieneArchivo && (
            <a href={`/extractos/${extracto.id}/archivo`} target="_blank" rel="noreferrer" className="boton-secundario">Ver archivo</a>
          )}
        </div>
        <p className="text-sm text-stone-500">
          {extracto.archivo} · saldo inicial {extracto.saldoInicial === null ? "—" : formatoPesos(extracto.saldoInicial)} · saldo final{" "}
          {extracto.saldoFinal === null ? "—" : formatoPesos(extracto.saldoFinal)}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Cifra titulo="Movimientos del banco" valor={lineas.length} />
        <Cifra titulo="Conciliados" valor={cuenta_("conciliada")} color="text-green-700" />
        <Cifra titulo="Pendientes" valor={cuenta_("pendiente")} color={cuenta_("pendiente") ? "text-amber-700" : ""} />
        <Cifra titulo="Ignorados" valor={cuenta_("ignorada")} />
      </div>

      <Conciliacion c={c} categorias={categorias.map((x) => ({ id: x.id, nombre: x.nombre, tipo: x.tipo }))} editable={puede(usuario, "financiero", "editar")} />
    </div>
  );
}

function Cifra({ titulo, valor, color = "" }: { titulo: string; valor: number; color?: string }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{titulo}</p>
      <p className={`mt-1 font-mono text-xl font-semibold ${color}`}>{valor}</p>
    </div>
  );
}
