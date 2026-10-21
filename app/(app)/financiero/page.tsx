import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import {
  LIMITE_LISTADO,
  leerFiltros,
  obtenerCategorias,
  obtenerEventosResumidos,
  obtenerTransacciones,
} from "@/lib/financiero/consultas";
import { formatoPesos, periodosRapidos } from "@/lib/formato";
import { SinAcceso } from "../sin-acceso";
import { TablaMovimientos } from "@/components/tabla-movimientos";
import { Filtros, ProveedorFiltros, ZonaResultados } from "./filtros";

export default async function PaginaFinanciero({ searchParams }: PageProps<"/financiero">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "financiero", "editar");

  const parametros = await searchParams;
  const filtros = leerFiltros(parametros);
  const [{ transacciones, truncado, totales }, categorias, eventos] = await Promise.all([
    obtenerTransacciones(filtros),
    obtenerCategorias({ incluirInactivas: true }),
    obtenerEventosResumidos(),
  ]);

  const consulta = new URLSearchParams(
    Object.entries(filtros).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""),
  ).toString();
  const volverA = `/financiero?${consulta}`;

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
          {/* Grande: caja real. Abajo: escenario con pendientes y proyectados. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Total titulo="Ingresos" real={totales.real.ingresos} total={totales.total.ingresos} color="text-green-700" />
            <Total titulo="Egresos" real={totales.real.egresos} total={totales.total.egresos} color="text-red-700" />
            <Total
              titulo="Resultado"
              real={totales.real.resultado}
              total={totales.total.resultado}
              color={totales.real.resultado >= 0 ? "text-stone-900" : "text-red-700"}
            />
          </div>

          {truncado && (
            <p className="alerta-error">
              Hay más de {LIMITE_LISTADO} movimientos en este período: se muestran los más recientes y los totales no están completos. Acotá las fechas.
            </p>
          )}

          <TablaMovimientos transacciones={transacciones} editable={editable} volverA={volverA} />
          <p className="text-xs text-stone-500">{transacciones.length} movimientos</p>
        </ZonaResultados>
      </div>
    </ProveedorFiltros>
  );
}

function Total({ titulo, real, total, color }: { titulo: string; real: number; total: number; color: string }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{titulo} · real</p>
      <p className={`mt-1 font-mono text-xl font-semibold xl:text-2xl ${color}`}>{formatoPesos(real)}</p>
      {total !== real && (
        <p className="mt-1 text-xs text-stone-500">
          Con pendientes y proyectados: <span className="font-mono">{formatoPesos(total)}</span>
        </p>
      )}
    </div>
  );
}
