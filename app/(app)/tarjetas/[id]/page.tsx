import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { NOMBRE_EMPRESA } from "@/lib/empresas";
import { obtenerCategorias } from "@/lib/financiero/consultas";
import { detallesUsados, obtenerResumen } from "@/lib/tarjetas/consultas";
import { formatoDolares, mesDelResumen } from "@/lib/tarjetas/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../../sin-acceso";
import { Controles } from "../controles";
import { AccionesResumen, DatosResumen, PaseFinanciero, TablaCargos, TablaConsumos, TablaPagos } from "./detalle";

export default async function PaginaResumenTarjeta({ params, searchParams }: PageProps<"/tarjetas/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [d, categorias, detalles, sp] = await Promise.all([obtenerResumen(id), obtenerCategorias(), detallesUsados(), searchParams]);
  if (!d) notFound();
  const { resumen, movimientos, totales, controles } = d;
  const abierto = !resumen.financiero_en;
  const editable = puede(usuario, "financiero", "editar") && abierto;
  const repetidas = Number(sp.repetidas) || 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/tarjetas" className="text-sm text-stone-500 hover:text-stone-900">← Tarjetas de crédito</Link>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">
            {resumen.tarjeta} · {mesDelResumen(resumen.fecha_cierre)}
          </h1>
          <div className="flex flex-wrap gap-2">
            {resumen.archivo_path && (
              <a href={`/tarjetas/${resumen.id}/archivo`} target="_blank" rel="noreferrer" className="boton-secundario">Ver PDF</a>
            )}
            <a href={`/tarjetas/excel?id=${resumen.id}`} className="boton-secundario">Excel</a>
            {editable && <AccionesResumen id={resumen.id} />}
          </div>
        </div>
        <p className="text-sm text-stone-500">
          Cierre {formatoFecha(resumen.fecha_cierre)}
          {resumen.vencimiento && ` · vence ${formatoFecha(resumen.vencimiento)}`}
          {resumen.archivo_nombre && ` · ${resumen.archivo_nombre}`}
        </p>
      </div>

      {repetidas > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {repetidas} renglón{repetidas === 1 ? "" : "es"} ya estaba{repetidas === 1 ? "" : "n"} cargado{repetidas === 1 ? "" : "s"} en otro resumen de esta tarjeta y no se
          repiti{repetidas === 1 ? "ó" : "eron"}.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra titulo={NOMBRE_EMPRESA.nero} valor={formatoPesos(totales.empresa.nero)} detalle={`${formatoPesos(totales.consumos.nero.pesos)} + ${formatoDolares(totales.consumos.nero.dolares)} + cargos ${formatoPesos(totales.cargos.nero)}`} />
        <Cifra titulo={NOMBRE_EMPRESA.ruta} valor={formatoPesos(totales.empresa.ruta)} detalle={`${formatoPesos(totales.consumos.ruta.pesos)} + ${formatoDolares(totales.consumos.ruta.dolares)} + cargos ${formatoPesos(totales.cargos.ruta)}`} />
        <Cifra
          titulo="Sin asignar"
          valor={String(totales.consumos.sin.cantidad)}
          detalle={totales.consumos.sin.cantidad ? `${formatoPesos(totales.consumos.sin.pesos)} · ${formatoDolares(totales.consumos.sin.dolares)}` : "Todo asignado"}
          color={totales.consumos.sin.cantidad ? "text-amber-700" : "text-green-700"}
        />
        <Cifra titulo="Impuestos y cargos" valor={formatoPesos(totales.cargos.nero + totales.cargos.ruta)} detalle={`${formatoPesos(totales.cargos.pesos)}${totales.cargos.dolares ? ` + ${formatoDolares(totales.cargos.dolares)}` : ""}`} />
      </div>
      {totales.faltaCotizacion && (
        <p className="alerta-error">Hay importes en dólares y falta la cotización: los totales en pesos no incluyen los dólares.</p>
      )}

      <DatosResumen id={resumen.id} cotizacion={resumen.cotizacion_usd} vencimiento={resumen.vencimiento} editable={editable} />

      <section className="space-y-2">
        <h2 className="font-semibold">Control contra el PDF</h2>
        <Controles controles={controles} />
      </section>

      <TablaConsumos resumenId={resumen.id} movimientos={movimientos.filter((m) => m.tipo === "consumo")} detalles={detalles} editable={editable} />
      <TablaCargos resumenId={resumen.id} movimientos={movimientos.filter((m) => m.tipo === "cargo")} cotizacion={resumen.cotizacion_usd} editable={editable} />
      <TablaPagos resumenId={resumen.id} movimientos={movimientos.filter((m) => m.tipo === "pago")} editable={editable} />

      {puede(usuario, "financiero", "editar") && (
        <PaseFinanciero
          resumen={{ id: resumen.id, vencimiento: resumen.vencimiento, fecha_cierre: resumen.fecha_cierre, financiero_en: resumen.financiero_en, transacciones: resumen.transacciones.length }}
          totales={totales}
          categorias={categorias.filter((c) => c.tipo === "egreso").map((c) => ({ id: c.id, nombre: c.nombre }))}
        />
      )}
    </div>
  );
}

function Cifra({ titulo, valor, detalle, color = "" }: { titulo: string; valor: string; detalle: string; color?: string }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{titulo}</p>
      <p className={`mt-1 font-mono text-xl font-semibold ${color}`}>{valor}</p>
      <p className="mt-1 text-xs text-stone-500">{detalle}</p>
    </div>
  );
}
