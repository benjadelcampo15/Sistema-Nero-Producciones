"use client";

import { useEffect, useState, useTransition } from "react";
import { guardarMes } from "@/lib/objetivos/acciones";
import type { Empresa } from "@/lib/empresas";
import { BLOQUES, MESES, calcularMes, type DatosMes, type Item, type ListaMes } from "@/lib/objetivos/tipos";
import { formatoPesos, parsearMonto } from "@/lib/formato";

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);

/** Monto escrito a la argentina, con signo ("-1.234,50"). */
function leerMonto(texto: string) {
  const negativo = texto.trim().startsWith("-");
  const valor = parsearMonto(texto.trim().replace(/^-/, ""));
  return valor === null ? null : negativo ? -valor : valor;
}
const mostrarMonto = (n: number) => (n ? String(n).replace(".", ",") : "");

export function EditorMes({
  empresa,
  anio,
  mes,
  inicial,
  anterior,
  acumuladoAnterior,
  editable,
}: {
  empresa: Empresa;
  anio: number;
  mes: number;
  inicial: DatosMes;
  anterior: DatosMes | null;
  acumuladoAnterior: number;
  editable: boolean;
}) {
  const [datos, setDatos] = useState<DatosMes>(inicial);
  const [sinGuardar, setSinGuardar] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, iniciar] = useTransition();
  const c = calcularMes(datos);

  const cambiar = (cambio: (d: DatosMes) => DatosMes) => {
    setDatos(cambio);
    setSinGuardar(true);
    setMensaje(null);
  };

  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar]);

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarMes(empresa, anio, mes, datos);
      if (r.error) setMensaje({ tipo: "error", texto: r.error });
      else {
        setSinGuardar(false);
        setMensaje({ tipo: "ok", texto: "Guardado" });
      }
    });

  const copiarAnterior = () => {
    if (!anterior) return;
    const hayDatos = BLOQUES.some((b) => datos[b.id].length);
    if (hayDatos && !window.confirm(`¿Reemplazar salarios, creators, gastos fijos, variables y distribución por los de ${MESES[mes - 2]}?`)) return;
    // Se copian los costos (que se repiten) y la distribución; los ingresos son de cada mes.
    cambiar((d) => ({
      ...d,
      salarios: anterior.salarios,
      creators: anterior.creators,
      fijos: anterior.fijos,
      variables: anterior.variables,
      distribucion: anterior.distribucion,
    }));
  };

  const ingresos = BLOQUES.filter((b) => b.grupo === "ingresos");
  const costos = BLOQUES.filter((b) => b.grupo === "costos");

  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          {anterior && (
            <button type="button" onClick={copiarAnterior} className="boton-secundario">
              Copiar costos de {MESES[mes - 2]}
            </button>
          )}
          {mensaje && <p className={`text-sm ${mensaje.tipo === "error" ? "text-red-700" : "text-green-700"}`}>{mensaje.texto}</p>}
          <button type="button" onClick={guardar} disabled={guardando || !sinGuardar} className="boton ml-auto">
            {guardando ? "Guardando…" : sinGuardar ? "Guardar" : "Guardado"}
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Cifra titulo="Total ingreso" valor={c.ingreso} color="text-green-700" />
        <Cifra titulo="Total costos" valor={c.costos} color="text-red-700" />
        <Cifra titulo="Rentabilidad final" valor={c.final} nota={`${pct(c.ratios.at(-1)!.valor)} sobre ventas`} />
        <Cifra titulo={`Rentabilidad anual (a ${MESES[mes - 1].toLowerCase()})`} valor={acumuladoAnterior + c.final} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_20rem]">
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Ingresos</h2>
          {ingresos.map((b) => (
            <Bloque
              key={b.id}
              titulo={b.nombre}
              total={b.total}
              items={datos[b.id]}
              porcentaje={c.ingreso ? c.totales[b.id] / c.ingreso : null}
              editable={editable}
              alCambiar={(items) => cambiar((d) => ({ ...d, [b.id]: items }))}
            />
          ))}
        </div>
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Costos</h2>
          {costos.map((b) => (
            <Bloque
              key={b.id}
              titulo={b.nombre}
              total={b.total}
              items={datos[b.id]}
              porcentaje={c.ingreso ? c.totales[b.id] / c.ingreso : null}
              conNota={b.id === "salarios"}
              editable={editable}
              alCambiar={(items) => cambiar((d) => ({ ...d, [b.id as ListaMes]: items }))}
            />
          ))}
        </div>
        <div className="space-y-4">
          <section className="tarjeta space-y-2 p-4 text-sm">
            <h2 className="font-semibold">Ratios</h2>
            <dl className="space-y-1">
              {c.ratios.map((r) => (
                <div key={r.nombre} className="flex justify-between gap-2">
                  <dt className="text-stone-600">{r.nombre}</dt>
                  <dd className="font-mono">{pct(r.valor)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <Distribucion datos={datos} distribucion={c.distribucion} editable={editable} alCambiar={(distribucion) => cambiar((d) => ({ ...d, distribucion }))} />
          <section className="tarjeta space-y-2 p-4 text-sm">
            <h2 className="font-semibold">Notas</h2>
            <textarea
              value={datos.notas ?? ""}
              onChange={(e) => cambiar((d) => ({ ...d, notas: e.target.value }))}
              disabled={!editable}
              rows={4}
              maxLength={4000}
              aria-label="Notas del mes"
              className="campo"
            />
          </section>
        </div>
      </div>
    </div>
  );
}

function Cifra({ titulo, valor, color, nota }: { titulo: string; valor: number; color?: string; nota?: string }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{titulo}</p>
      <p className={`mt-1 font-mono text-lg font-semibold ${valor < 0 ? "text-red-700" : (color ?? "")}`}>{formatoPesos(valor)}</p>
      {nota && <p className="text-xs text-stone-500">{nota}</p>}
    </div>
  );
}

/** Una lista de la planilla (detalle y monto) con su total. */
function Bloque({
  titulo,
  total,
  items,
  porcentaje,
  conNota = false,
  editable,
  alCambiar,
}: {
  titulo: string;
  total: string;
  items: Item[];
  porcentaje: number | null;
  conNota?: boolean;
  editable: boolean;
  alCambiar: (items: Item[]) => void;
}) {
  const suma = items.reduce((s, i) => s + i.monto, 0);
  const editar = (i: number, cambio: Partial<Item>) => alCambiar(items.map((it, j) => (j === i ? { ...it, ...cambio } : it)));
  return (
    <section className="tarjeta p-0 text-sm">
      <h3 className="border-b border-stone-200 bg-stone-50 px-3 py-2 font-semibold">{titulo}</h3>
      <div className="divide-y divide-stone-100">
        {items.map((it, i) => (
          <div key={i} className="px-3 py-1.5">
            <div className="flex items-center gap-2">
              <input
                value={it.detalle}
                disabled={!editable}
                maxLength={200}
                aria-label={`${titulo}: detalle`}
                onChange={(e) => editar(i, { detalle: e.target.value })}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-stone-200 focus:border-stone-400 focus:outline-none"
              />
              <CampoMonto valor={it.monto} disabled={!editable} etiqueta={`${titulo}: monto de ${it.detalle || "fila"}`} alCambiar={(monto) => editar(i, { monto })} />
              {editable && (
                <button type="button" onClick={() => alCambiar(items.filter((_, j) => j !== i))} className="text-stone-400 hover:text-red-700" aria-label="Quitar fila">
                  ×
                </button>
              )}
            </div>
            {conNota && (it.nota || editable) && (
              <input
                value={it.nota ?? ""}
                disabled={!editable}
                maxLength={500}
                placeholder="Datos de cobro / comentario"
                aria-label={`${titulo}: nota`}
                onChange={(e) => editar(i, { nota: e.target.value || undefined })}
                className="mt-0.5 w-full rounded border border-transparent bg-transparent px-1 text-xs text-stone-500 hover:border-stone-200 focus:border-stone-400 focus:outline-none"
              />
            )}
          </div>
        ))}
        {editable && (
          <button type="button" onClick={() => alCambiar([...items, { detalle: "", monto: 0 }])} className="w-full px-3 py-1.5 text-left text-xs text-stone-500 hover:bg-stone-50 hover:text-stone-900">
            + Agregar fila
          </button>
        )}
      </div>
      <div className="flex justify-between gap-2 border-t border-stone-200 bg-stone-50 px-3 py-2 font-semibold">
        <span>{total}</span>
        <span className="flex gap-3 font-mono">
          <span className="text-xs font-normal text-stone-500">{pct(porcentaje)}</span>
          {formatoPesos(suma)}
        </span>
      </div>
    </section>
  );
}

/** Campo de monto que se edita como texto y se valida al salir. */
function CampoMonto({ valor, disabled, etiqueta, alCambiar }: { valor: number; disabled: boolean; etiqueta: string; alCambiar: (n: number) => void }) {
  const [texto, setTexto] = useState(mostrarMonto(valor));
  const [error, setError] = useState(false);
  return (
    <input
      value={texto}
      disabled={disabled}
      inputMode="decimal"
      aria-label={etiqueta}
      onChange={(e) => {
        setTexto(e.target.value);
        const n = e.target.value.trim() ? leerMonto(e.target.value) : 0;
        setError(n === null);
        if (n !== null) alCambiar(n);
      }}
      onBlur={() => !error && setTexto(mostrarMonto(valor))}
      className={`w-36 rounded border px-1 py-0.5 text-right font-mono ${error ? "border-red-400 bg-red-50" : "border-transparent bg-transparent hover:border-stone-200"} focus:border-stone-400 focus:outline-none`}
    />
  );
}

function Distribucion({
  datos,
  distribucion,
  editable,
  alCambiar,
}: {
  datos: DatosMes;
  distribucion: { detalle: string; porcentaje: number; monto: number }[];
  editable: boolean;
  alCambiar: (d: DatosMes["distribucion"]) => void;
}) {
  const suma = datos.distribucion.reduce((s, d) => s + d.porcentaje, 0);
  const editar = (i: number, cambio: Partial<{ detalle: string; porcentaje: number }>) =>
    alCambiar(datos.distribucion.map((d, j) => (j === i ? { ...d, ...cambio } : d)));
  return (
    <section className="tarjeta space-y-2 p-4 text-sm">
      <h2 className="font-semibold">Distribución de la rentabilidad</h2>
      {distribucion.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={d.detalle}
            disabled={!editable}
            maxLength={100}
            aria-label="Destino"
            onChange={(e) => editar(i, { detalle: e.target.value })}
            className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 hover:border-stone-200 focus:border-stone-400 focus:outline-none"
          />
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={d.porcentaje}
            disabled={!editable}
            aria-label={`Porcentaje de ${d.detalle}`}
            onChange={(e) => editar(i, { porcentaje: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
            className="w-14 rounded border border-stone-200 px-1 text-right font-mono"
          />
          <span className="text-xs">%</span>
          <span className={`w-28 text-right font-mono ${d.monto < 0 ? "text-red-700" : ""}`}>{formatoPesos(d.monto)}</span>
          {editable && (
            <button type="button" onClick={() => alCambiar(datos.distribucion.filter((_, j) => j !== i))} className="text-stone-400 hover:text-red-700" aria-label="Quitar">
              ×
            </button>
          )}
        </div>
      ))}
      {editable && (
        <button type="button" onClick={() => alCambiar([...datos.distribucion, { detalle: "", porcentaje: 0 }])} className="text-xs text-stone-500 hover:text-stone-900">
          + Agregar destino
        </button>
      )}
      <p className={`text-xs ${Math.round(suma) === 100 ? "text-stone-500" : "text-amber-700"}`}>Suma: {suma}%{Math.round(suma) !== 100 && " (no llega al 100%)"}</p>
    </section>
  );
}
