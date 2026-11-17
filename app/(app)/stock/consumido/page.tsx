import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { eventosParaImportar, panelConsumido, recetasEmpresa } from "@/lib/stock/consumido";
import { EMPRESAS, NOMBRE_EMPRESA } from "@/lib/empresas";
import { formatoFecha, formatoFechaHora, formatoPesos } from "@/lib/formato";
import { EtiquetaEmpresa } from "@/components/empresa";
import { SinAcceso } from "../../sin-acceso";
import { NavegacionStock } from "../navegacion";
import { ImportarFudo } from "./importar";

const texto = (v: unknown) => (typeof v === "string" ? v : "");
const unidades = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(n);

/** Stock › Consumido: lo vendido en FUDO vs el consumo físico, por evento. */
export default async function PaginaConsumido({ searchParams }: PageProps<"/stock/consumido">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;
  const p = await searchParams;
  const filtros = { empresa: texto(p.empresa), desde: texto(p.desde), hasta: texto(p.hasta) };
  const edita = puede(usuario, "stock", "editar");
  const [{ filas }, eventos, recetasNero, recetasRuta] = await Promise.all([
    panelConsumido(filtros),
    edita ? eventosParaImportar() : Promise.resolve([]),
    recetasEmpresa("nero"),
    recetasEmpresa("ruta"),
  ]);
  const pendientes = [...recetasNero, ...recetasRuta].filter((r) => r.tipo === "receta" && !r.items.length).length;
  const ultima = filas.map((f) => f.ultima).filter(Boolean).sort().at(-1) ?? null;
  const indicadores = [
    ["Eventos con reporte", String(filas.length)],
    ["Productos conciliados", String(filas.reduce((s, f) => s + f.conciliados, 0))],
    ["Productos con diferencias", String(filas.reduce((s, f) => s + f.conDiferencia, 0))],
    ["Ventas FUDO", formatoPesos(filas.reduce((s, f) => s + f.montoFudo, 0))],
    ["Pendientes de configurar", String(pendientes)],
    ["Última importación", ultima ? formatoFechaHora(ultima) : "—"],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Consumido</h1>
          <p className="text-sm text-stone-500">Lo vendido en FUDO (consumo teórico) contra el consumo físico de mercadería, por evento. Es un control: no descuenta stock ni toca Financiero.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/stock/consumido/recetas" className="boton-secundario">
            Productos y recetas{pendientes ? ` (${pendientes} pendientes)` : ""}
          </Link>
          {edita && <ImportarFudo eventos={eventos} />}
        </div>
      </div>

      <NavegacionStock actual="/stock/consumido" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {indicadores.map(([n, v]) => (
          <div key={n} className={`tarjeta p-3 ${n === "Productos con diferencias" && v !== "0" ? "border-red-200 bg-red-50" : n === "Pendientes de configurar" && v !== "0" ? "border-amber-200 bg-amber-50" : ""}`}>
            <p className="text-xs text-stone-500">{n}</p>
            <p className="mt-0.5 font-mono text-lg font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <form className="tarjeta flex flex-wrap items-end gap-2 p-3 text-sm">
        <select name="empresa" defaultValue={filtros.empresa} aria-label="Empresa" className="campo w-auto">
          <option value="">Empresa: todas</option>
          {EMPRESAS.map((e) => (
            <option key={e} value={e}>{NOMBRE_EMPRESA[e]}</option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          Desde <input type="date" name="desde" defaultValue={filtros.desde} className="campo w-auto" />
        </label>
        <label className="flex items-center gap-1">
          Hasta <input type="date" name="hasta" defaultValue={filtros.hasta} className="campo w-auto" />
        </label>
        <button type="submit" className="boton py-1.5 text-sm">Filtrar</button>
        {Object.values(filtros).some(Boolean) && <Link href="/stock/consumido" className="boton-secundario py-1.5 text-sm">Limpiar</Link>}
      </form>

      {filas.length === 0 ? (
        <p className="tarjeta text-center text-sm text-stone-500">Todavía no hay reportes de FUDO importados{Object.values(filtros).some(Boolean) ? " con estos filtros" : ""}.</p>
      ) : (
        <div className="tarjeta overflow-x-auto p-0">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-2">Evento</th>
                <th className="px-3 py-2">Período FUDO</th>
                <th className="px-3 py-2 text-right">Reportes</th>
                <th className="px-3 py-2 text-right">Unidades vendidas</th>
                <th className="px-3 py-2 text-right">Ventas FUDO</th>
                <th className="px-3 py-2 text-right">Conciliados</th>
                <th className="px-3 py-2 text-right">Con diferencia</th>
                <th className="px-3 py-2 text-right">Sin conteo</th>
                <th className="px-3 py-2 text-right">Sin configurar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filas.map((f) => (
                <tr key={f.evento.id} className="hover:bg-stone-50">
                  <td className="px-3 py-2">
                    <Link href={`/stock/consumido/${f.evento.id}`} className="font-medium underline decoration-stone-300 hover:decoration-stone-900">
                      {f.evento.nombre}
                    </Link>
                    <span className="ml-2 align-middle"><EtiquetaEmpresa empresa={f.evento.empresa} /></span>
                    <span className="block text-xs text-stone-500">{formatoFecha(f.evento.fecha)}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-stone-600">{f.desde ? `${formatoFecha(f.desde)}${f.hasta && f.hasta !== f.desde ? ` al ${formatoFecha(f.hasta)}` : ""}` : "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">{f.importaciones}</td>
                  <td className="px-3 py-2 text-right font-mono">{unidades(f.unidadesFudo)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatoPesos(f.montoFudo)}</td>
                  <td className="px-3 py-2 text-right font-mono text-green-700">{f.conciliados}</td>
                  <td className={`px-3 py-2 text-right font-mono ${f.conDiferencia ? "font-semibold text-red-700" : ""}`}>{f.conDiferencia}</td>
                  <td className={`px-3 py-2 text-right font-mono ${f.sinConteo ? "text-amber-800" : ""}`}>{f.sinConteo}</td>
                  <td className={`px-3 py-2 text-right font-mono ${f.pendientes ? "text-amber-800" : ""}`}>{f.pendientes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-stone-500">Las unidades de productos distintos no se suman entre sí; cada evento se compara producto por producto en su detalle.</p>
    </div>
  );
}
