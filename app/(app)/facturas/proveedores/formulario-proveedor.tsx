"use client";

import { useActionState, useTransition } from "react";
import { borrarProveedor, guardarProveedor } from "@/lib/facturas/proveedores";

export type Proveedor = {
  id: string;
  cuit: string | null;
  razon_social: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  alias_cbu: string | null;
  notas: string | null;
  activo: boolean;
};

/** Alta (sin proveedor) o edición de un proveedor. */
export function FormularioProveedor({ proveedor }: { proveedor?: Proveedor }) {
  const [estado, accion, enviando] = useActionState(guardarProveedor.bind(null, proveedor?.id ?? null), {});
  const v = (campo: keyof Proveedor) => estado.valores?.[campo] ?? ((proveedor?.[campo] as string | null | undefined) ?? "");
  const id = (campo: string) => `${campo}-${proveedor?.id ?? "nuevo"}`;
  return (
    <form action={accion} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label htmlFor={id("razon_social")} className="etiqueta">Razón social</label>
          <input id={id("razon_social")} name="razon_social" required maxLength={200} defaultValue={v("razon_social")} className="campo" />
        </div>
        <div>
          <label htmlFor={id("cuit")} className="etiqueta">CUIT</label>
          <input id={id("cuit")} name="cuit" inputMode="numeric" maxLength={13} defaultValue={v("cuit")} className="campo font-mono" />
        </div>
        <div>
          <label htmlFor={id("alias_cbu")} className="etiqueta">Alias o CBU</label>
          <input id={id("alias_cbu")} name="alias_cbu" maxLength={60} defaultValue={v("alias_cbu")} className="campo font-mono" />
        </div>
        <div>
          <label htmlFor={id("contacto")} className="etiqueta">Contacto</label>
          <input id={id("contacto")} name="contacto" maxLength={120} defaultValue={v("contacto")} className="campo" />
        </div>
        <div>
          <label htmlFor={id("telefono")} className="etiqueta">Teléfono</label>
          <input id={id("telefono")} name="telefono" type="tel" maxLength={40} defaultValue={v("telefono")} className="campo" />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor={id("email")} className="etiqueta">Email</label>
          <input id={id("email")} name="email" type="email" maxLength={120} defaultValue={v("email")} className="campo" />
        </div>
        <div className="lg:col-span-4">
          <label htmlFor={id("notas")} className="etiqueta">Notas</label>
          <input id={id("notas")} name="notas" maxLength={1000} defaultValue={v("notas")} className="campo" />
        </div>
      </div>
      {estado.error && <p className="alerta-error">{estado.error}</p>}
      {estado.ok && <p className="text-sm text-green-700">{estado.ok}</p>}
      <button type="submit" disabled={enviando} className={proveedor ? "boton-secundario" : "boton"}>
        {enviando ? "Guardando…" : proveedor ? "Guardar cambios" : "Agregar proveedor"}
      </button>
    </form>
  );
}

export function BotonBorrarProveedor({ id, nombre }: { id: string; nombre: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      className="text-red-700 hover:underline disabled:opacity-50"
      onClick={() => {
        if (!window.confirm(`¿Borrar a ${nombre} de Proveedores? Sus facturas no se borran.`)) return;
        iniciar(async () => {
          const r = await borrarProveedor(id);
          if (r.error) window.alert(r.error);
        });
      }}
    >
      Borrar proveedor
    </button>
  );
}
