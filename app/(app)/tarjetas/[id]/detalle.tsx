"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EMPRESAS, NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";
import {
  actualizarResumen,
  agregarMovimiento,
  aplicarReglas,
  asignarIguales,
  asignarMovimiento,
  borrarMovimiento,
  borrarResumen,
  deshacerPase,
  pasarAFinanciero,
  repartirCargos,
} from "@/lib/tarjetas/acciones";
import { formatoDolares, type MovimientoTarjeta, type Totales, type TipoMovimiento } from "@/lib/tarjetas/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";

type Aviso = { tipo: "ok" | "error"; texto: string; accion?: { etiqueta: string; ejecutar: () => Promise<{ error?: string; ok?: string }> } } | null;

function MensajeAviso({ aviso, onAviso }: { aviso: Aviso; onAviso?: (a: Aviso) => void }) {
  const [pendiente, iniciar] = useTransition();
  if (!aviso) return null;
  if (aviso.tipo === "error") return <p className="alerta-error">{aviso.texto}</p>;
  const accion = aviso.accion;
  return (
    <p className="flex flex-wrap items-center gap-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
      {aviso.texto}
      {accion && onAviso && (
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              const r = await accion.ejecutar();
              onAviso(r.error ? { tipo: "error", texto: r.error } : { tipo: "ok", texto: r.ok ?? "Listo" });
            })
          }
          className="boton py-1 text-xs"
        >
          {pendiente ? "Asignando…" : accion.etiqueta}
        </button>
      )}
    </p>
  );
}

function leerNumero(texto: string) {
  const limpio = texto.trim().replace(/\./g, "").replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : NaN;
}

