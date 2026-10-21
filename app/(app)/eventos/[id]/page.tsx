import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerDetalleEvento, type DesgloseCategoria } from "@/lib/eventos/consultas";
import { COLOR_ESTADO_EVENTO, NOMBRE_ESTADO_EVENTO } from "@/lib/eventos/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { BarraPresupuesto } from "@/components/barra-presupuesto";
import { TablaMovimientos } from "@/components/tabla-movimientos";
import { SinAcceso } from "../../sin-acceso";

export default async function PaginaEvento({ params }: PageProps<"/eventos/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "eventos", "ver")) return <SinAcceso />;

  const { id } = await params;
  const detalle = await obtenerDetalleEvento(id);
  if (!detalle) notFound();
  const { evento, transacciones, totales, desglose } = detalle;

  const editaEvento = puede(usuario, "eventos", "editar");
  const editaMovimientos = editaEvento || puede(usuario, "financiero", "editar");
  const margen = totales.ingresos > 0 ? totales.resultado / totales.ingresos : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/eventos" className="text-sm text-stone-500 hover:text-stone-900">← Eventos</Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{evento.nombre}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO_EVENTO[evento.estado]}`}>
                {NOMBRE_ESTADO_EVENTO[evento.estado]}
              </span>
            </div>
            <p className="text-sm text-stone-500">
              {formatoFecha(evento.fecha)}
              {evento.lugar && ` · ${evento.lugar}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {editaEvento && (
              <Link href={`/eventos/${evento.id}/editar`} className="boton-secundario">Editar evento</Link>
            )}
            {editaMovimientos && (
              <Link href={`/eventos/${evento.id}/movimiento`} className="boton">+ Movimiento</Link>
            )}
          </div>
        </div>
        {evento.notas && <p className="mt-2 max-w-3xl whitespace-pre-line text-sm text-stone-600">{evento.notas}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Ingresos" valor={formatoPesos(totales.ingresos)} color="text-green-700" />
        <Indicador titulo="Egresos" valor={formatoPesos(totales.egresos)} color="text-red-700" />
        <Indicador
          titulo="Balance"
          valor={formatoPesos(totales.resultado)}
          color={totales.resultado >= 0 ? "text-stone-900" : "text-red-700"}
          detalle={margen !== null ? `Margen ${Math.round(margen * 100)}%` : undefined}
        />
        <div className="tarjeta space-y-2 p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">Presupuesto</p>
          {evento.presupuesto ? (
            <>
              <p className="font-mono text-xl font-semibold">{formatoPesos(evento.presupuesto)}</p>
              <BarraPresupuesto uso={totales.egresos / evento.presupuesto} />
            </>
          ) : (
            <p className="text-sm text-stone-400">Sin presupuesto cargado</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Desglose titulo="Ingresos por categoría" filas={desglose.ingresos} total={totales.ingresos} color="bg-green-600" />
        <Desglose titulo="Egresos por categoría" filas={desglose.egresos} total={totales.egresos} color="bg-red-600" />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Movimientos ({transacciones.length})</h2>
        <TablaMovimientos
          transacciones={transacciones}
          editable={editaMovimientos}
          volverA={`/eventos/${evento.id}`}
          mostrarEvento={false}
        />
      </section>
    </div>
  );
}

function Indicador({ titulo, valor, color, detalle }: { titulo: string; valor: string; color: string; detalle?: string }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{titulo}</p>
      <p className={`mt-1 font-mono text-xl font-semibold ${color}`}>{valor}</p>
      {detalle && <p className="mt-1 text-xs text-stone-500">{detalle}</p>}
    </div>
  );
}

function Desglose({
  titulo,
  filas,
  total,
  color,
}: {
  titulo: string;
  filas: DesgloseCategoria[];
  total: number;
  color: string;
}) {
  return (
    <section className="tarjeta space-y-3 p-4">
      <h2 className="font-semibold">{titulo}</h2>
      {filas.length === 0 ? (
        <p className="text-sm text-stone-400">Sin movimientos.</p>
      ) : (
        <ul className="space-y-2">
          {filas.map((f) => {
            const porcentaje = total > 0 ? (f.total / total) * 100 : 0;
            return (
              <li key={f.categoria} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span>{f.categoria}</span>
                  <span className="font-mono text-stone-700">
                    {formatoPesos(f.total)} <span className="text-xs text-stone-400">({Math.round(porcentaje)}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div className={`h-full ${color}`} style={{ width: `${porcentaje}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
