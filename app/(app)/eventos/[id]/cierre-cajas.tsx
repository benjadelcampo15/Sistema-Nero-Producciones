"use client";

import { useState, useTransition } from "react";
import { borrarCaja, crearCaja, guardarCaja } from "@/lib/eventos/acciones-cajas";
import { BILLETES, TEXTO_RESULTADO, cruceCaja, cruceEfectivo, crucePosnet, totalBilletes, totalesCajas, type Billetes, type Caja, type Cruce } from "@/lib/eventos/cajas";
import { formatoPesos } from "@/lib/formato";
import { CampoMonto } from "@/components/campo-monto";

const COLOR_RESULTADO = {
  ok: "border-green-300 bg-green-50 text-green-900",
  falta: "border-red-300 bg-red-50 text-red-900",
  sobra: "border-amber-300 bg-amber-50 text-amber-900",
} as const;

const fechaHora = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

function textoCruce(c: Cruce) {
  if (c.resultado === "ok") return TEXTO_RESULTADO.ok;
  return `${c.resultado === "falta" ? "Faltan" : "Sobran"} ${formatoPesos(Math.abs(c.diferencia))}`;
}

/** Cierre de cajas del evento: una tarjeta por caja, con su cruce, y el total. */
export function CierreCajas({ eventoId, cajas, editable }: { eventoId: string; cajas: Caja[]; editable: boolean }) {
  const [nombre, setNombre] = useState("");
  const [pendiente, iniciar] = useTransition();
  const t = totalesCajas(cajas);

  function agregar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const r = await crearCaja(eventoId, nombre);
      if (r.error) window.alert(r.error);
      else setNombre("");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Cifra titulo="Inicial (cambio)" valor={formatoPesos(t.inicial)} detalle={`${t.cerradas} de ${cajas.length} cajas cerradas`} />
          <Cifra titulo="Efectivo" valor={formatoPesos(t.contado)} detalle={`Fudo: ${formatoPesos(t.fudo)}`} />
          <Cifra titulo="Posnet" valor={formatoPesos(t.posnet)} detalle={`Fudo: ${formatoPesos(t.fudoPosnet)}`} />
          <Cifra
            titulo="Cierre general"
            valor={t.diferencia === 0 ? "$ 0,00" : `${t.diferencia > 0 ? "+" : "−"}${formatoPesos(Math.abs(t.diferencia))}`}
            color={t.diferencia < 0 ? "text-red-700" : t.diferencia > 0 ? "text-amber-700" : "text-green-700"}
            detalle={t.diferencia < 0 ? "Faltó plata" : t.diferencia > 0 ? "Sobró plata" : "Todo cuadra"}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <form onSubmit={agregar} className="flex gap-2">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="Nueva caja, ej. Barra 1" aria-label="Nombre de la caja" className="campo w-56" />
            <button type="submit" disabled={pendiente || !nombre.trim()} className="boton">+ Agregar caja</button>
          </form>
        )}
        {cajas.length > 0 && (
          <a href={`/eventos/${eventoId}/cajas/pdf`} target="_blank" rel="noreferrer" className="boton-secundario ml-auto">
            PDF de cierres
          </a>
        )}
      </div>

      {cajas.length === 0 && <p className="tarjeta p-6 text-center text-sm text-stone-500">Todavía no hay cajas. {editable && "Agregá una por cada punto de cobro (Barra 1, Barra 2, Entrada…)."}</p>}

      <div className="grid gap-4 xl:grid-cols-2">
        {cajas.map((c) => (
          <TarjetaCaja key={`${c.id}-${c.cerrada_en ?? ""}`} caja={c} editable={editable} />
        ))}
      </div>
    </div>
  );
}