export function AccionesResumen({ id }: { id: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<Aviso>(null);
  return (
    <>
      <button
        type="button"
        disabled={pendiente}
        className="boton-secundario"
        onClick={() =>
          iniciar(async () => {
            const r = await aplicarReglas(id);
            setAviso(r.error ? { tipo: "error", texto: r.error } : { tipo: "ok", texto: r.ok ?? "Listo" });
          })
        }
      >
        Aplicar reglas
      </button>
      <button
        type="button"
        disabled={pendiente}
        className="boton-secundario text-red-700"
        onClick={() => {
          if (!confirm("¿Borrar este resumen con todos sus renglones? Las reglas aprendidas se mantienen.")) return;
          iniciar(async () => {
            const r = await borrarResumen(id);
            if (r.error) setAviso({ tipo: "error", texto: r.error });
            else router.push("/tarjetas");
          });
        }}
      >
        Borrar resumen
      </button>
      {aviso && (
        <div className="w-full">
          <MensajeAviso aviso={aviso} />
        </div>
      )}
    </>
  );
}

export function DatosResumen({ id, cotizacion, vencimiento, editable }: { id: string; cotizacion: number | null; vencimiento: string | null; editable: boolean }) {
  const [cotizacionTexto, setCotizacionTexto] = useState(cotizacion ? String(cotizacion).replace(".", ",") : "");
  const [venc, setVenc] = useState(vencimiento ?? "");
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<Aviso>(null);
  if (!editable) {
    return (
      <p className="text-sm text-stone-600">
        Cotización del dólar: <span className="font-mono font-medium">{cotizacion ? formatoPesos(cotizacion) : "—"}</span>
      </p>
    );
  }
  const guardar = () =>
    iniciar(async () => {
      const n = leerNumero(cotizacionTexto);
      if (Number.isNaN(n) || (n !== null && n <= 0)) {
        setAviso({ tipo: "error", texto: "Cotización inválida" });
        return;
      }
      const r = await actualizarResumen(id, { cotizacion_usd: n, vencimiento: venc || null });
      setAviso(r.error ? { tipo: "error", texto: r.error } : { tipo: "ok", texto: "Guardado" });
    });
  return (
    <section className="tarjeta space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="cotizacion" className="etiqueta">Cotización del dólar</label>
          <input id="cotizacion" inputMode="decimal" placeholder="Ej: 1550" value={cotizacionTexto} onChange={(e) => setCotizacionTexto(e.target.value)} className="campo w-36" />
        </div>
        <div>
          <label htmlFor="vencimiento" className="etiqueta">Vencimiento</label>
          <input id="vencimiento" type="date" value={venc} onChange={(e) => setVenc(e.target.value)} className="campo" />
        </div>
        <button type="button" onClick={guardar} disabled={pendiente} className="boton">
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      </div>
      <p className="text-xs text-stone-500">Los consumos en dólares se pasan a pesos con esta cotización.</p>
      <MensajeAviso aviso={aviso} />
    </section>
  );
}

const ETIQUETA_FILTRO = { todos: "Todos", sin: "Sin asignar", nero: NOMBRE_EMPRESA.nero, ruta: NOMBRE_EMPRESA.ruta } as const;

export function TablaConsumos({ resumenId, movimientos, detalles, editable }: { resumenId: string; movimientos: MovimientoTarjeta[]; detalles: string[]; editable: boolean }) {
  const [filtro, setFiltro] = useState<keyof typeof ETIQUETA_FILTRO>("todos");
  const [aviso, setAviso] = useState<Aviso>(null);
  const visibles = movimientos.filter((m) => filtro === "todos" || (filtro === "sin" ? !m.empresa : m.empresa === filtro));
  const cantidad = (f: keyof typeof ETIQUETA_FILTRO) => movimientos.filter((m) => f === "todos" || (f === "sin" ? !m.empresa : m.empresa === f)).length;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Consumos ({movimientos.length})</h2>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(ETIQUETA_FILTRO) as (keyof typeof ETIQUETA_FILTRO)[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${filtro === f ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}
            >
              {ETIQUETA_FILTRO[f]} ({cantidad(f)})
            </button>
          ))}
        </div>
      </div>
      {editable && (
        <p className="text-xs text-stone-500">
          Lo que asignás se recuerda: en los próximos resúmenes ese comercio ya viene asignado (salvo que lo hayas usado para las dos empresas).
        </p>
      )}
      <MensajeAviso aviso={aviso} onAviso={setAviso} />
      <datalist id="detalles-tarjeta">
        {detalles.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Descripción</th>
              <th className="px-3 py-2 text-right">Pesos</th>
              <th className="px-3 py-2 text-right">Dólares</th>
              <th className="px-3 py-2">Empresa</th>
              <th className="px-3 py-2">Detalle</th>
              {editable && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-stone-500">No hay consumos.</td>
              </tr>
            )}
            {visibles.map((m) => (
              <FilaConsumo key={`${m.id}-${m.detalle}`} m={m} editable={editable} onAviso={setAviso} />
            ))}
          </tbody>
        </table>
      </div>
      {editable && <AgregarRenglon resumenId={resumenId} />}
    </section>
  );
}

