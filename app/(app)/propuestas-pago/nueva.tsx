"use client";

import { useActionState, useState } from "react";
import { crearPropuesta, type EstadoFormularioPropuesta } from "@/lib/propuestas/acciones";
import { EMPRESAS, NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";

/** "+ Nueva propuesta de pagos": nombre, empresa, fecha, dinero disponible y observaciones. */
export function NuevaPropuesta({ empresa, hoy }: { empresa: Empresa; hoy: string }) {
  const [abierto, setAbierto] = useState(false);
  const [clave] = useState(() => crypto.randomUUID());
  const [estado, accion, pendiente] = useActionState<EstadoFormularioPropuesta, FormData>(crearPropuesta, {});

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="boton">
        + Nueva propuesta de pagos
      </button>
    );
  }
  return (
    <form action={accion} className="tarjeta w-full space-y-3 p-4 sm:max-w-xl">
      <input type="hidden" name="clave_envio" value={clave} />
      <h2 className="font-semibold">Nueva propuesta de pagos</h2>
      <label className="block">
        <span className="etiqueta">Nombre de la propuesta</span>
        <input name="nombre" required maxLength={200} placeholder="Ej.: Pagos semanales" className="campo" autoFocus />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="etiqueta">Empresa</span>
          <select name="empresa" defaultValue={empresa} className="campo">
            {EMPRESAS.map((e) => (
              <option key={e} value={e}>{NOMBRE_EMPRESA[e]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="etiqueta">Fecha</span>
          <input type="date" name="fecha" required defaultValue={hoy} className="campo" />
        </label>
        <label className="block">
          <span className="etiqueta">Dinero disponible</span>
          <input name="disponible" required inputMode="decimal" placeholder="10.000.000" className="campo text-right font-mono" />
        </label>
      </div>
      <label className="block">
        <span className="etiqueta">Observaciones <span className="font-normal text-stone-400">(opcional)</span></span>
        <textarea name="observaciones" rows={2} maxLength={2000} className="campo" />
      </label>
      {estado.error && <p className="alerta-error">{estado.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pendiente} className="boton">{pendiente ? "Creando…" : "Crear y agregar pagos"}</button>
        <button type="button" onClick={() => setAbierto(false)} className="boton-secundario">Cancelar</button>
      </div>
    </form>
  );
}
