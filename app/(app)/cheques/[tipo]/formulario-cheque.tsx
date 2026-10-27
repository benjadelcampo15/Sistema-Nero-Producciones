"use client";

import { useActionState, useTransition } from "react";
import { borrarCheque, cambiarEstadoCheque, guardarCheque } from "@/lib/cheques/acciones";
import { ESTADOS, type Cheque, type EstadoCheque, type TipoCheque } from "@/lib/cheques/tipos";
import { CampoEmpresa } from "@/components/empresa";
import { leerEmpresa, type Empresa } from "@/lib/empresas";

/** Alta (sin cheque) o edición de un cheque. */
export function FormularioCheque({
  tipo,
  eventos,
  cheque,
  empresa = "nero",
}: {
  tipo: TipoCheque;
  /** Empresa de un cheque nuevo (la que se está mirando). */
  empresa?: Empresa;
  eventos: { id: string; nombre: string; fecha: string }[];
  cheque?: Cheque;
}) {
  const [estado, accion, enviando] = useActionState(guardarCheque.bind(null, cheque?.id ?? null, tipo), {});
  const v = (campo: string, inicial: string) => estado.valores?.[campo] ?? inicial;
  const montoInicial = cheque ? String(cheque.monto).replace(".", ",") : "";

  return (
    <form action={accion} className="space-y-3">
      <CampoEmpresa defecto={leerEmpresa(v("empresa", cheque?.empresa ?? empresa))} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label className="etiqueta">{tipo === "emitido" ? "A quién se le dio" : "Quién lo dio (cliente / librador)"}</label>
          <input name="contraparte" required maxLength={200} defaultValue={v("contraparte", cheque?.contraparte ?? "")} className="campo" />
        </div>
        <div>
          <label className="etiqueta">CUIT <span className="font-normal text-stone-400">(opcional)</span></label>
          <input name="cuit" inputMode="numeric" maxLength={20} defaultValue={v("cuit", cheque?.cuit ?? "")} className="campo font-mono" />
        </div>
        <div>
          <label className="etiqueta">Monto</label>
          <input name="monto" required inputMode="decimal" placeholder="0,00" defaultValue={v("monto", montoInicial)} className="campo font-mono" />
        </div>
        <div>
          <label className="etiqueta">Banco</label>
          <input name="banco" maxLength={100} defaultValue={v("banco", cheque?.banco ?? "")} className="campo" />
        </div>
        <div>
          <label className="etiqueta">Número</label>
          <input name="numero" maxLength={40} defaultValue={v("numero", cheque?.numero ?? "")} className="campo font-mono" />
        </div>
        <div>
          <label className="etiqueta">Fecha de emisión</label>
          <input name="fecha_emision" type="date" defaultValue={v("fecha_emision", cheque?.fecha_emision ?? "")} className="campo" />
        </div>
        <div>
          <label className="etiqueta">Fecha de pago</label>
          <input name="fecha_pago" type="date" required defaultValue={v("fecha_pago", cheque?.fecha_pago ?? "")} className="campo" />
        </div>
        <div className="lg:col-span-2">
          <label className="etiqueta">Evento <span className="font-normal text-stone-400">(opcional)</span></label>
          <select name="evento_id" defaultValue={v("evento_id", cheque?.evento_id ?? "")} className="campo">
            <option value="">Sin evento</option>
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label className="etiqueta">Notas</label>
          <input name="notas" maxLength={1000} defaultValue={v("notas", cheque?.notas ?? "")} className="campo" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="electronico" defaultChecked={estado.valores ? estado.valores.electronico === "on" : (cheque?.electronico ?? false)} />
        Es eCheq (cheque electrónico)
      </label>
      {estado.error && <p className="alerta-error">{estado.error}</p>}
      {estado.ok && <p className="text-sm text-green-700">{estado.ok}</p>}
      <button type="submit" disabled={enviando} className={cheque ? "boton-secundario" : "boton"}>
        {enviando ? "Guardando…" : cheque ? "Guardar cambios" : "Agregar cheque"}
      </button>
    </form>
  );
}

/** Cambiar el estado (depositado, debitado, etc.) o borrar una carga equivocada. */
export function AccionesCheque({ id, tipo, estado }: { id: string; tipo: TipoCheque; estado: EstadoCheque }) {
  const [pendiente, iniciar] = useTransition();
  const ejecutar = (accion: () => Promise<{ error?: string }>) =>
    iniciar(async () => {
      const r = await accion();
      if (r.error) window.alert(r.error);
    });

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-stone-500">Estado:</span>
      {ESTADOS[tipo].map((e) => (
        <button
          key={e.id}
          type="button"
          disabled={pendiente || e.id === estado}
          onClick={() => ejecutar(() => cambiarEstadoCheque(id, tipo, e.id))}
          className={`rounded-full border px-3 py-1 text-xs ${
            e.id === estado ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white hover:border-stone-900"
          } disabled:cursor-default`}
        >
          {e.nombre}
        </button>
      ))}
      <button
        type="button"
        disabled={pendiente}
        onClick={() => {
          if (window.confirm("¿Borrar este cheque? Usalo solo si se cargó por error.")) ejecutar(() => borrarCheque(id));
        }}
        className="ml-auto text-xs text-red-700 hover:underline"
      >
        Borrar
      </button>
    </div>
  );
}