function FilaConsumo({ m, editable, onAviso }: { m: MovimientoTarjeta; editable: boolean; onAviso: (a: Aviso) => void }) {
  const [pendiente, iniciar] = useTransition();
  const [detalle, setDetalle] = useState(m.detalle ?? "");
  const guardar = (cambios: { empresa?: Empresa | null; detalle?: string | null; tipo?: TipoMovimiento }) =>
    iniciar(async () => {
      const r = await asignarMovimiento(m.id, cambios);
      if (r.error) onAviso({ tipo: "error", texto: r.error });
      else if (r.iguales && cambios.empresa)
        onAviso({
          tipo: "ok",
          texto: `Hay ${r.iguales} consumo${r.iguales === 1 ? "" : "s"} más de ${m.descripcion.split(/[s*]/)[0]} sin asignar.${r.ambigua ? " (Este comercio ya se usó para las dos empresas.)" : ""}`,
          accion: { etiqueta: `Asignarlos a ${NOMBRE_EMPRESA[cambios.empresa]}`, ejecutar: () => asignarIguales(m.id) },
        });
      else if (r.ambigua) onAviso({ tipo: "ok", texto: "Este comercio ya se usó para las dos empresas: en los próximos resúmenes se va a elegir a mano." });
      else onAviso(null);
    });
  return (
    <tr className={`hover:bg-stone-50 ${pendiente ? "opacity-60" : ""} ${!m.empresa ? "bg-amber-50/50" : ""}`}>
      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-stone-600">{m.fecha ? formatoFecha(m.fecha) : "—"}</td>
      <td className="px-3 py-1.5">
        {m.descripcion}
        {m.cuotas && <span className="ml-1 text-xs text-stone-500">(cuota {m.cuota}/{m.cuotas})</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{m.pesos ? formatoPesos(m.pesos) : ""}</td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{m.dolares ? formatoDolares(m.dolares) : ""}</td>
      <td className="px-3 py-1.5">
        {editable ? (
          <select
            aria-label="Empresa"
            value={m.empresa ?? ""}
            disabled={pendiente}
            onChange={(e) => guardar({ empresa: (e.target.value || null) as Empresa | null })}
            className={`campo w-32 py-1 text-sm ${!m.empresa ? "border-amber-400" : ""}`}
          >
            <option value="">Sin asignar</option>
            {EMPRESAS.map((e) => (
              <option key={e} value={e}>{NOMBRE_EMPRESA[e]}</option>
            ))}
          </select>
        ) : m.empresa ? (
          NOMBRE_EMPRESA[m.empresa]
        ) : (
          <span className="text-amber-700">Sin asignar</span>
        )}
      </td>
      <td className="px-3 py-1.5">
        {editable ? (
          <input
            aria-label="Detalle"
            list="detalles-tarjeta"
            value={detalle}
            disabled={pendiente}
            maxLength={60}
            onChange={(e) => setDetalle(e.target.value.toUpperCase())}
            onBlur={() => detalle !== (m.detalle ?? "") && guardar({ detalle: detalle.trim() || null })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="campo w-36 py-1 text-sm"
            placeholder="Ej: FACEBOOK"
          />
        ) : (
          (m.detalle ?? "—")
        )}
      </td>
      {editable && (
        <td className="whitespace-nowrap px-3 py-1.5 text-right">
          <select
            aria-label="Tipo de renglón"
            title="Si la lectura lo tomó mal, cambiá el tipo"
            value={m.tipo}
            disabled={pendiente}
            onChange={(e) => guardar({ tipo: e.target.value as TipoMovimiento })}
            className="mr-2 rounded border border-stone-200 bg-transparent px-1 py-0.5 text-xs text-stone-500"
          >
            <option value="consumo">Consumo</option>
            <option value="cargo">Cargo</option>
            <option value="pago">Pago</option>
          </select>
          <BotonBorrar id={m.id} onAviso={onAviso} />
        </td>
      )}
    </tr>
  );
}

function BotonBorrar({ id, onAviso }: { id: string; onAviso: (a: Aviso) => void }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => {
        if (!confirm("¿Borrar este renglón?")) return;
        iniciar(async () => {
          const r = await borrarMovimiento(id);
          if (r.error) onAviso({ tipo: "error", texto: r.error });
        });
      }}
      className="text-xs text-red-700 hover:underline"
    >
      Borrar
    </button>
  );
}

