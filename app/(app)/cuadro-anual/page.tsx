import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { leerFiltrosCuadro, obtenerCuadro, type FiltrosCuadro } from "@/lib/cuadro/consultas";
import { MESES_LARGOS, type Mov } from "@/lib/cuadro/calculo";
import { obtenerCategorias } from "@/lib/financiero/consultas";
import { NOMBRE_ESTADO_MOVIMIENTO } from "@/lib/financiero/tipos";
import { formatoFecha, formatoFechaHora, formatoPesos, colorResultado, hoy } from "@/lib/formato";
import { NOMBRE_EMPRESA } from "@/lib/empresas";
import { AlternarEmpresa } from "@/components/empresa";
import { crearClienteServidor } from "@/lib/supabase/server";
import { SinAcceso } from "../sin-acceso";
import { BarrasHorizontales, GraficoMensual, GraficoResultado, MiniMeses } from "./graficos";

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
const varTexto = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1).replace(".", ",")}%`);
const ESTADOS = ["real", "pendiente", "proyectado", "todos"] as const;

/** ADMINISTRACIÓN › Cuadro anual: informe de un año de una empresa, desde Financiero. */
export default async function PaginaCuadroAnual({ searchParams }: PageProps<"/cuadro-anual">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const p = await searchParams;
  const f = leerFiltrosCuadro(p);
  const vista = p.vista === "lineas" ? "lineas" : "barras";
  const detalle = typeof p.detalle === "string" ? p.detalle : "";

  const [{ cuadro: c, movimientos }, categorias, { data: eventos }] = await Promise.all([
    obtenerCuadro(f),
    obtenerCategorias({ incluirInactivas: true }),
    (await crearClienteServidor()).from("eventos").select("id, nombre, fecha").eq("empresa", f.empresa).gte("fecha", `${f.anio}-01-01`).lte("fecha", `${f.anio}-12-31`).order("fecha"),
  ]);
  const generado = formatoFechaHora(new Date().toISOString());
  const etiquetaEstado = f.estado === "todos" ? "real + pendiente + proyectado" : NOMBRE_ESTADO_MOVIMIENTO[f.estado].toLowerCase();

  const href = (cambios: Partial<FiltrosCuadro> & { vista?: string; detalle?: string | null }) => {
    const q = new URLSearchParams();
    const v = { ...f, vista, detalle, ...cambios };
    q.set("empresa", v.empresa);
    q.set("anio", String(v.anio));
    if (v.estado !== "real") q.set("estado", v.estado);
    if (v.categoria) q.set("categoria", v.categoria);
    if (v.evento) q.set("evento", v.evento);
    if (v.vista === "lineas") q.set("vista", "lineas");
    if (v.detalle) q.set("detalle", v.detalle);
    return `/cuadro-anual?${q}${v.detalle ? "#detalle" : ""}`;
  };
  const pdf = `/cuadro-anual/pdf?${new URLSearchParams({ empresa: f.empresa, anio: String(f.anio), estado: f.estado, ...(f.categoria ? { categoria: f.categoria } : {}), ...(f.evento ? { evento: f.evento } : {}) })}`;
  const r = c.resumen;

  // Detalle de lo que se tocó (mes, categoría, evento o sin fecha), con los mismos filtros.
  const enAnio = (m: Mov) => m.fecha?.startsWith(String(f.anio));
  const pasaFiltros = (m: Mov) => (!f.categoria || (m.categoria_id ?? "sin") === f.categoria) && (!f.evento || (f.evento === "sin" ? !m.evento_id : m.evento_id === f.evento));
  const conEstado = (m: Mov) => f.estado === "todos" || m.estado === f.estado;
  let titulo = "";
  let lista: Mov[] = [];
  const [clase, a, b] = detalle.split(":");
  if (clase === "mes") {
    titulo = `Movimientos de ${MESES_LARGOS[Number(a) - 1]} ${f.anio}`;
    lista = movimientos.filter((m) => enAnio(m) && pasaFiltros(m) && conEstado(m) && Number(m.fecha!.slice(5, 7)) === Number(a));
  } else if (clase === "cat") {
    titulo = `${b === "ingreso" ? "Ingresos" : "Egresos"} de la categoría «${movimientos.find((m) => (m.categoria_id ?? "sin") === a)?.categoria ?? "Sin categoría"}» en ${f.anio}`;
    lista = movimientos.filter((m) => enAnio(m) && pasaFiltros(m) && conEstado(m) && m.tipo === b && (m.categoria_id ?? "sin") === a);
  } else if (clase === "evento") {
    titulo = `Movimientos del evento «${movimientos.find((m) => m.evento_id === a)?.evento ?? ""}» en ${f.anio}`;
    lista = movimientos.filter((m) => enAnio(m) && pasaFiltros(m) && conEstado(m) && m.evento_id === a);
  } else if (clase === "pendiente") {
    titulo = `${a === "ingreso" ? "Cobros" : "Pagos"} pendientes de ${f.anio}`;
    lista = movimientos.filter((m) => enAnio(m) && pasaFiltros(m) && m.estado === "pendiente" && m.tipo === a);
  }
  lista.sort((x, y) => (x.fecha ?? "").localeCompare(y.fecha ?? ""));

  const tarjetas: { titulo: string; valor: string; nota?: string; color?: string; destacado?: boolean; href?: string }[] = [
    { titulo: "Ingresos reales", valor: formatoPesos(r.ingresosReal), color: "text-green-700" },
    { titulo: "Egresos reales", valor: formatoPesos(r.egresosReal), color: "text-red-700" },
    { titulo: "Resultado real", valor: formatoPesos(r.resultadoReal), color: colorResultado(r.resultadoReal), nota: `Margen ${pct(r.margen)} sobre ingresos`, destacado: true },
    { titulo: "Pendiente de cobrar", valor: formatoPesos(r.pendienteCobrar), nota: "Ingresos pendientes del año", href: href({ detalle: "pendiente:ingreso" }) },
    { titulo: "Pendiente de pagar", valor: formatoPesos(r.pendientePagar), nota: "Egresos pendientes del año", href: href({ detalle: "pendiente:egreso" }) },
    { titulo: "Proyectado (no es real)", valor: formatoPesos(r.proyectadoIngresos - r.proyectadoEgresos), nota: `Ingresos ${formatoPesos(r.proyectadoIngresos)} · egresos ${formatoPesos(r.proyectadoEgresos)}` },
    { titulo: "Mejor mes (real)", valor: r.mejorMes ? MESES_LARGOS[r.mejorMes.mes - 1] : "—", nota: r.mejorMes ? formatoPesos(r.mejorMes.resultado) : "Sin movimientos reales", href: r.mejorMes ? href({ estado: "real", detalle: `mes:${r.mejorMes.mes}` }) : undefined },
    { titulo: "Peor mes (real)", valor: r.peorMes ? MESES_LARGOS[r.peorMes.mes - 1] : "—", nota: r.peorMes ? formatoPesos(r.peorMes.resultado) : "Sin movimientos reales", href: r.peorMes ? href({ estado: "real", detalle: `mes:${r.peorMes.mes}` }) : undefined },
  ];

  return (
    <div className="space-y-8">
      {/* Encabezado y filtros */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">Cuadro anual</h1>
            <AlternarEmpresa actual={f.empresa} href={(e) => href({ empresa: e, categoria: undefined, evento: undefined, detalle: null })} />
            <div className="flex items-center rounded-full border border-stone-300 bg-white text-sm">
              <Link href={href({ anio: f.anio - 1, evento: undefined, detalle: null })} className="px-3 py-1 hover:text-stone-900" aria-label="Año anterior">‹</Link>
              <span className="px-1 font-semibold">{f.anio}</span>
              <Link href={href({ anio: f.anio + 1, evento: undefined, detalle: null })} className="px-3 py-1 hover:text-stone-900" aria-label="Año siguiente">›</Link>
            </div>
          </div>
          <a href={pdf} className="boton">Descargar informe anual PDF</a>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {ESTADOS.map((e) => (
            <Link key={e} href={href({ estado: e, detalle: null })} className={`rounded-full border px-3 py-1 text-xs font-medium ${f.estado === e ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700"}`}>
              {e === "todos" ? "Todos los estados" : NOMBRE_ESTADO_MOVIMIENTO[e]}
            </Link>
          ))}
          <form action="/cuadro-anual" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="empresa" value={f.empresa} />
            <input type="hidden" name="anio" value={f.anio} />
            {f.estado !== "real" && <input type="hidden" name="estado" value={f.estado} />}
            <select name="categoria" defaultValue={f.categoria ?? ""} aria-label="Categoría" className="campo w-auto py-1 text-xs">
              <option value="">Todas las categorías</option>
              <option value="sin">Sin categoría</option>
              {categorias.map((k) => <option key={k.id} value={k.id}>{k.nombre} ({k.tipo})</option>)}
            </select>
            <select name="evento" defaultValue={f.evento ?? ""} aria-label="Evento" className="campo w-auto max-w-52 py-1 text-xs">
              <option value="">Todos los eventos</option>
              <option value="sin">Sin evento</option>
              {(eventos ?? []).map((e) => <option key={e.id} value={e.id}>{e.nombre} ({formatoFecha(e.fecha)})</option>)}
            </select>
            <button type="submit" className="boton-secundario py-1 text-xs">Filtrar</button>
            {(f.categoria || f.evento) && <Link href={href({ categoria: undefined, evento: undefined, detalle: null })} className="text-xs underline">Quitar filtros</Link>}
          </form>
        </div>
        <p className="text-xs text-stone-500">
          {NOMBRE_EMPRESA[f.empresa]} · {f.anio} · Gráficos y categorías: <strong>{etiquetaEstado}</strong> · Datos de Financiero al {generado} (tocá «Actualizar» arriba para traer lo último).
          {f.anio === Number(hoy().slice(0, 4)) && " Año en curso: los meses que faltan aparecen en $ 0."}
        </p>
      </div>

      {/* Resumen ejecutivo */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tarjetas.map((t) => {
          const cuerpo = (
            <>
              <p className="text-xs uppercase tracking-wide text-stone-500">{t.titulo}</p>
              <p className={`mt-1 font-mono text-xl font-semibold capitalize ${t.color ?? ""}`}>{t.valor}</p>
              {t.nota && <p className="text-xs text-stone-500">{t.nota}</p>}
            </>
          );
          const clase = `tarjeta block p-4 ${t.destacado ? "border-stone-900" : ""}`;
          return t.href ? <a key={t.titulo} href={t.href} className={`${clase} hover:border-stone-400`}>{cuerpo}</a> : <div key={t.titulo} className={clase}>{cuerpo}</div>;
        })}
      </section>

      {/* Mensual */}
      <section className="tarjeta space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Ingresos y egresos por mes <span className="text-sm font-normal text-stone-500">({etiquetaEstado})</span></h2>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-green-700" /> Ingresos</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-700" /> Egresos</span>
            <span className="flex overflow-hidden rounded-full border border-stone-300">
              <Link href={href({ vista: "barras" })} className={`px-2 py-0.5 ${vista === "barras" ? "bg-stone-900 text-white" : ""}`}>Barras</Link>
              <Link href={href({ vista: "lineas" })} className={`px-2 py-0.5 ${vista === "lineas" ? "bg-stone-900 text-white" : ""}`}>Líneas</Link>
            </span>
          </div>
        </div>
        <GraficoMensual meses={c.meses} vista={vista} hrefMes={(m) => href({ detalle: `mes:${m}` })} />
        <h3 className="font-semibold">Resultado mensual y acumulado</h3>
        <GraficoResultado meses={c.meses} hrefMes={(m) => href({ detalle: `mes:${m}` })} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr><th className="px-3 py-2">Mes</th><th className="px-3 py-2 text-right">Ingresos</th><th className="px-3 py-2 text-right">Egresos</th><th className="px-3 py-2 text-right">Resultado</th><th className="px-3 py-2 text-right">Acumulado</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {c.meses.map((m) => (
                <tr key={m.mes} className="hover:bg-stone-50">
                  <td className="px-3 py-1.5"><a href={href({ detalle: `mes:${m.mes}` })} className="capitalize hover:underline">{MESES_LARGOS[m.mes - 1]}</a></td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatoPesos(m.ingresos)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatoPesos(m.egresos)}</td>
                  <td className={`px-3 py-1.5 text-right font-mono font-semibold ${colorResultado(m.resultado)}`}>{formatoPesos(m.resultado)}</td>
                  <td className={`px-3 py-1.5 text-right font-mono ${colorResultado(m.acumulado)}`}>{formatoPesos(m.acumulado)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-stone-300 font-semibold">
              <tr>
                <td className="px-3 py-2">Total {f.anio}</td>
                <td className="px-3 py-2 text-right font-mono">{formatoPesos(c.totalesElegidos.ingresos)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatoPesos(c.totalesElegidos.egresos)}</td>
                <td className={`px-3 py-2 text-right font-mono ${colorResultado(c.totalesElegidos.resultado)}`}>{formatoPesos(c.totalesElegidos.resultado)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Categorías */}
      {(["ingreso", "egreso"] as const).map((t) => {
        const filas = t === "ingreso" ? c.ingresosCategoria : c.egresosCategoria;
        const color = t === "ingreso" ? "#15803d" : "#b91c1c";
        return (
          <section key={t} className="tarjeta space-y-4">
            <h2 className="font-semibold">{t === "ingreso" ? "Ingresos" : "Gastos"} por categoría <span className="text-sm font-normal text-stone-500">({etiquetaEstado} · tocá una para ver sus movimientos)</span></h2>
            <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
              <BarrasHorizontales filas={filas} color={color} href={(id) => href({ detalle: `cat:${id}:${t}` })} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-2 py-2">{t === "egreso" ? "#  Categoría" : "Categoría"}</th>
                      <th className="px-2 py-2 text-right">Total</th>
                      <th className="px-2 py-2 text-right">%</th>
                      <th className="px-2 py-2 text-right">Mov.</th>
                      <th className="px-2 py-2 text-right">{f.anio - 1}</th>
                      <th className="px-2 py-2 text-right">Var.</th>
                      {t === "egreso" && <th className="px-2 py-2">Por mes</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filas.map((k, i) => (
                      <tr key={k.id} className="hover:bg-stone-50">
                        <td className="px-2 py-1.5"><a href={href({ detalle: `cat:${k.id}:${t}` })} className="hover:underline">{t === "egreso" ? `${i + 1}. ` : ""}{k.nombre}</a></td>
                        <td className="px-2 py-1.5 text-right font-mono">{formatoPesos(k.total)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-stone-600">{pct(k.pct)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-stone-600">{k.cantidad}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-stone-500">{k.anterior === null ? "—" : formatoPesos(k.anterior)}</td>
                        <td className={`px-2 py-1.5 text-right font-mono ${k.variacion === null ? "text-stone-400" : (t === "egreso" ? k.variacion > 0 : k.variacion < 0) ? "text-red-700" : "text-green-700"}`}>{varTexto(k.variacion)}</td>
                        {t === "egreso" && <td className="px-2 py-1"><MiniMeses valores={k.mensual} color={color} /></td>}
                      </tr>
                    ))}
                    {!filas.length && <tr><td colSpan={7} className="px-2 py-4 text-center text-stone-500">Sin movimientos en {f.anio}.</td></tr>}
                  </tbody>
                </table>
                {c.interanual === null && <p className="mt-1 text-xs text-stone-500">Sin movimientos en {f.anio - 1} para comparar.</p>}
              </div>
            </div>
          </section>
        );
      })}

      {/* Gastos sin fecha */}
      <section id="sin-fecha" className={`tarjeta space-y-4 ${c.sinFecha.cantidad ? "border-amber-300" : ""}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Gastos sin fecha</h2>
          <p className="text-xs text-stone-500">No integran los gráficos mensuales ni el total del año hasta que tengan fecha. Son todos los de {NOMBRE_EMPRESA[f.empresa]} (sin fecha no tienen año).</p>
        </div>
        {c.sinFecha.cantidad === 0 ? (
          <p className="text-sm"><span className="font-mono font-semibold">$ 0,00</span> · <span className="text-green-700">Sin pendientes</span></p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-amber-50 p-3"><p className="text-xs uppercase text-amber-900">Egresos sin fecha</p><p className="font-mono text-xl font-semibold">{c.sinFecha.cantidad}</p></div>
              <div className="rounded-lg bg-amber-50 p-3"><p className="text-xs uppercase text-amber-900">Importe total</p><p className="font-mono text-xl font-semibold">{formatoPesos(c.sinFecha.total)}</p></div>
            </div>
            <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
              <BarrasHorizontales filas={c.sinFecha.categorias} color="#b45309" />
              <div className="max-h-96 overflow-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="sticky top-0 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                    <tr><th className="px-2 py-2">Descripción</th><th className="px-2 py-2">Proveedor</th><th className="px-2 py-2">Categoría</th><th className="px-2 py-2 text-right">Monto</th><th className="px-2 py-2">Estado</th><th className="px-2 py-2" /></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {c.sinFecha.lista.map((m) => (
                      <tr key={m.id}>
                        <td className="px-2 py-1.5">{m.descripcion}</td>
                        <td className="px-2 py-1.5 text-stone-600">{m.contraparte ?? "—"}</td>
                        <td className="px-2 py-1.5 text-stone-600">{m.categoria}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{formatoPesos(m.monto)}</td>
                        <td className="px-2 py-1.5 text-xs">{NOMBRE_ESTADO_MOVIMIENTO[m.estado]}</td>
                        <td className="px-2 py-1.5 text-right"><Link href={`/financiero/${m.id}/editar?volver_a=${encodeURIComponent(href({}) + "#sin-fecha")}`} className="text-xs underline">Corregir</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Indicadores adicionales */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="tarjeta space-y-3">
          <h2 className="font-semibold">Pendientes por categoría</h2>
          {(["cobrar", "pagar"] as const).map((k) => {
            const filas = k === "cobrar" ? c.pendientesCobrar : c.pendientesPagar;
            return (
              <div key={k}>
                <h3 className="mb-1 text-sm font-medium">{k === "cobrar" ? "Por cobrar" : "Por pagar"} · {formatoPesos(k === "cobrar" ? r.pendienteCobrar : r.pendientePagar)}</h3>
                <BarrasHorizontales filas={filas} color={k === "cobrar" ? "#0369a1" : "#b45309"} limite={6} href={() => href({ detalle: `pendiente:${k === "cobrar" ? "ingreso" : "egreso"}` })} />
              </div>
            );
          })}
        </div>

        <div className="tarjeta space-y-3">
          <h2 className="font-semibold">Comparación con {f.anio - 1}</h2>
          {c.interanual ? (
            <>
              <p className="text-xs text-stone-500">Mismo período: enero a {MESES_LARGOS[c.interanual.hastaMes - 1]} de cada año ({etiquetaEstado}).</p>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-stone-500"><tr><th className="py-1" /><th className="py-1 text-right">{f.anio}</th><th className="py-1 text-right">{f.anio - 1}</th><th className="py-1 text-right">Variación</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {(["ingresos", "egresos", "resultado"] as const).map((k) => (
                    <tr key={k}>
                      <td className="py-1.5 capitalize">{k}</td>
                      <td className="py-1.5 text-right font-mono">{formatoPesos(c.interanual!.actual[k])}</td>
                      <td className="py-1.5 text-right font-mono text-stone-500">{formatoPesos(c.interanual!.anterior[k])}</td>
                      <td className="py-1.5 text-right font-mono">{varTexto(c.interanual!.variacion[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="text-sm text-stone-500">No hay movimientos de {f.anio - 1} ({etiquetaEstado}) para comparar.</p>
          )}
          <h3 className="pt-2 text-sm font-medium">Meses con más gastos</h3>
          {c.mesesMayorGasto.length ? (
            <ul className="text-sm">
              {c.mesesMayorGasto.map((m) => <li key={m.mes} className="flex justify-between"><a href={href({ detalle: `mes:${m.mes}` })} className="capitalize hover:underline">{MESES_LARGOS[m.mes - 1]}</a><span className="font-mono">{formatoPesos(m.egresos)}</span></li>)}
            </ul>
          ) : <p className="text-sm text-stone-500">Sin gastos.</p>}
          {c.subas.length > 0 && (
            <>
              <h3 className="pt-2 text-sm font-medium">Mayores subas de gasto (contra el mes anterior)</h3>
              <ul className="text-sm">
                {c.subas.map((s) => <li key={s.mes} className="flex justify-between"><span>{s.desde} → {s.nombre}</span><span className="font-mono text-red-700">+{formatoPesos(s.diferencia)}</span></li>)}
              </ul>
            </>
          )}
        </div>

        <div className="tarjeta space-y-3">
          <h2 className="font-semibold">Proyectado vs. real</h2>
          <p className="text-xs text-stone-500">Lo proyectado es una estimación: no se suma a lo real.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-stone-500"><tr><th className="py-1">Mes</th><th className="py-1 text-right">Ingreso real</th><th className="py-1 text-right">Proyectado</th><th className="py-1 text-right">Egreso real</th><th className="py-1 text-right">Proyectado</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {c.proyectadoVsReal.map((m) => (
                  <tr key={m.nombre}><td className="py-1">{m.nombre}</td><td className="py-1 text-right font-mono">{formatoPesos(m.realIngresos)}</td><td className="py-1 text-right font-mono text-stone-500">{formatoPesos(m.proyIngresos)}</td><td className="py-1 text-right font-mono">{formatoPesos(m.realEgresos)}</td><td className="py-1 text-right font-mono text-stone-500">{formatoPesos(m.proyEgresos)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="tarjeta space-y-3">
          <h2 className="font-semibold">Principales proveedores por egresos</h2>
          <BarrasHorizontales filas={c.proveedores.lista.map((x) => ({ id: x.nombre, nombre: `${x.nombre} (${x.cantidad})`, total: x.total, pct: c.totalesElegidos.egresos ? x.total / c.totalesElegidos.egresos : null }))} color="#57534e" limite={10} />
          {c.proveedores.sinProveedor > 0 && <p className="text-xs text-stone-500">{formatoPesos(c.proveedores.sinProveedor)} de egresos no tienen proveedor (contraparte) cargado.</p>}
        </div>

        <div className="tarjeta space-y-3 lg:col-span-2">
          <h2 className="font-semibold">Resultados por evento <span className="text-sm font-normal text-stone-500">(movimientos de Financiero vinculados a un evento · {etiquetaEstado})</span></h2>
          {c.eventos.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-stone-500"><tr><th className="py-1">Evento</th><th className="py-1 text-right">Ingresos</th><th className="py-1 text-right">Egresos</th><th className="py-1 text-right">Resultado</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {c.eventos.map((e) => (
                    <tr key={e.id}><td className="py-1.5"><a href={href({ detalle: `evento:${e.id}` })} className="hover:underline">{e.nombre}</a></td><td className="py-1.5 text-right font-mono">{formatoPesos(e.ingresos)}</td><td className="py-1.5 text-right font-mono">{formatoPesos(e.egresos)}</td><td className={`py-1.5 text-right font-mono font-semibold ${colorResultado(e.resultado)}`}>{formatoPesos(e.resultado)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-stone-500">No hay movimientos vinculados a eventos.</p>}
        </div>
      </section>

      {/* Detalle de lo elegido */}
      {titulo && (
        <section id="detalle" className="tarjeta scroll-mt-4 space-y-3 border-stone-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{titulo} · {lista.length} movimiento{lista.length === 1 ? "" : "s"}</h2>
            <Link href={href({ detalle: null })} scroll={false} className="text-sm underline">Cerrar</Link>
          </div>
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr><th className="px-2 py-2">Fecha</th><th className="px-2 py-2">Descripción</th><th className="px-2 py-2">Categoría</th><th className="px-2 py-2">Contraparte</th><th className="px-2 py-2">Estado</th><th className="px-2 py-2 text-right">Monto</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {lista.map((m) => (
                  <tr key={m.id}>
                    <td className="px-2 py-1.5 whitespace-nowrap">{m.fecha ? formatoFecha(m.fecha) : "Sin fecha"}</td>
                    <td className="px-2 py-1.5">{m.descripcion}{m.evento && <span className="block text-xs text-stone-500">{m.evento}</span>}</td>
                    <td className="px-2 py-1.5 text-stone-600">{m.categoria}</td>
                    <td className="px-2 py-1.5 text-stone-600">{m.contraparte ?? "—"}</td>
                    <td className="px-2 py-1.5 text-xs">{NOMBRE_ESTADO_MOVIMIENTO[m.estado]}</td>
                    <td className={`px-2 py-1.5 text-right font-mono ${m.tipo === "ingreso" ? "text-green-700" : "text-red-700"}`}>{m.tipo === "egreso" ? "−" : ""}{formatoPesos(m.monto)}</td>
                    <td className="px-2 py-1.5 text-right"><Link href={`/financiero/${m.id}/editar?volver_a=${encodeURIComponent(href({}))}`} className="text-xs underline">Abrir</Link></td>
                  </tr>
                ))}
                {!lista.length && <tr><td colSpan={7} className="px-2 py-4 text-center text-stone-500">Sin movimientos.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-stone-500">
        Cómo se calcula: todo sale de Financiero de {NOMBRE_EMPRESA[f.empresa]}. Resultado real = ingresos reales − egresos reales (ya cobrados y pagados). Pendiente y proyectado se muestran aparte y no se suman a lo real. Lo eliminado no cuenta y lo que no tiene fecha queda en «Gastos sin fecha». Los meses sin movimientos figuran en $ 0.
      </p>
    </div>
  );
}
