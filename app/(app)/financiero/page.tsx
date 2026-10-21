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
              <Link href="/financiero/categorias" className="boton-secundario">CategorÃ­as</Link>
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
            <Total titulo="Ingresos" monto={totales.ingresos} color="text-green-700" />
            <Total titulo="Egresos" monto={totales.egresos} color="text-red-700" />
            <Total
              titulo="Resultado"
              monto={totales.resultado}
              color={totales.resultado >= 0 ? "text-stone-900" : "text-red-700"}
            />
          </div>

          {truncado && (
            <p className="alerta-error">
              Hay mÃ¡s de {LIMITE_LISTADO} movimientos en este perÃ­odo: se muestran los mÃ¡s recientes y los totales no estÃ¡n completos. AcotÃ¡ las fechas.
            </p>
          )}

          <TablaMovimientos transacciones={transacciones} editable={editable} volverA={volverA} />
          <p className="text-xs text-stone-500">{transacciones.length} movimientos</p>
        </ZonaResultados>
      </div>
    </ProveedorFiltros>
  );
}

function Total({ titulo, monto, color }: { titulo: string; monto: number; color: string }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{titulo}</p>
      <p className={`mt-1 font-mono text-xl font-semibold xl:text-2xl ${color}`}>{formatoPesos(monto)}</p>
    </div>
  );
}
