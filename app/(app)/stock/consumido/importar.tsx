"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { read, utils } from "xlsx";
import { importarFudo, prepararArchivoFudo, revisarDuplicados } from "@/lib/stock/acciones-consumido";
import { leerReporteFudo, validarContraRanking, type LecturaFudo } from "@/lib/stock/fudo";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { EMPRESAS, NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";
import { formatoFecha, formatoPesos } from "@/lib/formato";

type Evento = { id: string; nombre: string; fecha: string; empresa: Empresa };
type Revision = Awaited<ReturnType<typeof revisarDuplicados>>;
const unidades = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(n);

async function huellaDe(buffer: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** "+ Importar reporte FUDO": empresa, evento y Excel → vista previa → confirmar. */
export function ImportarFudo({ eventos, eventoFijo }: { eventos: Evento[]; eventoFijo?: Evento }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [empresa, setEmpresa] = useState<Empresa>(eventoFijo?.empresa ?? "nero");
  const [eventoId, setEventoId] = useState(eventoFijo?.id ?? "");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [lectura, setLectura] = useState<(LecturaFudo & { huella: string }) | null>(null);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [modo, setModo] = useState<"nueva" | "solo_nuevas" | "reemplazar">("nueva");
  const [reemplaza, setReemplaza] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [paso, setPaso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const propios = eventos.filter((e) => e.empresa === empresa);

  const leer = async (f: File | undefined, evento = eventoId) => {
    setError(null);
    setLectura(null);
    setRevision(null);
    setModo("nueva");
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) return setError("El archivo pesa más de 15 MB");
    const buffer = await f.arrayBuffer();
    let hojas: Record<string, unknown[][]>;
    try {
      const libro = read(buffer, { cellDates: true });
      hojas = Object.fromEntries(libro.SheetNames.map((n) => [n, utils.sheet_to_json<unknown[]>(libro.Sheets[n], { header: 1, blankrows: false, defval: "" })]));
    } catch {
      return setError("No se pudo leer el archivo: tiene que ser el Excel (.xlsx) que exporta FUDO.");
    }
    const l = leerReporteFudo(hojas);
    setArchivo(f);
    setLectura({ ...l, huella: await huellaDe(buffer) });
    if (evento && l.lineas.length) await revisar(evento, l, await huellaDe(buffer));
  };
  const revisar = async (evento: string, l: LecturaFudo, huella: string) => {
    const r = await revisarDuplicados(evento, l.lineas.map((x) => x.huella), huella);
    setRevision(r);
    if (r.repetidas.length && r.vigentes.length) {
      setModo(r.repetidas.length === l.lineas.length ? "reemplazar" : "solo_nuevas");
      setReemplaza(r.vigentes[0].id);
    } else setModo("nueva");
  };

  const validacion = lectura ? validarContraRanking(lectura.lineas, lectura.ranking) : null;
  const dias = new Map<string, { u: number; m: number }>();
  for (const l of lectura?.lineas ?? []) {
    const d = l.fecha ?? "sin fecha";
    const x = dias.get(d) ?? { u: 0, m: 0 };
    dias.set(d, { u: x.u + l.cantidad, m: x.m + l.monto });
  }
  const porDia = [...dias].sort(([a], [b]) => a.localeCompare(b));
  const repetidas = revision?.repetidas.length ?? 0;
  const bloqueado = !lectura || lectura.errores.length > 0 || !eventoId || !!revision?.mismoArchivo || (modo === "nueva" && repetidas > 0);

  const importar = () =>
    iniciar(async () => {
      if (!lectura || !archivo) return;
      setError(null);
      setPaso("Guardando el archivo original…");
      let ruta: string | null = null;
      const p = await prepararArchivoFudo(archivo.name, archivo.size);
      if (p.ruta && p.token) {
        const { error: e } = await crearClienteNavegador().storage.from("fudo").uploadToSignedUrl(p.ruta, p.token, archivo);
        if (!e) ruta = p.ruta;
      }
      setPaso("Importando las ventas…");
      const r = await importarFudo(
        {
          empresa,
          evento_id: eventoId,
          nombre_archivo: archivo.name,
          archivo: ruta,
          huella_archivo: lectura.huella,
          desde: lectura.desde,
          hasta: lectura.hasta,
          ranking_unidades: lectura.ranking.length ? validacion!.rankingUnidades : null,
          ranking_monto: lectura.ranking.length ? validacion!.rankingMonto : null,
          ranking: lectura.ranking,
          nota,
        },
        lectura.lineas,
        modo,
        modo === "reemplazar" ? reemplaza : null,
      );
      setPaso(null);
      if (r.error || !r.id) return setError(r.error ?? "No se pudo importar");
      setAbierto(false);
      router.push(`/stock/consumido/${eventoId}`);
    });

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="boton">
        + Importar reporte FUDO
      </button>
      {abierto && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && setAbierto(false)}>
          <div role="dialog" aria-modal="true" aria-label="Importar reporte FUDO" className="max-h-[94vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Importar reporte de productos de FUDO</h2>
                <p className="text-sm text-stone-500">Se usa la hoja «Detalle»; «Ranking del período» solo valida los totales. No descuenta stock ni genera movimientos.</p>
              </div>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="text-2xl leading-none text-stone-500">×</button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <fieldset>
                <legend className="etiqueta">Empresa</legend>
                <div className="flex gap-2">
                  {EMPRESAS.map((e) => (
                    <label key={e} className={`flex-1 cursor-pointer rounded-md border px-3 py-1.5 text-center text-sm font-semibold ${empresa === e ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"} ${eventoFijo ? "pointer-events-none opacity-60" : ""}`}>
                      <input type="radio" checked={empresa === e} onChange={() => { setEmpresa(e); setEventoId(""); setRevision(null); }} className="sr-only" />
                      {NOMBRE_EMPRESA[e]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block sm:col-span-2">
                <span className="etiqueta">Evento</span>
                <select
                  value={eventoId}
                  disabled={!!eventoFijo}
                  onChange={(e) => {
                    setEventoId(e.target.value);
                    if (lectura && e.target.value) void revisar(e.target.value, lectura, lectura.huella);
                  }}
                  className="campo"
                >
                  <option value="">Elegí el evento…</option>
                  {(eventoFijo ? [eventoFijo] : propios).map((e) => (
                    <option key={e.id} value={e.id}>{e.nombre} · {formatoFecha(e.fecha)}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="etiqueta">Archivo de FUDO (.xlsx)</span>
              <input type="file" accept=".xlsx,.xls" onChange={(e) => void leer(e.target.files?.[0])} className="block w-full text-sm" />
            </label>

            {lectura && (
              <div className="space-y-3">
                {lectura.errores.length > 0 && (
                  <div className="alerta-error">
                    <p className="font-semibold">No se puede importar:</p>
                    <ul className="list-disc pl-5">{lectura.errores.slice(0, 12).map((e) => <li key={e}>{e}</li>)}</ul>
                  </div>
                )}
                {lectura.lineas.length > 0 && validacion && (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      {[
                        ["Período", lectura.desde ? `${formatoFecha(lectura.desde)}${lectura.hasta !== lectura.desde ? ` al ${formatoFecha(lectura.hasta!)}` : ""}` : "sin fecha"],
                        ["Líneas de venta", String(lectura.lineas.length)],
                        ["Unidades vendidas", unidades(validacion.unidades)],
                        ["Ventas", formatoPesos(validacion.monto)],
                      ].map(([n, v]) => (
                        <div key={n} className="rounded-lg border border-stone-200 p-2">
                          <p className="text-xs text-stone-500">{n}</p>
                          <p className="font-semibold">{v}</p>
                        </div>
                      ))}
                    </div>
                    <div className={`rounded-lg border p-3 text-sm ${validacion.coincide ? "border-green-200 bg-green-50 text-green-900" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
                      {!lectura.ranking.length ? (
                        "Sin hoja de Ranking para validar."
                      ) : validacion.coincide ? (
                        <>✓ El Detalle coincide con el Ranking del período ({unidades(validacion.rankingUnidades)} unidades · {formatoPesos(validacion.rankingMonto)}). El Ranking no se suma.</>
                      ) : (
                        <>
                          <p className="font-semibold">El Detalle no coincide con el Ranking en {validacion.diferencias.length} producto(s):</p>
                          <ul className="mt-1 list-disc pl-5">
                            {validacion.diferencias.slice(0, 8).map((d) => (
                              <li key={d.producto}>
                                {d.producto}: Detalle {unidades(d.detalle)} u. / {formatoPesos(d.montoDetalle)} · Ranking {unidades(d.ranking)} u. / {formatoPesos(d.montoRanking)}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-1">Se importa igual el Detalle (es la fuente); revisá el reporte.</p>
                        </>
                      )}
                    </div>
                    {porDia.length > 1 && (
                      <p className="text-xs text-stone-600">
                        Por día: {porDia.map(([d, x]) => `${d === "sin fecha" ? d : formatoFecha(d)}: ${unidades(x.u)} u. · ${formatoPesos(x.m)}`).join(" — ")}
                      </p>
                    )}
                    {lectura.avisos.length > 0 && (
                      <ul className="list-disc pl-5 text-xs text-stone-600">{lectura.avisos.slice(0, 6).map((a) => <li key={a}>{a}</li>)}</ul>
                    )}
                    <details className="rounded-lg border border-stone-200">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Vista previa ({lectura.lineas.length} líneas)</summary>
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-stone-50 text-left text-stone-500">
                            <tr><th className="px-2 py-1">Fecha</th><th className="px-2 py-1">Categoría</th><th className="px-2 py-1">Producto</th><th className="px-2 py-1 text-right">Cant.</th><th className="px-2 py-1 text-right">Monto</th></tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {lectura.lineas.slice(0, 300).map((l) => (
                              <tr key={l.huella} className={revision?.repetidas.includes(l.huella) ? "bg-amber-50" : ""}>
                                <td className="px-2 py-1">{l.fecha ? formatoFecha(l.fecha) : "—"}</td>
                                <td className="px-2 py-1">{l.categoria}{l.subcategoria ? ` · ${l.subcategoria}` : ""}</td>
                                <td className="px-2 py-1">{l.producto}</td>
                                <td className="px-2 py-1 text-right font-mono">{unidades(l.cantidad)}</td>
                                <td className="px-2 py-1 text-right font-mono">{formatoPesos(l.monto)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </>
                )}

                {revision?.mismoArchivo && <p className="alerta-error">Este mismo archivo ya está importado en el evento: no se vuelve a sumar.</p>}
                {revision && !revision.mismoArchivo && repetidas > 0 && (
                  <fieldset className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    <legend className="px-1 font-semibold">{repetidas} de {lectura.lineas.length} líneas ya están en una importación vigente del evento</legend>
                    <label className="flex gap-2">
                      <input type="radio" checked={modo === "reemplazar"} onChange={() => setModo("reemplazar")} />
                      <span>
                        Reemplazar una importación (la anterior queda en el historial y deja de contar):
                        <select value={reemplaza ?? ""} onChange={(e) => setReemplaza(e.target.value)} className="campo mt-1 py-1 text-sm">
                          {revision.vigentes.map((v) => (
                            <option key={v.id} value={v.id}>v{v.version} · {v.nombre_archivo} · {v.lineas} líneas{v.desde ? ` · ${formatoFecha(v.desde)}` : ""} · {v.coinciden} en común</option>
                          ))}
                        </select>
                      </span>
                    </label>
                    <label className="flex gap-2">
                      <input type="radio" checked={modo === "solo_nuevas"} onChange={() => setModo("solo_nuevas")} disabled={repetidas === lectura.lineas.length} />
                      <span>Agregar solo las {lectura.lineas.length - repetidas} líneas nuevas (por ejemplo, otro turno) sin volver a contar las repetidas.</span>
                    </label>
                  </fieldset>
                )}
                <label className="block">
                  <span className="etiqueta">Nota (opcional)</span>
                  <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={1000} placeholder="Ej.: turno noche, corrección del reporte…" className="campo" />
                </label>
              </div>
            )}

            {error && <p className="alerta-error">{error}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={bloqueado || pendiente} onClick={importar} className="boton">
                {pendiente ? (paso ?? "Importando…") : modo === "reemplazar" && !revision?.mismoArchivo ? "Reemplazar e importar" : "Confirmar importación"}
              </button>
              <button type="button" onClick={() => setAbierto(false)} className="boton-secundario">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
