import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerDetalleEvento, obtenerPlanillaEvento, type DesgloseCategoria } from "@/lib/eventos/consultas";
import { COLOR_ESTADO_EVENTO, NOMBRE_ESTADO_EVENTO } from "@/lib/eventos/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { BarraPresupuesto } from "@/components/barra-presupuesto";
import { TablaMovimientos } from "@/components/tabla-movimientos";
import { SinAcceso } from "../../sin-acceso";
import { EtiquetaEmpresa } from "@/components/empresa";
import { PlanillaEvento } from "./planilla-evento";

export default async function PaginaEvento({ params, searchParams }: PageProps<"/eventos/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "eventos", "ver")) return <SinAcceso />;

  const { id } = await params;
  const { vista } = await searchParams;
  const enPlanilla = vista !== "movimientos";
  const [detalle, planilla] = await Promise.all([obtenerDetalleEvento(id), enPlanilla ? obtenerPlanillaEvento(id) : null]);
  if (!detalle) notFound();
  const { evento, transacciones, totales, desglose } = detalle;

  const editaEvento = puede(usuario, "eventos", "editar");
  const editaMovimientos = editaEvento || puede(usuario, "financiero", "editar");
  // Lo principal es el resultado total del evento (incluye pendientes); se muestra cuánto es real.
  const { total, real } = totales;
  const margen = total.ingresos > 0 ? total.resultado / total.ingresos : null;
  const detalleReal = (montoReal: number, montoTotal: number) =>
    montoReal !== montoTotal ? "Real: " + formatoPesos(montoReal) : undefined;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/eventos" className="text-sm text-stone-500 hover:text-stone-900">← Eventos</Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{evento.nombre}</h1>
              <EtiquetaEmpresa empresa={evento.empresa} />
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

      <nav className="flex gap-1 border-b border-stone-200 print:hidden">
        {[
          { clave: "planilla", nombre: "Planilla", href: `/eventos/${evento.id}` },
          { clave: "movimientos", nombre: `Movimientos (${transacciones.length})`, href: `/eventos/${evento.id}?vista=movimientos` },
        ].map((t) => (
          <Link
            key={t.clave}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              (t.clave === "planilla") === enPlanilla ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-900"
            }`}
          >
            {t.nombre}
          </Link>
        ))}
      </nav>

      {planilla ? (
        <PlanillaEvento key={evento.id} eventoId={evento.id} inicial={planilla} editable={editaEvento} enFinanciero={evento.planilla_en_financiero} />
      ) : (
      <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Ingresos" valor={formatoPesos(total.ingresos)} color="text-green-700" detalle={detalleReal(real.ingresos, total.ingresos)} />
        <Indicador titulo="Egresos" valor={formatoPesos(total.egresos)} color="text-red-700" detalle={detalleReal(real.egresos, total.egresos)} />
        <Indicador
          titulo="Balance"
          valor={formatoPesos(total.resultado)}
          color={total.resultado >= 0 ? "text-stone-900" : "text-red-700"}
          detalle={[margen !== null ? "Margen " + Math.round(margen * 100) + "%" : null, detalleReal(real.resultado, total.resultado)].filter(Boolean).join(" · ") || undefined}
        />
        <div className="tarjeta space-y-2 p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">Presupuesto</p>
          {evento.presupuesto ? (
            <>
              <p className="font-mono text-xl font-semibold">{formatoPesos(evento.presupuesto)}</p>
              <BarraPresupuesto uso={total.egresos / evento.presupuesto} />
            </>
          ) : (
            <p className="text-sm text-stone-400">Sin presupuesto cargado</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Desglose titulo="Ingresos por categoría" filas={desglose.ingresos} total={total.ingresos} color="bg-green-600" />
        <Desglose titulo="Egresos por categoría" filas={desglose.egresos} total={total.egresos} color="bg-red-600" />
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
      </>
      )}
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
