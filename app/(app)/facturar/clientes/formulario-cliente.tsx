"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarEstadoCliente, guardarCliente, type EstadoCliente } from "@/lib/clientes/acciones";
import { CONDICIONES_IVA, TIPOS_DOC } from "@/lib/facturar/tipos";
import type { Empresa } from "@/lib/empresas";
import { CampoEmpresaFicha } from "@/components/cuenta-corriente/campo-empresa";

export type ClienteEditable = {
  id: string;
  razon_social: string;
  doc_tipo: number;
  doc_nro: string;
  condicion_iva: number;
  email: string | null;
  telefono: string | null;
  domicilio: string | null;
  notas: string | null;
  empresa?: Empresa | null;
};

/** Alta (sin cliente) o edición de un cliente. */
export function FormularioCliente({ cliente }: { cliente?: ClienteEditable }) {
  const router = useRouter();
  const [estado, accion, enviando] = useActionState(async (previo: EstadoCliente, formData: FormData) => {
    const r = await guardarCliente(cliente?.id ?? null, previo, formData);
    // Un cliente nuevo se ve en su ficha.
    if (!cliente && r.id) router.push(`/facturar/clientes/${r.id}`);
    return r;
  }, {});
  const v = (campo: string, inicial: string) => estado.valores?.[campo] ?? inicial;
  const [docTipo, setDocTipo] = useState(Number(v("doc_tipo", String(cliente?.doc_tipo ?? 80))));

  return (
    <form action={accion} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label className="etiqueta">Razón social / nombre</label>
          <input name="razon_social" required maxLength={200} defaultValue={v("razon_social", cliente?.razon_social ?? "")} className="campo" />
        </div>
        <div>
          <label className="etiqueta">Documento</label>
          <select name="doc_tipo" value={docTipo} onChange={(e) => setDocTipo(Number(e.target.value))} className="campo">
            {TIPOS_DOC.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
        </div>
        {docTipo !== 99 && (
          <div>
            <label className="etiqueta">{docTipo === 80 ? "CUIT" : "DNI"}</label>
            <input name="doc_nro" required inputMode="numeric" defaultValue={v("doc_nro", cliente?.doc_nro ?? "")} className="campo font-mono" />
          </div>
        )}
        <div className="lg:col-span-2">
          <label className="etiqueta">Condición frente al IVA</label>
          <select name="condicion_iva" defaultValue={v("condicion_iva", String(cliente?.condicion_iva ?? 1))} className="campo">
            {CONDICIONES_IVA.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="etiqueta">Email</label>
          <input name="email" type="email" defaultValue={v("email", cliente?.email ?? "")} className="campo" />
        </div>
        <div>
          <label className="etiqueta">Teléfono</label>
          <input name="telefono" maxLength={40} defaultValue={v("telefono", cliente?.telefono ?? "")} className="campo" />
        </div>
        <div className="lg:col-span-2">
          <label className="etiqueta">Domicilio</label>
          <input name="domicilio" maxLength={200} defaultValue={v("domicilio", cliente?.domicilio ?? "")} className="campo" />
        </div>
        <div>
          <label className="etiqueta">Notas</label>
          <input name="notas" maxLength={1000} defaultValue={v("notas", cliente?.notas ?? "")} className="campo" />
        </div>
        <CampoEmpresaFicha id={`empresa-${cliente?.id ?? "nuevo"}`} defecto={v("empresa", cliente?.empresa ?? "")} />
      </div>
      {estado.error && <p className="alerta-error">{estado.error}</p>}
      {estado.ok && <p className="text-sm text-green-700">{estado.ok}</p>}
      <button type="submit" disabled={enviando} className={cliente ? "boton-secundario" : "boton"}>
        {enviando ? "Guardando…" : cliente ? "Guardar cambios" : "Agregar cliente"}
      </button>
    </form>
  );
}

export function BotonEstadoCliente({ id, activo }: { id: string; activo: boolean }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      className="text-xs text-stone-500 hover:text-stone-900 disabled:opacity-50"
      onClick={() =>
        iniciar(async () => {
          const r = await cambiarEstadoCliente(id, !activo);
          if (r.error) window.alert(r.error);
        })
      }
    >
      {activo ? "Desactivar" : "Activar"}
    </button>
  );
}
