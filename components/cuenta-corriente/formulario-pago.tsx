"use client";

import { useState, useTransition } from "react";
import { anularPago, registrarPago } from "@/lib/cuentas/acciones";
import type { ComprobanteCuenta, TipoCuenta } from "@/lib/cuentas/tipos";
import type { Empresa } from "@/lib/empresas";
import { NOMBRE_MEDIO_PAGO, type MedioPago } from "@/lib/financiero/tipos";
import { formatoFecha, formatoPesos, hoy, parsearMonto, sumar } from "@/lib/formato";

// Los cheques se cargan desde Cheques; acá van los medios directos.
const MEDIOS: MedioPago[] = ["transferencia", "efectivo", "mercado_pago", "tarjeta", "cheque", "otro"];

/** Registrar un pago (o cobro): por un monto, a los comprobantes elegidos o a los más viejos. */
export function FormularioPago({ tipo, id, empresa, comprobantes }: { tipo: TipoCuenta; id: string; empresa: Empresa; comprobantes: ComprobanteCuenta[] }) {
  const [pendiente, iniciar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [medio, setMedio] = useState<MedioPago>("transferencia");
  const [notas, setNotas] = useState("");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState<{ error?: string; ok?: string }>({});
  const abiertos = comprobantes.filter((c) => c.pendiente > 0);
  const deuda = sumar(abiertos.map((c) => c.pendiente));
  const verbo = tipo === "pago" ? "pago" : "cobro";

  function alternar(c: ComprobanteCuenta) {
    const nuevos = elegidos.includes(c.id) ? elegidos.filter((x) => x !== c.id) : [...elegidos, c.id];
    setElegidos(nuevos);
    // El monto sugerido es lo pendiente de lo elegido.
    const total = sumar(abiertos.filter((x) => nuevos.includes(x.id)).map((x) => x.pendiente));
    setMonto(total ? String(total).replace(".", ",") : "");
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setMensaje({});
    const movimientos = abiertos.filter((c) => elegidos.includes(c.id)).flatMap((c) => c.pendientes);
    iniciar(async () => {
      const r = await registrarPago({ tipo, id, empresa, fecha, monto, medio_pago: medio, notas, movimientos });
      setMensaje(r);
      if (!r.error) {
        setMonto("");
        setNotas("");
        setElegidos([]);
        setAbierto(false);
      }
    });
  }

  if (!abiertos.length) return mensaje.ok ? <p className="text-sm text-green-700">{mensaje.ok}</p> : null;
  if (!abierto) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setAbierto(true)} className="boton">
          + Registrar {verbo}
        </button>
        {mensaje.ok && <p className="text-sm text-green-700">{mensaje.ok}</p>}
      </div>
    );
  }

  const valor = parsearMonto(monto);
  return (
    <form onSubmit={guardar} className="tarjeta space-y-4">
      <h3 className="font-semibold">Registrar {verbo}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="pago_monto" className="etiqueta">Monto</label>
          <input id="pago_monto" required inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder={formatoPesos(deuda)} className="campo text-right font-mono" />
          <button type="button" onClick={() => setMonto(String(deuda).replace(".", ","))} className="mt-1 text-xs text-stone-600 underline">
            Todo lo pendiente ({formatoPesos(deuda)})
          </button>
        </div>
        <div>
          <label htmlFor="pago_fecha" className="etiqueta">Fecha</label>
          <input id="pago_fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo" />
        </div>
        <div>
          <label htmlFor="pago_medio" className="etiqueta">Medio</label>
          <select id="pago_medio" value={medio} onChange={(e) => setMedio(e.target.value as MedioPago)} className="campo">
            {MEDIOS.map((m) => (
              <option key={m} value={m}>{NOMBRE_MEDIO_PAGO[m]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pago_notas" className="etiqueta">Nota <span className="font-normal text-stone-400">(opcional)</span></label>
          <input id="pago_notas" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={300} placeholder="N° de operación, recibo…" className="campo" />
        </div>
      </div>

      <div>
        <p className="etiqueta">¿Qué {tipo === "pago" ? "paga" : "cobra"}?</p>
        <p className="mb-2 text-xs text-stone-500">Si no elegís ninguno, se imputa a los más viejos primero. Si el monto no alcanza, el último queda pagado en parte.</p>
        <div className="divide-y divide-stone-100 rounded-md border border-stone-200">
          {abiertos.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-stone-50">
              <input type="checkbox" checked={elegidos.includes(c.id)} onChange={() => alternar(c)} />
              <span className="w-20 shrink-0 text-stone-500">{c.fecha ? formatoFecha(c.fecha) : "—"}</span>
              <span className="flex-1">{c.nombre}</span>
              <span className="font-mono">{formatoPesos(c.pendiente)}</span>
            </label>
          ))}
        </div>
      </div>

      {valor !== null && valor > deuda && <p className="text-sm text-amber-700">El monto supera lo pendiente ({formatoPesos(deuda)}).</p>}
      {mensaje.error && <p className="alerta-error">{mensaje.error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendiente} className="boton">{pendiente ? "Guardando…" : `Guardar ${verbo}`}</button>
        <button type="button" onClick={() => setAbierto(false)} className="text-sm text-stone-600 hover:text-stone-900">Cancelar</button>
      </div>
    </form>
  );
}

export function BotonAnularPago({ tipo, pagoId }: { tipo: TipoCuenta; pagoId: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => {
        if (!window.confirm(`¿Anular este ${tipo}? Lo que cubría vuelve a quedar pendiente, también en Financiero.`)) return;
        iniciar(async () => {
          const r = await anularPago(tipo, pagoId);
          if (r.error) window.alert(r.error);
        });
      }}
      className="text-xs text-red-700 hover:underline disabled:opacity-50"
    >
      {pendiente ? "Anulando…" : "Anular"}
    </button>
  );
}