function TarjetaCaja({ caja, editable }: { caja: Caja; editable: boolean }) {
  const [c, setC] = useState(caja);
  const [porBilletes, setPorBilletes] = useState(caja.billetes !== null);
  const [billetes, setBilletes] = useState<Billetes>(caja.billetes ?? {});
  const [sinGuardar, setSinGuardar] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cerrada = Boolean(caja.cerrada_en);
  const bloqueada = !editable || cerrada;
  const efectivo = porBilletes ? totalBilletes(billetes) : c.efectivo_final;
  const datos = { ...c, efectivo_final: efectivo };
  const efectivoCruce = cruceEfectivo(datos);
  const posnetCruce = crucePosnet(datos);
  const general = cruceCaja(datos);

  const cambiar = (cambio: Partial<Caja>) => {
    setC((x) => ({ ...x, ...cambio }));
    setSinGuardar(true);
  };
  const guardar = (cerrar?: boolean) => {
    setError(null);
    iniciar(async () => {
      const r = await guardarCaja(caja.id, {
        nombre: c.nombre,
        responsable: c.responsable ?? "",
        monto_inicial: c.monto_inicial,
        monto_fudo: c.monto_fudo,
        efectivo_final: porBilletes ? null : c.efectivo_final,
        billetes: porBilletes ? billetes : null,
        fudo_posnet: c.fudo_posnet,
        posnet_cierre: c.posnet_cierre,
        notas: c.notas ?? "",
        cerrar,
      });
      if (r.error) setError(r.error);
      else setSinGuardar(false);
    });
  };

  return (
    <section className={`tarjeta space-y-4 p-4 ${cerrada ? "bg-stone-50" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {bloqueada ? (
            <h3 className="text-lg font-semibold">{c.nombre}</h3>
          ) : (
            <input value={c.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} maxLength={60} aria-label="Nombre de la caja" className="w-full rounded border border-transparent bg-transparent px-1 text-lg font-semibold hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none" />
          )}
          {bloqueada ? (
            c.responsable && <p className="px-1 text-sm text-stone-500">Responsable: {c.responsable}</p>
          ) : (
            <input value={c.responsable ?? ""} onChange={(e) => cambiar({ responsable: e.target.value })} maxLength={80} placeholder="Responsable (opcional)" aria-label="Responsable" className="w-full rounded border border-transparent bg-transparent px-1 text-sm text-stone-600 hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none" />
          )}
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cerrada ? "bg-stone-800 text-white" : "bg-sky-100 text-sky-800"}`}>
          {cerrada ? `Cerrada ${fechaHora.format(new Date(caja.cerrada_en!))}` : "Abierta"}
        </span>
      </div>

      <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Efectivo</h4>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <p className="etiqueta">Monto inicial</p>
          <CampoMonto valor={c.monto_inicial} alCambiar={(n) => cambiar({ monto_inicial: Math.max(n, 0) })} disabled={bloqueada} etiqueta="Monto inicial" className="campo text-right font-mono" />
        </div>
        <div>
          <p className="etiqueta">Efectivo según Fudo</p>
          <CampoMonto valor={c.monto_fudo ?? 0} alCambiar={(n) => cambiar({ monto_fudo: Math.max(n, 0) })} disabled={bloqueada} etiqueta="Efectivo según Fudo" className="campo text-right font-mono" />
        </div>
        <div>
          <p className="etiqueta">Efectivo contado (final)</p>
          {porBilletes ? (
            <p className="campo bg-stone-50 text-right font-mono font-semibold">{formatoPesos(efectivo ?? 0)}</p>
          ) : (
            <CampoMonto valor={c.efectivo_final ?? 0} alCambiar={(n) => cambiar({ efectivo_final: Math.max(n, 0) })} disabled={bloqueada} etiqueta="Efectivo contado" className="campo text-right font-mono" />
          )}
        </div>
      </div>

      {!bloqueada && (
        <div className="flex gap-1 text-xs" role="group" aria-label="Cómo contar el efectivo">
          {[
            { v: false, t: "Cargar el total" },
            { v: true, t: "Contar por billetes" },
          ].map((o) => (
            <button
              key={o.t}
              type="button"
              onClick={() => {
                setPorBilletes(o.v);
                setSinGuardar(true);
              }}
              className={`rounded-full border px-3 py-1 font-medium ${porBilletes === o.v ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700"}`}
            >
              {o.t}
            </button>
          ))}
        </div>
      )}

      {porBilletes && (
        <div className="overflow-hidden rounded-lg border border-stone-200">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-1.5">Billete</th>
                <th className="px-3 py-1.5 text-right">Cantidad</th>
                <th className="px-3 py-1.5 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {BILLETES.map((d) => {
                const cantidad = billetes[String(d)] ?? 0;
                return (
                  <tr key={d}>
                    <td className="px-3 py-1 font-mono">{formatoPesos(d).replace(",00", "")}</td>
                    <td className="px-3 py-1 text-right">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={cantidad || ""}
                        disabled={bloqueada}
                        aria-label={`Cantidad de billetes de ${d}`}
                        onChange={(e) => {
                          setBilletes((b) => ({ ...b, [String(d)]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }));
                          setSinGuardar(true);
                        }}
                        className="w-24 rounded border border-stone-300 px-2 py-0.5 text-right font-mono disabled:border-transparent disabled:bg-transparent"
                      />
                    </td>
                    <td className="px-3 py-1 text-right font-mono text-stone-600">{cantidad ? formatoPesos(d * cantidad) : ""}</td>
                  </tr>
                );
              })}
              <tr className="bg-stone-50 font-semibold">
                <td className="px-3 py-1.5" colSpan={2}>Total contado</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatoPesos(efectivo ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <LineaCruce cruce={efectivoCruce} detalle={`Esperado = inicial ${formatoPesos(c.monto_inicial)} + Fudo ${formatoPesos(c.monto_fudo ?? 0)}`} falta="Cargá el efectivo de Fudo y el contado." />

      <h4 className="border-t border-stone-200 pt-3 text-xs font-semibold uppercase tracking-wide text-stone-500">Posnet (tarjetas)</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="etiqueta">Tarjetas según Fudo</p>
          <CampoMonto valor={c.fudo_posnet ?? 0} alCambiar={(n) => cambiar({ fudo_posnet: Math.max(n, 0) })} disabled={bloqueada} etiqueta="Tarjetas según Fudo" className="campo text-right font-mono" />
        </div>
        <div>
          <p className="etiqueta">Cierre del posnet (lote)</p>
          <CampoMonto valor={c.posnet_cierre ?? 0} alCambiar={(n) => cambiar({ posnet_cierre: Math.max(n, 0) })} disabled={bloqueada} etiqueta="Cierre del posnet" className="campo text-right font-mono" />
        </div>
      </div>
      <LineaCruce cruce={posnetCruce} detalle="Cierre del posnet contra lo cobrado con tarjeta en Fudo" falta="Cargá lo de Fudo y el cierre del posnet." />

      {general ? (
        <div className={`rounded-lg border-2 px-3 py-2 ${COLOR_RESULTADO[general.resultado]}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Cierre general</p>
            <p className="font-mono text-sm">
              {formatoPesos(general.contado)} − {formatoPesos(general.esperado)} esperado
            </p>
          </div>
          <p className="text-lg font-bold">{textoCruce(general)}</p>
          <p className="text-xs opacity-80">{efectivoCruce && posnetCruce ? "Efectivo + posnet" : efectivoCruce ? "Solo efectivo (falta el posnet)" : "Solo posnet (falta el efectivo)"}</p>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-stone-300 px-3 py-2 text-sm text-stone-500">Cargá los montos de Fudo, el efectivo contado y el cierre del posnet para ver si la caja cuadra.</p>
      )}

      {bloqueada ? (
        c.notas && <p className="text-sm text-stone-600">Notas: {c.notas}</p>
      ) : (
        <input value={c.notas ?? ""} onChange={(e) => cambiar({ notas: e.target.value })} maxLength={500} placeholder="Notas (opcional): retiros, vales, faltantes explicados…" aria-label="Notas" className="campo text-sm" />
      )}

      {error && <p className="alerta-error">{error}</p>}
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          {cerrada ? (
            <button type="button" disabled={pendiente} onClick={() => guardar(false)} className="boton-secundario">Reabrir caja</button>
          ) : (
            <>
              <button type="button" disabled={pendiente || !sinGuardar} onClick={() => guardar()} className="boton-secundario">
                {pendiente ? "Guardando…" : sinGuardar ? "Guardar" : "Guardada"}
              </button>
              <button
                type="button"
                disabled={pendiente}
                onClick={() => window.confirm(`¿Cerrar ${c.nombre}? Queda guardada como está; la podés reabrir.`) && guardar(true)}
                className="boton"
              >
                Cerrar caja
              </button>
            </>
          )}
          {!cerrada && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() =>
                window.confirm(`¿Borrar ${c.nombre}?`) &&
                iniciar(async () => {
                  const r = await borrarCaja(caja.id);
                  if (r.error) setError(r.error);
                })
              }
              className="ml-auto text-xs text-red-700 hover:underline"
            >
              Borrar caja
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** El cruce de una parte de la caja (efectivo o posnet), en una línea. */
function LineaCruce({ cruce, detalle, falta }: { cruce: Cruce | null; detalle: string; falta: string }) {
  if (!cruce) return <p className="text-xs text-stone-500">{falta}</p>;
  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-2 rounded-md border px-3 py-1.5 text-sm ${COLOR_RESULTADO[cruce.resultado]}`}>
      <span className="font-semibold">{textoCruce(cruce)}</span>
      <span className="text-xs opacity-80">{detalle}</span>
    </div>
  );
}

function Cifra({ titulo, valor, detalle, color = "" }: { titulo: string; valor: string; detalle?: string; color?: string }) {
  return (
    <div className="tarjeta p-3">
      <p className="text-xs uppercase tracking-wide text-stone-500">{titulo}</p>
      <p className={`mt-0.5 font-mono text-lg font-semibold ${color}`}>{valor}</p>
      {detalle && <p className="text-xs text-stone-500">{detalle}</p>}
    </div>
  );
}