export function TablaCargos({ resumenId, movimientos, cotizacion, editable }: { resumenId: string; movimientos: MovimientoTarjeta[]; cotizacion: number | null; editable: boolean }) {
  const [aviso, setAviso] = useState<Aviso>(null);
  const [reparto, setReparto] = useState("50");
  const [pendiente, iniciar] = useTransition();
  const enPesos = (m: MovimientoTarjeta) => m.pesos + m.dolares * (cotizacion ?? 0);
  const totalNero = movimientos.reduce((s, m) => s + (enPesos(m) * m.reparto_nero) / 100, 0);
  const total = movimientos.reduce((s, m) => s + enPesos(m), 0);
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-semibold">Impuestos, cargos e intereses ({movimientos.length})</h2>
        {editable && movimientos.length > 0 && (
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="reparto" className="etiqueta text-xs">% de {NOMBRE_EMPRESA.nero} para todos</label>
              <input id="reparto" inputMode="decimal" value={reparto} onChange={(e) => setReparto(e.target.value)} className="campo w-20 py-1 text-sm" />
            </div>
            <button
              type="button"
              disabled={pendiente}
              className="boton-secundario"
              onClick={() =>
                iniciar(async () => {
                  const n = leerNumero(reparto);
                  if (n === null || Number.isNaN(n) || n < 0 || n > 100) {
                    setAviso({ tipo: "error", texto: "El reparto va de 0 a 100" });
                    return;
                  }
                  const r = await repartirCargos(resumenId, n);
                  setAviso(r.error ? { tipo: "error", texto: r.error } : null);
                })
              }
            >
              Aplicar
            </button>
          </div>
        )}
      </div>
      <MensajeAviso aviso={aviso} />
      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Descripción</th>
              <th className="px-3 py-2 text-right">Importe</th>
              <th className="px-3 py-2 text-right">% {NOMBRE_EMPRESA.nero}</th>
              <th className="px-3 py-2 text-right">{NOMBRE_EMPRESA.nero}</th>
              <th className="px-3 py-2 text-right">{NOMBRE_EMPRESA.ruta}</th>
              {editable && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {movimientos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-stone-500">No hay impuestos ni cargos.</td>
              </tr>
            )}
            {movimientos.map((m) => (
              <FilaCargo key={`${m.id}-${m.reparto_nero}`} m={m} enPesos={enPesos(m)} editable={editable} onAviso={setAviso} />
            ))}
          </tbody>
          {movimientos.length > 0 && (
            <tfoot className="border-t border-stone-200 bg-stone-50 font-semibold">
              <tr>
                <td className="px-3 py-2">Total</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatoPesos(total)}</td>
                <td />
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatoPesos(totalNero)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatoPesos(total - totalNero)}</td>
                {editable && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

function FilaCargo({ m, enPesos, editable, onAviso }: { m: MovimientoTarjeta; enPesos: number; editable: boolean; onAviso: (a: Aviso) => void }) {
  const [pendiente, iniciar] = useTransition();
  const [reparto, setReparto] = useState(String(m.reparto_nero));
  const nero = (enPesos * m.reparto_nero) / 100;
  const guardar = (cambios: { reparto_nero?: number; tipo?: TipoMovimiento }) =>
    iniciar(async () => {
      const r = await asignarMovimiento(m.id, cambios);
      onAviso(r.error ? { tipo: "error", texto: r.error } : null);
    });
  return (
    <tr className={pendiente ? "opacity-60" : ""}>
      <td className="px-3 py-1.5">
        {m.descripcion}
        {m.fecha && <span className="ml-1 text-xs text-stone-500">{formatoFecha(m.fecha)}</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">
        {m.pesos ? formatoPesos(m.pesos) : ""}
        {m.dolares ? ` ${formatoDolares(m.dolares)}` : ""}
      </td>
      <td className="px-3 py-1.5 text-right">
        {editable ? (
          <input
            aria-label={`% de ${NOMBRE_EMPRESA.nero}`}
            inputMode="decimal"
            value={reparto}
            disabled={pendiente}
            onChange={(e) => setReparto(e.target.value)}
            onBlur={() => {
              const n = leerNumero(reparto);
              if (n === null || Number.isNaN(n) || n < 0 || n > 100) {
                setReparto(String(m.reparto_nero));
                onAviso({ tipo: "error", texto: "El reparto va de 0 a 100" });
              } else if (n !== m.reparto_nero) guardar({ reparto_nero: n });
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="campo w-16 py-1 text-right text-sm"
          />
        ) : (
          `${m.reparto_nero}%`
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{formatoPesos(nero)}</td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{formatoPesos(enPesos - nero)}</td>
      {editable && (
        <td className="whitespace-nowrap px-3 py-1.5 text-right">
          <select
            aria-label="Tipo de renglón"
            value={m.tipo}
            disabled={pendiente}
            onChange={(e) => guardar({ tipo: e.target.value as TipoMovimiento })}
            className="mr-2 rounded border border-stone-200 bg-transparent px-1 py-0.5 text-xs text-stone-500"
          >
            <option value="consumo">Consumo</option>
            <option value="cargo">Cargo</option>
            <option value="pago">Pago</option>
          </select>
          <BotonBorrar id={m.id} onAviso={onAviso} />
        </td>
      )}
    </tr>
  );
}

export function TablaPagos({ movimientos, editable }: { resumenId: string; movimientos: MovimientoTarjeta[]; editable: boolean }) {
  const [aviso, setAviso] = useState<Aviso>(null);
  if (!movimientos.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Pagos y créditos ({movimientos.length})</h2>
      <p className="text-xs text-stone-500">Los pagos del resumen anterior y las devoluciones: se usan para el control de saldos, no se reparten.</p>
      <MensajeAviso aviso={aviso} />
      <div className="tarjeta overflow-x-auto p-0">
        <table className="tabla-movil w-full text-sm">
          <tbody className="divide-y divide-stone-100">
            {movimientos.map((m) => (
              <FilaPago key={m.id} m={m} editable={editable} onAviso={setAviso} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FilaPago({ m, editable, onAviso }: { m: MovimientoTarjeta; editable: boolean; onAviso: (a: Aviso) => void }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <tr className={pendiente ? "opacity-60" : ""}>
      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-stone-600">{m.fecha ? formatoFecha(m.fecha) : "—"}</td>
      <td className="px-3 py-1.5">{m.descripcion}</td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">
        {m.pesos ? formatoPesos(m.pesos) : ""}
        {m.dolares ? ` ${formatoDolares(m.dolares)}` : ""}
      </td>
      {editable && (
        <td className="whitespace-nowrap px-3 py-1.5 text-right">
          <select
            aria-label="Tipo de renglón"
            value={m.tipo}
            disabled={pendiente}
            onChange={(e) =>
              iniciar(async () => {
                const r = await asignarMovimiento(m.id, { tipo: e.target.value as TipoMovimiento });
                onAviso(r.error ? { tipo: "error", texto: r.error } : null);
              })
            }
            className="mr-2 rounded border border-stone-200 bg-transparent px-1 py-0.5 text-xs text-stone-500"
          >
            <option value="consumo">Consumo</option>
            <option value="cargo">Cargo</option>
            <option value="pago">Pago</option>
          </select>
          <BotonBorrar id={m.id} onAviso={onAviso} />
        </td>
      )}
    </tr>
  );
}

function AgregarRenglon({ resumenId }: { resumenId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<Aviso>(null);
  const [f, setF] = useState({ fecha: "", descripcion: "", pesos: "", dolares: "", tipo: "consumo" as TipoMovimiento });
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="text-sm text-stone-600 underline decoration-stone-300 hover:text-stone-900">
        + Agregar un renglón que no se leyó
      </button>
    );
  }
  const agregar = () =>
    iniciar(async () => {
      const pesos = leerNumero(f.pesos.replace("-", "")) ?? 0;
      const dolares = leerNumero(f.dolares.replace("-", "")) ?? 0;
      if (Number.isNaN(pesos) || Number.isNaN(dolares)) {
        setAviso({ tipo: "error", texto: "Importe inválido" });
        return;
      }
      const signo = f.tipo === "pago" ? -1 : 1;
      const r = await agregarMovimiento(resumenId, {
        fecha: f.fecha || null,
        descripcion: f.descripcion.trim(),
        cupon: null,
        cuota: null,
        cuotas: null,
        pesos: signo * pesos,
        dolares: signo * dolares,
        tipo: f.tipo,
      });
      if (r.error) setAviso({ tipo: "error", texto: r.error });
      else {
        setAviso({ tipo: "ok", texto: "Renglón agregado" });
        setF({ fecha: "", descripcion: "", pesos: "", dolares: "", tipo: f.tipo });
      }
    });
  return (
    <div className="tarjeta space-y-2">
      <div className="grid gap-2 sm:grid-cols-6">
        <input type="date" aria-label="Fecha" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} className="campo" />
        <input aria-label="Descripción" placeholder="Descripción" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className="campo sm:col-span-2" />
        <input aria-label="Pesos" inputMode="decimal" placeholder="Pesos" value={f.pesos} onChange={(e) => setF({ ...f, pesos: e.target.value })} className="campo" />
        <input aria-label="Dólares" inputMode="decimal" placeholder="Dólares" value={f.dolares} onChange={(e) => setF({ ...f, dolares: e.target.value })} className="campo" />
        <select aria-label="Tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoMovimiento })} className="campo">
          <option value="consumo">Consumo</option>
          <option value="cargo">Impuesto/cargo</option>
          <option value="pago">Pago/crédito</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={agregar} disabled={pendiente} className="boton">{pendiente ? "Agregando…" : "Agregar"}</button>
        <button type="button" onClick={() => setAbierto(false)} className="boton-secundario">Cerrar</button>
      </div>
      <MensajeAviso aviso={aviso} />
    </div>
  );
}

export function PaseFinanciero({
  resumen,
  totales,
  categorias,
}: {
  resumen: { id: string; vencimiento: string | null; fecha_cierre: string; financiero_en: string | null; transacciones: number };
  totales: Totales;
  categorias: { id: string; nombre: string }[];
}) {
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<Aviso>(null);
  const sugerida = categorias.find((c) => /tarjeta/i.test(c.nombre))?.id ?? "";
  const [fecha, setFecha] = useState(resumen.vencimiento ?? resumen.fecha_cierre);
  const [catNero, setCatNero] = useState(sugerida);
  const [catRuta, setCatRuta] = useState(sugerida);

  if (resumen.financiero_en) {
    return (
      <section className="tarjeta space-y-2">
        <h2 className="font-semibold">Financiero</h2>
        <p className="text-sm text-stone-600">
          Pasado el {formatoFecha(resumen.financiero_en.slice(0, 10))}: {resumen.transacciones} movimiento{resumen.transacciones === 1 ? "" : "s"} pendiente
          {resumen.transacciones === 1 ? "" : "s"} con medio de pago tarjeta. Para cambiar algo del resumen, primero deshacé el pase.
        </p>
        <button
          type="button"
          disabled={pendiente}
          className="boton-secundario"
          onClick={() => {
            if (!confirm("¿Sacar de Financiero los movimientos creados desde este resumen?")) return;
            iniciar(async () => {
              const r = await deshacerPase(resumen.id);
              setAviso(r.error ? { tipo: "error", texto: r.error } : { tipo: "ok", texto: "Se sacaron de Financiero" });
            });
          }}
        >
          Deshacer el pase
        </button>
        <MensajeAviso aviso={aviso} />
      </section>
    );
  }

  const bloqueos = [
    totales.consumos.sin.cantidad ? `Faltan asignar ${totales.consumos.sin.cantidad} consumos.` : null,
    totales.faltaCotizacion ? "Falta la cotización del dólar." : null,
  ].filter(Boolean);

  return (
    <section className="tarjeta space-y-3">
      <h2 className="font-semibold">Pasar a Financiero</h2>
      <p className="text-sm text-stone-600">
        Se crea un egreso pendiente por empresa (medio de pago tarjeta) con sus consumos y su parte de los cargos. Nada se carga hasta que confirmes.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="fecha-pase" className="etiqueta">Fecha (vencimiento)</label>
          <input id="fecha-pase" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo" />
        </div>
        {EMPRESAS.map((e) =>
          totales.empresa[e] > 0 ? (
            <div key={e}>
              <label htmlFor={`cat-${e}`} className="etiqueta">
                Categoría {NOMBRE_EMPRESA[e]} · {formatoPesos(totales.empresa[e])}
              </label>
              <select id={`cat-${e}`} value={e === "nero" ? catNero : catRuta} onChange={(ev) => (e === "nero" ? setCatNero : setCatRuta)(ev.target.value)} className="campo">
                <option value="">Elegí…</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
          ) : null,
        )}
      </div>
      {bloqueos.length > 0 && <p className="alerta-error">{bloqueos.join(" ")}</p>}
      <button
        type="button"
        disabled={pendiente || bloqueos.length > 0 || !fecha}
        className="boton"
        onClick={() => {
          const resumenTexto = EMPRESAS.filter((e) => totales.empresa[e] > 0)
            .map((e) => `${NOMBRE_EMPRESA[e]}: ${formatoPesos(totales.empresa[e])}`)
            .join("\n");
          if (!confirm(`¿Crear estos egresos pendientes en Financiero?\n\n${resumenTexto}`)) return;
          iniciar(async () => {
            const r = await pasarAFinanciero(resumen.id, { fecha, categoria_nero: catNero || null, categoria_ruta: catRuta || null });
            setAviso(r.error ? { tipo: "error", texto: r.error } : { tipo: "ok", texto: r.ok ?? "Listo" });
          });
        }}
      >
        {pendiente ? "Pasando…" : "Confirmar y pasar a Financiero"}
      </button>
      <MensajeAviso aviso={aviso} />
    </section>
  );
}
