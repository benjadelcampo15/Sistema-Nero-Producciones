"use client";

import Link from "next/link";
import { Fragment, useState, useTransition } from "react";
import { anularImportacion, borrarFisico, guardarFisico, guardarTolerancia, traerDeStock } from "@/lib/stock/acciones-consumido";
import type { DatosConsumido } from "@/lib/stock/consumido";
import { COLOR_ESTADO, NOMBRE_ESTADO, consumoFisico, justificado, type EstadoComparacion, type Fisico } from "@/lib/stock/fudo";
import { formatoFecha, formatoFechaHora, formatoPesos } from "@/lib/formato";

const n = (x: number | null | undefined) => (x === null || x === undefined ? "—" : new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(x));
const conSigno = (x: number | null) => (x === null ? "—" : `${x > 0 ? "+" : ""}${n(x)}`);
type Pestana = "comparacion" | "fisico" | "ventas" | "importaciones";

export function VistaConsumido({ datos, edita, esAdmin, vistaInicial }: { datos: DatosConsumido; edita: boolean; esAdmin: boolean; vistaInicial: string }) {
  const [pestana, setPestana] = useState<Pestana>((["comparacion", "fisico", "ventas", "importaciones"] as const).find((p) => p === vistaInicial) ?? "comparacion");
  const { comparacion } = datos;
  const vigentes = datos.importaciones.filter((i) => i.estado === "vigente");
  const indicadores = [
    ["Conciliados", comparacion.filas.filter((f) => f.estado === "conciliado").length, "text-green-700"],
    ["Con diferencia", comparacion.filas.filter((f) => f.estado === "diferencia").length, "text-red-700"],
    ["Sin conteo físico", comparacion.filas.filter((f) => f.estado === "sin_conteo").length, "text-amber-800"],
    ["Sin configurar (FUDO)", comparacion.pendientes.length, "text-amber-800"],
    ["Ventas FUDO", formatoPesos(datos.ventas.reduce((s, v) => s + v.monto, 0)), ""],
    ["Última importación", vigentes[0] ? formatoFechaHora(vigentes[0].creado_en) : "—", ""],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {indicadores.map(([t, v, c]) => (
          <div key={t} className="tarjeta p-3">
            <p className="text-xs text-stone-500">{t}</p>
            <p className={`mt-0.5 break-words font-mono text-base font-semibold ${typeof v === "number" && v > 0 ? c : ""}`}>{v}</p>
          </div>
        ))}
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-stone-200">
        {(
          [
            ["comparacion", "Comparación"],
            ["fisico", `Consumo físico (${datos.fisicos.length})`],
            ["ventas", `Ventas FUDO (${datos.ventas.length})`],
            ["importaciones", `Importaciones (${datos.importaciones.length})`],
          ] as const
        ).map(([p, t]) => (
          <button key={p} type="button" onClick={() => setPestana(p)} className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${pestana === p ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-900"}`}>
            {t}
          </button>
        ))}
      </nav>

      {pestana === "comparacion" && <Comparacion datos={datos} edita={edita} irAFisico={() => setPestana("fisico")} />}
      {pestana === "fisico" && <ConsumoFisico datos={datos} edita={edita} esAdmin={esAdmin} />}
      {pestana === "ventas" && <Ventas datos={datos} />}
      {pestana === "importaciones" && <Importaciones datos={datos} edita={edita} />}
    </div>
  );
}

function Comparacion({ datos, edita, irAFisico }: { datos: DatosConsumido; edita: boolean; irAFisico: () => void }) {
  const { comparacion } = datos;
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<EstadoComparacion | "">("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const filas = comparacion.filas.filter((f) => (!q || f.producto.toLowerCase().includes(q.toLowerCase())) && (!estado || f.estado === estado));
  if (!datos.ventas.length && !datos.fisicos.length) {
    return <p className="tarjeta text-center text-sm text-stone-500">Todavía no hay reportes de FUDO ni conteos para este evento.</p>;
  }
  return (
    <div className="space-y-3">
      {comparacion.pendientes.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">
            Comparación incompleta: {comparacion.pendientes.length} producto{comparacion.pendientes.length === 1 ? "" : "s"} de FUDO sin configurar (no se atribuyen a ningún producto de stock).
          </p>
          <p className="mt-1">{comparacion.pendientes.slice(0, 10).map((p) => `${p.producto} (${n(p.vendidas)})`).join(" · ")}{comparacion.pendientes.length > 10 ? "…" : ""}</p>
          <Link href={`/stock/consumido/recetas?empresa=${datos.evento.empresa}`} className="mt-1 inline-block font-medium underline">
            Configurar productos y recetas →
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto" className="campo w-56" />
        <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoComparacion | "")} aria-label="Estado" className="campo w-auto">
          <option value="">Todos los estados</option>
          {(Object.keys(NOMBRE_ESTADO) as EstadoComparacion[]).map((e) => (
            <option key={e} value={e}>{NOMBRE_ESTADO[e]}</option>
          ))}
        </select>
        <Tolerancia datos={datos} edita={edita} />
      </div>
      <div className="tarjeta overflow-x-auto p-0">
        <table className="min-w-[820px] w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">Unidad</th>
              <th className="px-3 py-2 text-right">FUDO (teórico)</th>
              <th className="px-3 py-2 text-right">Planix (consumo físico)</th>
              <th className="px-3 py-2 text-right" title="Mermas, roturas e invitaciones">Justificado</th>
              <th className="px-3 py-2 text-right">Diferencia</th>
              <th className="px-3 py-2 text-right">%</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filas.map((f) => (
              <Fragment key={f.producto_id}>
                <tr className="cursor-pointer hover:bg-stone-50" onClick={() => setAbierto(abierto === f.producto_id ? null : f.producto_id)}>
                  <td className="px-3 py-2 font-medium">
                    {abierto === f.producto_id ? "▾" : "▸"} {f.producto}
                    {f.corregido !== null && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-900">corregido</span>}
                  </td>
                  <td className="px-3 py-2 text-stone-600">{f.unidad}</td>
                  <td className="px-3 py-2 text-right font-mono">{n(f.teorico)}</td>
                  <td className="px-3 py-2 text-right font-mono">{n(f.consumo)}</td>
                  <td className="px-3 py-2 text-right font-mono text-stone-600">{f.justificado ? n(f.justificado) : "—"}</td>
                  <td className={`px-3 py-2 text-right font-mono font-semibold ${f.diferencia === null ? "" : f.estado === "conciliado" ? "text-green-700" : f.diferencia > 0 ? "text-red-700" : f.diferencia < 0 ? "text-amber-800" : ""}`}>
                    {conSigno(f.diferencia)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-stone-600">{f.pct === null ? "—" : `${f.pct > 0 ? "+" : ""}${n(f.pct)}%`}</td>
                  <td className="px-3 py-2">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO[f.estado]}`}>{NOMBRE_ESTADO[f.estado]}</span>
                  </td>
                </tr>
                {abierto === f.producto_id && (
                  <tr key={`${f.producto_id}-o`} className="bg-stone-50 text-xs text-stone-700">
                    <td colSpan={8} className="px-6 py-2">
                      {f.origen.length ? (
                        <>Teórico: {f.origen.map((o) => `${o.producto}: ${n(o.vendidas)} vendidas × ${n(o.porUnidad)} = ${n(o.vendidas * o.porUnidad)}`).join(" · ")}</>
                      ) : (
                        "Sin ventas en FUDO que consuman este producto."
                      )}
                      {f.estado === "sin_conteo" && edita && (
                        <button type="button" onClick={irAFisico} className="ml-2 underline">Cargar el conteo físico</button>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500">
        Diferencia = consumo físico − justificado − teórico de FUDO. Positiva: se consumió más mercadería de la que surge de FUDO; negativa: FUDO refleja más consumo que el conteo. Es un desvío para revisar, no una conclusión de faltante.
      </p>
    </div>
  );
}

function Tolerancia({ datos, edita }: { datos: DatosConsumido; edita: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [unid, setUnid] = useState(String(datos.tolerancia.unidades));
  const [pct, setPct] = useState(String(datos.tolerancia.pct));
  const [pendiente, iniciar] = useTransition();
  if (!abierto) {
    return (
      <button type="button" onClick={() => edita && setAbierto(true)} className="text-xs text-stone-600 underline" disabled={!edita}>
        Alerta: diferencias de más de {n(datos.tolerancia.unidades)} unidades{datos.tolerancia.pct ? ` o ${n(datos.tolerancia.pct)}%` : ""}
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs">
      Conciliado si la diferencia es de hasta
      <input value={unid} onChange={(e) => setUnid(e.target.value)} inputMode="decimal" className="campo w-16 py-0.5" aria-label="Tolerancia en unidades" /> unidades o
      <input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" className="campo w-16 py-0.5" aria-label="Tolerancia en porcentaje" /> %
      <button
        type="button"
        disabled={pendiente}
        onClick={() => iniciar(async () => { await guardarTolerancia(datos.evento.empresa, Number(unid.replace(",", ".")) || 0, Number(pct.replace(",", ".")) || 0); setAbierto(false); })}
        className="boton py-0.5 text-xs"
      >
        Guardar
      </button>
    </span>
  );
}

// ─── Consumo físico ──────────────────────────────────────────────────────

const VACIO: Fisico = { producto_id: "", inicial: 0, reposiciones: 0, final: 0, mermas: 0, roturas: 0, invitaciones: 0, corregido: null, motivo: null };

function ConsumoFisico({ datos, edita, esAdmin }: { datos: DatosConsumido; edita: boolean; esAdmin: boolean }) {
  const [agregar, setAgregar] = useState("");
  const [extra, setExtra] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const conFudo = datos.comparacion.filas.filter((f) => f.teorico > 0).map((f) => f.producto_id);
  const ids = [...new Set([...datos.fisicos.map((f) => f.producto_id), ...conFudo, ...extra])];
  const filas = ids.map((id) => ({ id, producto: datos.productos.find((p) => p.id === id), fisico: datos.fisicos.find((f) => f.producto_id === id) })).sort((a, b) => (a.producto?.nombre ?? "").localeCompare(b.producto?.nombre ?? ""));
  const desdeStock = Object.keys(datos.salidas).filter((id) => !datos.fisicos.some((f) => f.producto_id === id));
  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">
        Consumo físico = stock inicial + reposiciones − stock final. Las mermas, roturas e invitaciones son la parte justificada: se descuentan del consumo para comparar con FUDO (no se cuentan dos veces). Cargar un conteo no mueve el stock.
      </p>
      {edita && (
        <div className="flex flex-wrap items-center gap-2">
          {desdeStock.length > 0 && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() =>
                iniciar(async () => {
                  const r = await traerDeStock(datos.evento.id, datos.salidas);
                  setMensaje(r.error ?? `Se cargaron ${r.agregados} producto(s) con las salidas de Stock al evento como reposiciones. Completá el inicial y el final.`);
                })
              }
              className="boton-secundario py-1.5 text-sm"
            >
              Traer reposiciones de Stock ({desdeStock.length} producto{desdeStock.length === 1 ? "" : "s"} con salidas al evento)
            </button>
          )}
          <select value={agregar} onChange={(e) => setAgregar(e.target.value)} aria-label="Agregar producto" className="campo w-auto py-1 text-sm">
            <option value="">+ Agregar producto al conteo…</option>
            {datos.productos.filter((p) => !ids.includes(p.id)).map((p) => (
              <option key={p.id} value={p.id}>{p.nombre} ({p.unidad})</option>
            ))}
          </select>
          {agregar && (
            <button type="button" onClick={() => { setExtra([...extra, agregar]); setAgregar(""); }} className="boton py-1 text-sm">Agregar</button>
          )}
        </div>
      )}
      {mensaje && <p className="text-sm text-stone-700">{mensaje}</p>}
      {filas.length === 0 ? (
        <p className="tarjeta text-center text-sm text-stone-500">Sin productos para contar todavía.</p>
      ) : (
        <div className="tarjeta overflow-x-auto p-0">
          <table className="min-w-[1050px] w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-2 py-2">Producto</th>
                <th className="px-2 py-2 text-right">Inicial</th>
                <th className="px-2 py-2 text-right">Reposiciones</th>
                <th className="px-2 py-2 text-right">Final</th>
                <th className="px-2 py-2 text-right">Consumo</th>
                <th className="px-2 py-2 text-right">Mermas</th>
                <th className="px-2 py-2 text-right">Roturas</th>
                <th className="px-2 py-2 text-right">Invitaciones</th>
                <th className="px-2 py-2 text-right">Vendido (sin justificar)</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filas.map((f) => (
                <FilaFisico key={`${f.id}-${f.fisico?.actualizado_en ?? "nuevo"}`} eventoId={datos.evento.id} productoId={f.id} nombre={f.producto?.nombre ?? "Producto borrado"} unidad={f.producto?.unidad ?? ""} inicial={f.fisico} edita={edita} esAdmin={esAdmin} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilaFisico({ eventoId, productoId, nombre, unidad, inicial, edita, esAdmin }: { eventoId: string; productoId: string; nombre: string; unidad: string; inicial?: Fisico & { nota: string | null }; edita: boolean; esAdmin: boolean }) {
  const [v, setV] = useState<Fisico & { nota: string | null }>(inicial ?? { ...VACIO, producto_id: productoId, nota: null });
  const [corrigiendo, setCorrigiendo] = useState(inicial?.corregido != null);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(!!inicial);
  const [pendiente, iniciar] = useTransition();
  const cambiar = (c: Partial<Fisico & { nota: string | null }>) => {
    setV({ ...v, ...c });
    setGuardado(false);
  };
  const campo = (k: "inicial" | "reposiciones" | "final" | "mermas" | "roturas" | "invitaciones") => (
    <td className="px-1 py-1">
      <input
        value={String(v[k]).replace(".", ",")}
        disabled={!edita}
        inputMode="decimal"
        onChange={(e) => cambiar({ [k]: Math.max(0, Number(e.target.value.replace(/\./g, "").replace(",", ".")) || 0) })}
        aria-label={`${k} de ${nombre}`}
        className="w-20 rounded border border-stone-200 bg-white px-1.5 py-1 text-right font-mono text-sm disabled:bg-transparent"
      />
    </td>
  );
  const consumo = consumoFisico(v);
  const vendido = Math.round((consumo - justificado(v)) * 1000) / 1000;
  return (
    <>
      <tr className={guardado ? "" : "bg-amber-50/40"}>
        <td className="px-2 py-1">
          <span className="font-medium">{nombre}</span> <span className="text-xs text-stone-500">{unidad}</span>
          {!inicial && <span className="ml-1 text-[10px] text-amber-800">sin conteo</span>}
        </td>
        {campo("inicial")}
        {campo("reposiciones")}
        {campo("final")}
        <td className={`px-2 py-1 text-right font-mono font-semibold ${consumo < 0 ? "text-red-700" : ""}`}>
          {n(consumo)}
          {v.corregido !== null && <span className="block text-[10px] font-normal text-amber-800">corregido (calculado {n(Math.round((v.inicial + v.reposiciones - v.final) * 1000) / 1000)})</span>}
        </td>
        {campo("mermas")}
        {campo("roturas")}
        {campo("invitaciones")}
        <td className="px-2 py-1 text-right font-mono">{n(vendido)}</td>
        <td className="px-2 py-1">
          {edita && (
            <span className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                disabled={pendiente || guardado}
                onClick={() =>
                  iniciar(async () => {
                    const r = await guardarFisico(eventoId, productoId, { ...v, motivo: v.motivo, nota: v.nota });
                    setError(r.error ?? null);
                    if (!r.error) setGuardado(true);
                  })
                }
                className="boton py-0.5 text-xs"
              >
                {guardado ? "Guardado" : "Guardar"}
              </button>
              {esAdmin && (
                <button type="button" onClick={() => setCorrigiendo(!corrigiendo)} className="underline">
                  Corregir
                </button>
              )}
              {inicial && (
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => window.confirm(`¿Borrar el conteo de ${nombre}?`) && iniciar(async () => setError((await borrarFisico(eventoId, productoId)).error ?? null))}
                  className="text-red-700 underline"
                >
                  Borrar
                </button>
              )}
            </span>
          )}
        </td>
      </tr>
      {(corrigiendo || error) && (
        <tr className="bg-stone-50">
          <td colSpan={10} className="px-3 py-2 text-xs">
            {corrigiendo && esAdmin && (
              <span className="flex flex-wrap items-center gap-2">
                Consumo corregido (autorizado):
                <input
                  value={v.corregido === null ? "" : String(v.corregido).replace(".", ",")}
                  onChange={(e) => cambiar({ corregido: e.target.value.trim() === "" ? null : Math.max(0, Number(e.target.value.replace(",", ".")) || 0) })}
                  inputMode="decimal"
                  aria-label="Consumo corregido"
                  className="w-24 rounded border border-stone-300 px-1.5 py-1 text-right font-mono"
                />
                Motivo:
                <input value={v.motivo ?? ""} onChange={(e) => cambiar({ motivo: e.target.value || null })} maxLength={500} aria-label="Motivo de la corrección" className="min-w-60 flex-1 rounded border border-stone-300 px-1.5 py-1" />
                <span className="text-stone-500">Vacío = se usa el cálculo. Queda registrado quién y cuándo.</span>
              </span>
            )}
            {error && <p className="text-red-700">{error}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Ventas de FUDO ──────────────────────────────────────────────────────

function Ventas({ datos }: { datos: DatosConsumido }) {
  const [fecha, setFecha] = useState("");
  const [categoria, setCategoria] = useState("");
  const [q, setQ] = useState("");
  const fechas = [...new Set(datos.ventas.map((v) => v.fecha ?? ""))].sort();
  const categorias = [...new Set(datos.ventas.map((v) => v.categoria ?? ""))].filter(Boolean).sort();
  const ventas = datos.ventas
    .filter((v) => (!fecha || v.fecha === fecha) && (!categoria || v.categoria === categoria) && (!q || v.producto.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "") || (a.categoria ?? "").localeCompare(b.categoria ?? "") || a.producto.localeCompare(b.producto));
  const ranking = [...ventas.reduce((m, v) => m.set(v.clave, { producto: v.producto, u: (m.get(v.clave)?.u ?? 0) + v.cantidad, m: (m.get(v.clave)?.m ?? 0) + v.monto }), new Map<string, { producto: string; u: number; m: number }>()).values()].sort((a, b) => b.u - a.u);
  const consumidos = datos.comparacion.filas.filter((f) => f.consumo !== null).sort((a, b) => (b.consumo ?? 0) - (a.consumo ?? 0));
  if (!datos.ventas.length) return <p className="tarjeta text-center text-sm text-stone-500">No hay ventas importadas (vigentes) para este evento.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Día" className="campo w-auto">
          <option value="">Todos los días</option>
          {fechas.map((f) => <option key={f} value={f}>{f ? formatoFecha(f) : "Sin fecha"}</option>)}
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría" className="campo w-auto">
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Producto…" aria-label="Producto" className="campo w-48" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="tarjeta p-0">
          <h3 className="border-b border-stone-200 px-3 py-2 font-semibold">Ranking de productos vendidos (FUDO)</h3>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-stone-100">
              {ranking.slice(0, 40).map((r) => (
                <tr key={r.producto}><td className="px-3 py-1">{r.producto}</td><td className="px-3 py-1 text-right font-mono">{n(r.u)}</td><td className="px-3 py-1 text-right font-mono text-stone-600">{formatoPesos(r.m)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="tarjeta p-0">
          <h3 className="border-b border-stone-200 px-3 py-2 font-semibold">Ranking de consumo físico (Planix)</h3>
          {consumidos.length ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-stone-100">
                {consumidos.slice(0, 40).map((f) => (
                  <tr key={f.producto_id}><td className="px-3 py-1">{f.producto}</td><td className="px-3 py-1 text-right font-mono">{n(f.consumo)} {f.unidad}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-3 py-2 text-sm text-stone-500">Sin conteos cargados.</p>
          )}
        </section>
      </div>
      <section className="tarjeta overflow-x-auto p-0">
        <h3 className="border-b border-stone-200 px-3 py-2 font-semibold">Detalle diario ({ventas.length} líneas · {n(ventas.reduce((s, v) => s + v.cantidad, 0))} unidades · {formatoPesos(ventas.reduce((s, v) => s + v.monto, 0))})</h3>
        <table className="min-w-[640px] w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr><th className="px-3 py-1">Fecha</th><th className="px-3 py-1">Categoría</th><th className="px-3 py-1">Producto</th><th className="px-3 py-1 text-right">Cantidad</th><th className="px-3 py-1 text-right">Monto</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {ventas.map((v, i) => (
              <tr key={i}>
                <td className="px-3 py-1">{v.fecha ? formatoFecha(v.fecha) : "—"}</td>
                <td className="px-3 py-1 text-stone-600">{v.categoria}{v.subcategoria ? ` · ${v.subcategoria}` : ""}</td>
                <td className="px-3 py-1">{v.producto}</td>
                <td className="px-3 py-1 text-right font-mono">{n(v.cantidad)}</td>
                <td className="px-3 py-1 text-right font-mono">{formatoPesos(v.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ─── Importaciones (historial) ───────────────────────────────────────────

const COLOR_IMPORTACION = { vigente: "bg-green-100 text-green-800", reemplazada: "bg-stone-200 text-stone-700", anulada: "bg-red-100 text-red-800" } as const;

function Importaciones({ datos, edita }: { datos: DatosConsumido; edita: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  if (!datos.importaciones.length) return <p className="tarjeta text-center text-sm text-stone-500">Todavía no se importaron reportes para este evento.</p>;
  return (
    <div className="space-y-2">
      {error && <p className="alerta-error">{error}</p>}
      <ul className="space-y-2">
        {datos.importaciones.map((i) => {
          const coincide = i.ranking_unidades === null || (Math.abs(i.ranking_unidades - i.unidades) < 0.001 && Math.abs((i.ranking_monto ?? 0) - i.monto) < 0.5);
          return (
            <li key={i.id} className={`tarjeta p-3 text-sm ${i.estado !== "vigente" ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">v{i.version}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_IMPORTACION[i.estado]}`}>{i.estado === "vigente" ? "Vigente" : i.estado === "reemplazada" ? "Reemplazada" : "Anulada"}</span>
                <span>{i.nombre_archivo}</span>
                {i.archivo && <a href={`/stock/consumido/archivo/${i.id}`} className="text-xs underline">descargar original</a>}
              </div>
              <p className="mt-1 text-stone-600">
                {i.desde ? `${formatoFecha(i.desde)}${i.hasta && i.hasta !== i.desde ? ` al ${formatoFecha(i.hasta)}` : ""}` : "sin fecha"} · {i.lineas} líneas · {n(i.unidades)} unidades · {formatoPesos(i.monto)}
                {i.descartadas > 0 ? ` · se agregaron solo las líneas nuevas (${i.descartadas} ya estaban en otra importación y no se volvieron a contar)` : i.ranking_unidades !== null && (coincide ? " · ✓ coincide con el Ranking" : ` · ⚠ Ranking: ${n(i.ranking_unidades)} u. / ${formatoPesos(i.ranking_monto ?? 0)}`)}
              </p>
              <p className="text-xs text-stone-500">
                Cargada el {formatoFechaHora(i.creado_en)} por {i.creado_por ? (datos.autores[i.creado_por] ?? "—") : "—"}
                {i.estado_en && ` · ${i.estado === "anulada" ? "anulada" : "reemplazada"} el ${formatoFechaHora(i.estado_en)}`}
                {i.nota && ` · ${i.nota}`}
              </p>
              {edita && i.estado === "vigente" && (
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => {
                    const motivo = window.prompt("Motivo de la anulación (queda en el historial):");
                    if (motivo?.trim()) iniciar(async () => setError((await anularImportacion(i.id, motivo)).error ?? null));
                  }}
                  className="mt-1 text-xs text-red-700 underline"
                >
                  Anular
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
