"use client";

import { useState } from "react";
import { esquemaRepartoOneShot, type CalculoRuta, type MesRuta, type RepartoOneShot } from "@/lib/objetivos/ruta";
import { formatoPesos } from "@/lib/formato";
import { CampoMonto } from "@/components/campo-monto";

type Persona = { id: string; nombre: string; activo: boolean };
type OneShot = MesRuta["one_shots"][number];

const pct = (n: number) => `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)}%`;
const limitar = (n: number) => Math.min(100, Math.max(0, n));

/** Reparto nuevo: los colaboradores del mes, sin marcar (no se asigna nada solo). */
export const repartoInicial = (porcentajes: MesRuta["porcentajes"]): RepartoOneShot =>
  esquemaRepartoOneShot.parse({ personas: porcentajes.map((p) => ({ colaborador_id: p.colaborador_id })) });

/**
 * Sueldos sobre one shots (20% / 80%): por trabajo, un % del precio va al fondo;
 * la parte de participación se divide entre los que participaron y la general
 * entre los habilitados. El resultado son las asignaciones del one shot.
 */
export function SueldosOneShots({
  oneShots,
  c,
  porcentajes,
  colaboradores,
  editable,
  elegido,
  elegir,
  cambiarOneShot,
}: {
  oneShots: OneShot[];
  c: CalculoRuta;
  porcentajes: MesRuta["porcentajes"];
  colaboradores: Persona[];
  editable: boolean;
  elegido: string | null;
  elegir: (id: string) => void;
  cambiarOneShot: (id: string, cambio: (o: OneShot) => OneShot) => void;
}) {
  const nombre = (id: string) => colaboradores.find((p) => p.id === id)?.nombre ?? "Colaborador borrado";
  const porcentajeFees = (id: string) => porcentajes.find((p) => p.colaborador_id === id)?.porcentaje;
  const o = oneShots.find((x) => x.id === elegido) ?? oneShots[0];
  const titulo = (x: OneShot) => [x.cliente, x.descripcion].filter(Boolean).join(" · ") || "One shot sin nombre";

  return (
    <section id="sueldos-one-shots" className="tarjeta overflow-x-auto p-0">
      <div className="border-b border-stone-200 bg-stone-50 px-3 py-2">
        <h2 className="font-semibold">Sueldos sobre one shots (20% / 80%)</h2>
        <p className="text-xs text-stone-500">
          Por trabajo: un porcentaje del precio va al fondo de colaboradores. La parte de participación se divide entre los que participaron y la general entre los habilitados. Los
          importes pasan solos a las asignaciones del one shot (y de ahí a sueldos y a la rentabilidad). El % de fees es solo referencia.
        </p>
      </div>

      {oneShots.length === 0 ? (
        <p className="px-3 py-2 text-sm text-stone-500">Cargá un one shot arriba para liquidarlo acá.</p>
      ) : (
        <div className="space-y-3 p-3">
          <select value={o.id} onChange={(e) => elegir(e.target.value)} aria-label="One shot a liquidar" className="campo max-w-xl">
            {oneShots.map((x) => (
              <option key={x.id} value={x.id}>
                {titulo(x)} — {formatoPesos(x.neto)}
                {x.reparto ? "" : " (a mano)"}
              </option>
            ))}
          </select>
          {o.reparto ? (
            <Liquidacion
              o={o}
              r={c.repartos.get(o.id)!}
              colaboradores={colaboradores}
              nombre={nombre}
              porcentajeFees={porcentajeFees}
              editable={editable}
              cambiar={(fn) => cambiarOneShot(o.id, (x) => ({ ...x, reparto: fn(x.reparto ?? repartoInicial(porcentajes)) }))}
            />
          ) : (
            <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
              Este one shot tiene las asignaciones cargadas a mano ({formatoPesos(c.oneShots.find((x) => x.id === o.id)?.asignado.valor ?? 0)}).
              {editable && (
                <button
                  type="button"
                  className="ml-2 font-medium underline"
                  onClick={() => {
                    if (o.asignaciones.length && !window.confirm("Las asignaciones cargadas a mano se van a reemplazar por las del reparto 20/80. ¿Seguir?")) return;
                    // Arranca con los del mes y los que ya tenían asignación, sin marcar.
                    const ids = [...new Set([...porcentajes.map((p) => p.colaborador_id), ...o.asignaciones.map((a) => a.colaborador_id)])];
                    cambiarOneShot(o.id, (x) => ({ ...x, reparto: esquemaRepartoOneShot.parse({ personas: ids.map((colaborador_id) => ({ colaborador_id })) }) }));
                  }}
                >
                  Liquidar con 20/80
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {c.liquidacionOneShots.length > 0 && <ResumenColaboradores filas={c.liquidacionOneShots} />}
    </section>
  );
}

function Liquidacion({
  o,
  r,
  colaboradores,
  nombre,
  porcentajeFees,
  editable,
  cambiar,
}: {
  o: OneShot;
  r: CalculoRuta["repartos"] extends Map<string, infer R> ? R : never;
  colaboradores: Persona[];
  nombre: (id: string) => string;
  porcentajeFees: (id: string) => number | undefined;
  editable: boolean;
  cambiar: (fn: (r: RepartoOneShot) => RepartoOneShot | undefined) => void;
}) {
  const reparto = o.reparto!;
  const marcar = (id: string, campo: "participo" | "general", valor: boolean) =>
    cambiar((x) => ({ ...x, personas: x.personas.map((p) => (p.colaborador_id === id ? { ...p, [campo]: valor } : p)) }));
  const libres = colaboradores.filter((p) => p.activo && !reparto.personas.some((x) => x.colaborador_id === p.id));
  const total = (campo: "p20" | "p80" | "total") => Math.round(r.personas.reduce((s, p) => s + p[campo], 0) * 100) / 100;

  return (
    <div className="space-y-3">
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-stone-500">Cliente · descripción</dt>
          <dd className="font-medium">{[o.cliente, o.descripcion].filter(Boolean).join(" · ") || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500">Precio del trabajo (para el fondo)</dt>
          <dd className="flex items-center gap-2">
            <span className="w-36">
              <CampoMonto valor={r.precio} disabled={!editable} etiqueta="Precio del trabajo" alCambiar={(n) => cambiar((x) => ({ ...x, precio: n }))} />
            </span>
            {r.precioEsNeto ? (
              <span className="text-[11px] text-stone-400">= neto</span>
            ) : (
              editable && (
                <button type="button" className="text-[11px] text-stone-500 underline" onClick={() => cambiar((x) => ({ ...x, precio: null }))} title={`Usar el neto (${formatoPesos(o.neto)})`}>
                  usar neto
                </button>
              )
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500">% del precio al fondo</dt>
          <dd className="w-24">
            <CampoMonto valor={reparto.fondo} disabled={!editable} etiqueta="Porcentaje del fondo" alCambiar={(n) => cambiar((x) => ({ ...x, fondo: limitar(n) }))} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500">Fondo de colaboradores</dt>
          <dd className="font-mono font-semibold" title={`${formatoPesos(r.precio)} × ${pct(r.fondoPorcentaje)}`}>{formatoPesos(r.fondo)}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500">Reparto participación / general</dt>
          <dd className="flex items-center gap-1">
            <span className="w-20">
              <CampoMonto valor={reparto.participacion} disabled={!editable} etiqueta="Porcentaje por participación" alCambiar={(n) => cambiar((x) => ({ ...x, participacion: limitar(n) }))} />
            </span>
            <span className="text-stone-400">/</span>
            <span className="w-20">
              <CampoMonto valor={r.general} disabled={!editable} etiqueta="Porcentaje general" alCambiar={(n) => cambiar((x) => ({ ...x, participacion: limitar(100 - n) }))} />
            </span>
            <span className="text-[11px] text-stone-400">suman 100%</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500">Bolsa participación ({pct(r.participacion)})</dt>
          <dd className="font-mono">
            {formatoPesos(r.bolsaParticipacion)}{" "}
            <span className="text-[11px] text-stone-500">{r.participantes ? `÷ ${r.participantes}` : "sin asignar"}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500">Bolsa general ({pct(r.general)})</dt>
          <dd className="font-mono">
            {formatoPesos(r.bolsaGeneral)} <span className="text-[11px] text-stone-500">{r.habilitados ? `÷ ${r.habilitados}` : "sin asignar"}</span>
          </dd>
        </div>
        {r.sinAsignar > 0 && (
          <div>
            <dt className="text-xs text-amber-700">Sin asignar</dt>
            <dd className="font-mono text-amber-800" title="Nadie marcado en esa bolsa: no se reparte y queda en el saldo del one shot">{formatoPesos(r.sinAsignar)}</dd>
          </div>
        )}
      </dl>

      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-xs text-stone-500">
          <tr>
            <th className="px-2 py-1 text-left font-medium">Colaborador</th>
            <th className="px-2 py-1 text-right font-medium" title="Solo referencia: no interviene en el cálculo">% de fees</th>
            <th className="px-2 py-1 text-center font-medium">Participó</th>
            <th className="px-2 py-1 text-center font-medium">Recibe {pct(r.general)}</th>
            <th className="px-2 py-1 text-right font-medium">Importe {pct(r.participacion)}</th>
            <th className="px-2 py-1 text-right font-medium">Importe {pct(r.general)}</th>
            <th className="px-2 py-1 text-right font-medium">Total a pagar</th>
            {editable && <th />}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {r.personas.map((p) => {
            const ref = porcentajeFees(p.colaborador_id);
            return (
              <tr key={p.colaborador_id} className={p.total ? "" : "text-stone-500"}>
                <td className="px-2 py-1">{nombre(p.colaborador_id)}</td>
                <td className="px-2 py-1 text-right font-mono text-xs text-stone-400">{ref === undefined ? "—" : pct(ref)}</td>
                <td className="px-2 py-1 text-center">
                  <input type="checkbox" checked={p.participo} disabled={!editable} onChange={(e) => marcar(p.colaborador_id, "participo", e.target.checked)} aria-label={`${nombre(p.colaborador_id)} participó`} className="h-4 w-4" />
                </td>
                <td className="px-2 py-1 text-center">
                  <input type="checkbox" checked={p.general} disabled={!editable} onChange={(e) => marcar(p.colaborador_id, "general", e.target.checked)} aria-label={`${nombre(p.colaborador_id)} recibe la parte general`} className="h-4 w-4" />
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-right font-mono">{formatoPesos(p.p20)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right font-mono">{formatoPesos(p.p80)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right font-mono font-semibold">{formatoPesos(p.total)}</td>
                {editable && (
                  <td className="w-8">
                    <button
                      type="button"
                      onClick={() => cambiar((x) => ({ ...x, personas: x.personas.filter((y) => y.colaborador_id !== p.colaborador_id) }))}
                      className="px-2 text-stone-400 hover:text-red-700"
                      aria-label={`Quitar a ${nombre(p.colaborador_id)}`}
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-stone-200 bg-stone-50 font-semibold">
          <tr>
            <td className="px-2 py-1.5">Total</td>
            <td />
            <td className="px-2 py-1.5 text-center font-mono text-xs">{r.participantes}</td>
            <td className="px-2 py-1.5 text-center font-mono text-xs">{r.habilitados}</td>
            <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{formatoPesos(total("p20"))}</td>
            <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{formatoPesos(total("p80"))}</td>
            <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{formatoPesos(total("total"))}</td>
            {editable && <td />}
          </tr>
        </tfoot>
      </table>

      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          {libres.length > 0 && (
            <select
              value=""
              onChange={(e) => e.target.value && cambiar((x) => ({ ...x, personas: [...x.personas, { colaborador_id: e.target.value, participo: false, general: false }] }))}
              aria-label="Agregar colaborador al reparto"
              className="campo w-auto text-sm"
            >
              <option value="">+ Agregar colaborador…</option>
              {libres.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="text-xs text-stone-500 underline"
            onClick={() => {
              if (window.confirm("¿Dejar de liquidar este one shot con 20/80? Las asignaciones actuales quedan cargadas a mano.")) cambiar(() => undefined);
            }}
          >
            Pasar a asignaciones a mano
          </button>
        </div>
      )}
    </div>
  );
}

/** Lo que cobra cada colaborador por one shots en el mes, con los trabajos que lo originan. */
function ResumenColaboradores({ filas }: { filas: CalculoRuta["liquidacionOneShots"] }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const hayAMano = filas.some((f) => f.aMano);
  const alternar = (id: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const suma = (campo: "p20" | "p80" | "aMano" | "total") => Math.round(filas.reduce((s, f) => s + f[campo], 0) * 100) / 100;
  return (
    <div className="border-t border-stone-200">
      <h3 className="px-3 pt-3 text-sm font-semibold">Resumen del mes por colaborador</h3>
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-xs text-stone-500">
          <tr>
            <th className="px-3 py-1 text-left font-medium">Colaborador</th>
            <th className="px-3 py-1 text-right font-medium">One shots</th>
            <th className="px-3 py-1 text-right font-medium">Por participación</th>
            <th className="px-3 py-1 text-right font-medium">General</th>
            {hayAMano && <th className="px-3 py-1 text-right font-medium">A mano</th>}
            <th className="px-3 py-1 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {filas.map((f) => (
            <FilaResumen key={f.colaborador_id} f={f} abierto={abiertos.has(f.colaborador_id)} alternar={() => alternar(f.colaborador_id)} hayAMano={hayAMano} />
          ))}
        </tbody>
        <tfoot className="border-t border-stone-200 bg-stone-50 font-semibold">
          <tr>
            <td className="px-3 py-1.5">Total</td>
            <td />
            <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{formatoPesos(suma("p20"))}</td>
            <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{formatoPesos(suma("p80"))}</td>
            {hayAMano && <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{formatoPesos(suma("aMano"))}</td>}
            <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{formatoPesos(suma("total"))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function FilaResumen({ f, abierto, alternar, hayAMano }: { f: CalculoRuta["liquidacionOneShots"][number]; abierto: boolean; alternar: () => void; hayAMano: boolean }) {
  return (
    <>
      <tr>
        <td className="px-3 py-1">
          <button type="button" onClick={alternar} className="text-left hover:underline" aria-expanded={abierto}>
            {abierto ? "▾" : "▸"} {f.colaborador}
          </button>
        </td>
        <td className="px-3 py-1 text-right font-mono">{f.trabajos.length}</td>
        <td className="whitespace-nowrap px-3 py-1 text-right font-mono">{formatoPesos(f.p20)}</td>
        <td className="whitespace-nowrap px-3 py-1 text-right font-mono">{formatoPesos(f.p80)}</td>
        {hayAMano && <td className="whitespace-nowrap px-3 py-1 text-right font-mono">{formatoPesos(f.aMano)}</td>}
        <td className="whitespace-nowrap px-3 py-1 text-right font-mono font-semibold">{formatoPesos(f.total)}</td>
      </tr>
      {abierto &&
        f.trabajos.map((t) => (
          <tr key={t.id} className="bg-stone-50 text-xs text-stone-600">
            <td className="py-1 pl-8 pr-3">{t.nombre}</td>
            <td />
            <td className="whitespace-nowrap px-3 py-1 text-right font-mono">{formatoPesos(t.p20)}</td>
            <td className="whitespace-nowrap px-3 py-1 text-right font-mono">{formatoPesos(t.p80)}</td>
            {hayAMano && <td className="whitespace-nowrap px-3 py-1 text-right font-mono">{formatoPesos(t.aMano)}</td>}
            <td className="whitespace-nowrap px-3 py-1 text-right font-mono">{formatoPesos(t.total)}</td>
          </tr>
        ))}
    </>
  );
}
