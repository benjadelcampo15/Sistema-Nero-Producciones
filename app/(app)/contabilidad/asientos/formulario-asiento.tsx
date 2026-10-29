"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { borrarAsiento, guardarAsiento } from "@/lib/contabilidad/acciones";
import { EMPRESAS, NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";
import { formatoPesos, parsearMonto, sumar } from "@/lib/formato";
import type { Asiento, CuentaContable } from "@/lib/contabilidad/tipos";

type Linea = { cuenta_id: string; debe: string; haber: string; detalle: string };

const aTexto = (n: number) => (n ? String(n).replace(".", ",") : "");
const vacia = (): Linea => ({ cuenta_id: "", debe: "", haber: "", detalle: "" });

export function FormularioAsiento({ asiento, empresa, fecha, cuentas }: { asiento?: Asiento; empresa: Empresa; fecha: string; cuentas: CuentaContable[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cabecera, setCabecera] = useState({ empresa: asiento?.empresa ?? empresa, fecha: asiento?.fecha ?? fecha, descripcion: asiento?.descripcion ?? "" });
  const [lineas, setLineas] = useState<Linea[]>(
    asiento ? asiento.lineas.map((l) => ({ cuenta_id: l.cuenta_id, debe: aTexto(l.debe), haber: aTexto(l.haber), detalle: l.detalle ?? "" })) : [vacia(), vacia()],
  );

  const numero = (t: string) => (t.trim() ? parsearMonto(t) : 0);
  const debe = sumar(lineas.map((l) => numero(l.debe) ?? 0));
  const haber = sumar(lineas.map((l) => numero(l.haber) ?? 0));
  const diferencia = sumar([debe, -haber]);
  const cambiar = (i: number, cambios: Partial<Linea>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambios } : l)));
  // Vuelve al diario del mes del asiento.
  const [anio, mes] = (cabecera.fecha || fecha).split("-").map(Number);
  const finDeMes = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
  const volver = `/contabilidad?empresa=${cabecera.empresa}&desde=${finDeMes.slice(0, 7)}-01&hasta=${finDeMes}`;

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    const usadas = lineas.filter((l) => l.cuenta_id || l.debe.trim() || l.haber.trim());
    const datos = usadas.map((l) => ({ cuenta_id: l.cuenta_id, debe: numero(l.debe), haber: numero(l.haber), detalle: l.detalle.trim() || null }));
    if (datos.some((l) => l.debe === null || l.haber === null)) return setError("Hay un importe mal escrito");
    if (diferencia !== 0) return setError(`No balancea: falta ${formatoPesos(Math.abs(diferencia))} en el ${diferencia > 0 ? "haber" : "debe"}`);
    setError(null);
    iniciar(async () => {
      const r = await guardarAsiento(asiento?.id ?? null, { ...cabecera, lineas: datos.map((l) => ({ ...l, debe: l.debe ?? 0, haber: l.haber ?? 0 })) });
      if (r.error) return setError(r.error);
      router.push(volver);
    });
  }

  function borrar() {
    if (!asiento || !confirm("¿Borrar este asiento?")) return;
    iniciar(async () => {
      const r = await borrarAsiento(asiento.id);
      if (r.error) return setError(r.error);
      router.push(volver);
    });
  }

  return (
    <form onSubmit={guardar} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[auto_12rem_1fr]">
        <fieldset>
          <legend className="etiqueta">Empresa</legend>
          <div className="flex gap-4 pt-2">
            {EMPRESAS.map((e) => (
              <label key={e} className="flex items-center gap-2 text-sm">
                <input type="radio" name="empresa" checked={cabecera.empresa === e} onChange={() => setCabecera({ ...cabecera, empresa: e })} />
                {NOMBRE_EMPRESA[e]}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="fecha" className="etiqueta">Fecha</label>
          <input id="fecha" type="date" required value={cabecera.fecha} onChange={(e) => setCabecera({ ...cabecera, fecha: e.target.value })} className="campo" />
        </div>
        <div>
          <label htmlFor="descripcion" className="etiqueta">Descripción</label>
          <input
            id="descripcion"
            required
            maxLength={300}
            placeholder="Asiento de apertura, amortización de equipos…"
            value={cabecera.descripcion}
            onChange={(e) => setCabecera({ ...cabecera, descripcion: e.target.value })}
            className="campo"
          />
        </div>
      </div>

      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Cuenta</th>
              <th className="w-36 px-3 py-2 text-right">Debe</th>
              <th className="w-36 px-3 py-2 text-right">Haber</th>
              <th className="px-3 py-2">Detalle</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {lineas.map((l, i) => (
              <tr key={i}>
                <td className="px-2 py-1">
                  <select aria-label={`Cuenta de la línea ${i + 1}`} value={l.cuenta_id} onChange={(e) => cambiar(i, { cuenta_id: e.target.value })} className="campo">
                    <option value="">Elegí la cuenta…</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.codigo} · {c.nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input
                    aria-label={`Debe de la línea ${i + 1}`}
                    inputMode="decimal"
                    value={l.debe}
                    onChange={(e) => cambiar(i, { debe: e.target.value, haber: e.target.value ? "" : l.haber })}
                    className="campo text-right font-mono"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    aria-label={`Haber de la línea ${i + 1}`}
                    inputMode="decimal"
                    value={l.haber}
                    onChange={(e) => cambiar(i, { haber: e.target.value, debe: e.target.value ? "" : l.debe })}
                    className="campo text-right font-mono"
                  />
                </td>
                <td className="px-2 py-1">
                  <input aria-label={`Detalle de la línea ${i + 1}`} maxLength={200} value={l.detalle} onChange={(e) => cambiar(i, { detalle: e.target.value })} className="campo" />
                </td>
                <td className="px-2 py-1 text-center">
                  {lineas.length > 2 && (
                    <button type="button" aria-label="Quitar línea" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="text-stone-400 hover:text-red-700">
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-300 font-semibold">
            <tr>
              <td className="px-3 py-2">
                <button type="button" onClick={() => setLineas((ls) => [...ls, vacia()])} className="text-sm font-normal text-stone-600 hover:text-stone-900">
                  + Agregar línea
                </button>
              </td>
              <td className="px-3 py-2 text-right font-mono">{formatoPesos(debe)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatoPesos(haber)}</td>
              <td colSpan={2} className={`px-3 py-2 text-sm ${diferencia === 0 && debe > 0 ? "text-green-700" : "text-amber-700"}`}>
                {diferencia === 0 ? (debe > 0 ? "Balancea" : "") : `Diferencia ${formatoPesos(Math.abs(diferencia))}`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {error && <p className="alerta-error">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pendiente} className="boton">{pendiente ? "Guardando…" : asiento ? "Guardar cambios" : "Guardar asiento"}</button>
        <a href={volver} className="text-sm text-stone-600 hover:text-stone-900">Cancelar</a>
        {asiento && (
          <button type="button" onClick={borrar} disabled={pendiente} className="ml-auto text-sm text-red-700 hover:underline">Borrar asiento</button>
        )}
      </div>
    </form>
  );
}
