"use client";

import { useActionState, useTransition } from "react";
import { cambiarEstadoCuenta, guardarCuenta, guardarSaldos } from "@/lib/bancos/acciones";
import { TIPOS_CUENTA, type Cuenta } from "@/lib/bancos/tipos";
import { formatoFecha } from "@/lib/formato";

/** La tabla de saldos es un formulario: se cargan todas las cuentas del día juntas. */
export function FormularioSaldos({ fecha, editable, children }: { fecha: string; editable: boolean; children: React.ReactNode }) {
  const [estado, accion, enviando] = useActionState(guardarSaldos.bind(null, fecha), {});
  if (!editable) return <>{children}</>;
  return (
    <form action={accion} key={fecha}>
      {children}
      <div className="flex flex-wrap items-center gap-3 border-t border-stone-200 px-4 py-3">
        <button type="submit" disabled={enviando} className="boton">
          {enviando ? "Guardando…" : `Guardar saldos del ${formatoFecha(fecha)}`}
        </button>
        <p className="text-xs text-stone-500">Cargá el saldo que muestra el banco al empezar el día (con “-” si está en descubierto).</p>
        {estado.error && <p className="text-sm text-red-700">{estado.error}</p>}
        {estado.ok && <p className="text-sm text-green-700">{estado.ok}</p>}
      </div>
    </form>
  );
}

export function FormularioCuenta({ cuenta }: { cuenta?: Cuenta }) {
  const [estado, accion, enviando] = useActionState(guardarCuenta.bind(null, cuenta?.id ?? null), {});
  const v = (campo: string, inicial: string) => estado.valores?.[campo] ?? inicial;
  return (
    <form action={accion} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="etiqueta" htmlFor={`nombre-${cuenta?.id ?? "nueva"}`}>Nombre</label>
          <input id={`nombre-${cuenta?.id ?? "nueva"}`} name="nombre" required maxLength={100} placeholder="Galicia CC" defaultValue={v("nombre", cuenta?.nombre ?? "")} className="campo" />
        </div>
        <div>
          <label className="etiqueta" htmlFor={`banco-${cuenta?.id ?? "nueva"}`}>Banco</label>
          <input id={`banco-${cuenta?.id ?? "nueva"}`} name="banco" maxLength={100} defaultValue={v("banco", cuenta?.banco ?? "")} className="campo" />
        </div>
        <div>
          <label className="etiqueta" htmlFor={`tipo-${cuenta?.id ?? "nueva"}`}>Tipo</label>
          <select id={`tipo-${cuenta?.id ?? "nueva"}`} name="tipo" defaultValue={v("tipo", cuenta?.tipo ?? "cuenta_corriente")} className="campo">
            {TIPOS_CUENTA.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor={`descubierto-${cuenta?.id ?? "nueva"}`}>Descubierto acordado</label>
          <input
            id={`descubierto-${cuenta?.id ?? "nueva"}`}
            name="descubierto"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={v("descubierto", cuenta?.descubierto ? String(cuenta.descubierto).replace(".", ",") : "")}
            className="campo font-mono"
          />
        </div>
      </div>
      {estado.error && <p className="alerta-error">{estado.error}</p>}
      {estado.ok && <p className="text-sm text-green-700">{estado.ok}</p>}
      <button type="submit" disabled={enviando} className={cuenta ? "boton-secundario" : "boton"}>
        {enviando ? "Guardando…" : cuenta ? "Guardar cambios" : "Agregar cuenta"}
      </button>
    </form>
  );
}

export function BotonEstadoCuenta({ id, activa }: { id: string; activa: boolean }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      className="text-xs text-stone-500 hover:text-stone-900 disabled:opacity-50"
      onClick={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await cambiarEstadoCuenta(id, !activa);
          if (r.error) window.alert(r.error);
        });
      }}
    >
      {activa ? "Desactivar" : "Activar"}
    </button>
  );
}
