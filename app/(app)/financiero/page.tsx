import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import {
  LIMITE_LISTADO,
  leerFiltros,
  obtenerCategorias,
  obtenerEventosResumidos,
  obtenerSinFecha,
  obtenerTransacciones,
} from "@/lib/financiero/consultas";
import { formatoPesos, hoy, periodosRapidos } from "@/lib/formato";
import { NOMBRE_ESTADO_MOVIMIENTO } from "@/lib/financiero/tipos";
import { SinAcceso } from "../sin-acceso";
import { TablaMovimientos } from "@/components/tabla-movimientos";
import { Filtros, ProveedorFiltros, ZonaResultados } from "./filtros";

export default async function PaginaFinanciero({ searchParams }: PageProps<"/financiero">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "financiero", "editar");

  const parametros = await searchParams;
  const filtros = leerFiltros(parametros);
  const [{ transacciones, truncado, totales }, sinFecha, categorias, eventos] = await Promise.all([
    obtenerTransacciones(filtros),
    obtenerSinFecha(filtros),
    obtenerCategorias({ incluirInactivas: true }),
    obtenerEventosResumidos(),
  ]);

  const consulta = new URLSearchParams(
    Object.entries(filtros).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""),
  ).toString();
  // Primero lo que ya pasó (más reciente arriba); lo de fecha futura va aparte, del más cercano al más lejano.
  const fechaHoy = hoy();
  const pasados = transacciones.filter((t) => t.fecha !== null && t.fecha <= fechaHoy);
  const proximos = transacciones.filter((t) => t.fecha !== null && t.fecha > fechaHoy).reverse();

  const volverA = `/financiero?${consulta}`;

  // Con un estado filtrado, los números son los de ese estado; sin filtro, la caja real
  // grande y abajo el escenario con pendientes y proyectados.
  const principal = filtros.estado ? totales.total : totales.real;
  const etiqueta = filtros.estado ? NOMBRE_ESTADO_MOVIMIENTO[filtros.estado].toLowerCase() : "real";
  const escenario = filtros.estado ? null : totales.total;

  return (
    <ProveedorFiltros>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Financiero</h1>
          <div className="flex flex-wrap gap-2">
            {editable && (
              <Link href="/financiero/categorias" className="boton-secundario">Categorías</Link>
            )}
            <a href={`/financiero/exportar?${consulta}`} className="boton-secundario">Exportar a Excel</a>
            {editable && (
              <Link href={`/financiero/nuevo?volver_a=${encodeURIComponent(volverA)}`} className="boton">
                + Nuevo movimiento
              </Link>
            )}
          </div>
        </div>

        <Filtros
          iniciales={{
            desde: filtros.desde,
            hasta: filtros.hasta,
            tipo: filtros.tipo ?? "",
            estado: filtros.estado ?? "",
            categoria: filtros.categoria ?? "",
            evento: filtros.evento ?? "",
            q: filtros.q ?? "",
          }}
          categorias={categorias}
          eventos={eventos}
          periodos={periodosRapidos()}
        />

        <ZonaResultados>
          <div className="grid gap-3 sm:grid-cols-3">
            <Total titulo="Ingresos" etiqueta={etiqueta} valor={principal.ingresos} escenario={escenario?.ingresos} color="text-green-700" />
            <Total titulo="Egresos" etiqueta={etiqueta} valor={principal.egresos} escenario={escenario?.egresos} color="text-red-700" />
            <Total
              titulo="Resultado"
              etiqueta={etiqueta}
              valor={principal.resultado}
              escenario={escenario?.resultado}
              color={principal.resultado >= 0 ? "text-stone-900" : "text-red-700"}
            />
          </div>

          {truncado && (
            <p className="alerta-error">
              Hay más de {LIMITE_LISTADO} movimientos en este período: se muestran los más recientes y los totales no están completos. Acotá las fechas.
            </p>
          )}

          <TablaMovimientos transacciones={pasados} editable={editable} volverA={volverA} />
          <p className="text-xs text-stone-500">{pasados.length} movimientos</p>

          {proximos.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">
                Próximos <span className="text-sm font-normal text-stone-500">· con fecha posterior a hoy</span>
              </h2>
              <TablaMovimientos transacciones={proximos} editable={editable} volverA={volverA} />
            </section>
          )}

          {sinFecha.transacciones.length > 0 && (
            <details className="space-y-3">
              <summary className="cursor-pointer text-lg font-semibold">
                Sin fecha ({sinFecha.transacciones.length}){" "}
                <span className="text-sm font-normal text-stone-500">
                  · no entran en los totales ni en el cashflow · ingresos {formatoPesos(sinFecha.totales.total.ingresos)} · egresos{" "}
                  {formatoPesos(sinFecha.totales.total.egresos)}
                </span>
              </summary>
              <p className="text-sm text-stone-500">Editá cada uno para ponerle fecha cuando se sepa.</p>
              <TablaMovimientos transacciones={sinFecha.transacciones} editable={editable} volverA={volverA} />
            </details>
          )}
        </ZonaResultados>
      </div>
    </ProveedorFiltros>
  );
}

function Total({
  titulo,
  etiqueta,
  valor,
  escenario,
  color,
}: {
  titulo: string;
  etiqueta: string;
  valor: number;
  escenario?: number;
  color: string;
}) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{titulo} · {etiqueta}</p>
      <p className={`mt-1 font-mono text-xl font-semibold xl:text-2xl ${color}`}>{formatoPesos(valor)}</p>
      {escenario !== undefined && escenario !== valor && (
        <p className="mt-1 text-xs text-stone-500">
          Con pendientes y proyectados: <span className="font-mono">{formatoPesos(escenario)}</span>
        </p>
      )}
    </div>
  );
}
