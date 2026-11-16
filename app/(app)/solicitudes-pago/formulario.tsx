"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearSolicitudPago, editarSolicitudPago, type DatosSolicitud } from "@/lib/pagos/acciones";
import { NOMBRE_PRIORIDAD_PAGO, type PrioridadPago, type SolicitudPago } from "@/lib/pagos/tipos";
import { EMPRESAS, NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";
import { formatoFecha } from "@/lib/formato";
import { CampoMonto } from "@/components/campo-monto";

export type Opciones = {
  proveedores: { id: string; nombre: string; alias_cbu: string | null }[];
  eventos: { id: string; nombre: string; fecha: string; empresa: string }[];
};

const nuevaClave = () => crypto.randomUUID();

/** Formulario corto: crear una solicitud o modificarla (Contabilidad también agrega su observación). */
export function FormularioSolicitud({
  opciones,
  inicial,
  contabilidad,
  alTerminar,
}: {
  opciones: Opciones;
  inicial?: SolicitudPago;
  contabilidad?: boolean;
  alTerminar: () => void;
}) {
  const router = useRouter();
  const [datos, setDatos] = useState<DatosSolicitud>({
    empresa: inicial?.empresa ?? "nero",
    proveedor_id: inicial?.proveedor_id ?? null,
    proveedor: inicial?.proveedor ?? "",
    evento_id: inicial?.evento_id ?? null,
    monto: inicial?.monto ?? 0,
    datos_bancarios: inicial?.datos_bancarios ?? "",
    prioridad: inicial?.prioridad ?? "normal",
    motivo: inicial?.motivo ?? "",
    nota_admin: inicial?.nota_admin ?? "",
  });
  // Una clave por formulario: si se envía dos veces, no se duplica.
  const [clave] = useState(nuevaClave);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cambiar = (c: Partial<DatosSolicitud>) => setDatos((d) => ({ ...d, ...c }));
  const eventos = opciones.eventos.filter((e) => e.empresa === datos.empresa);

  /** Al escribir el proveedor: si es uno cargado, se vincula y trae su alias / CBU (se puede cambiar). */
  const elegirProveedor = (texto: string) => {
    const p = opciones.proveedores.find((x) => x.nombre.toLowerCase() === texto.trim().toLowerCase());
    const anterior = opciones.proveedores.find((x) => x.id === datos.proveedor_id);
    const aliasAutomatico = !datos.datos_bancarios || datos.datos_bancarios === anterior?.alias_cbu;
    cambiar({
      proveedor: texto,
      proveedor_id: p?.id ?? null,
      ...(aliasAutomatico ? { datos_bancarios: p?.alias_cbu ?? (anterior ? "" : datos.datos_bancarios) } : {}),
    });
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!datos.proveedor.trim()) return setError("Completá el proveedor");
    if (!(datos.monto > 0)) return setError("El monto tiene que ser mayor a cero");
    if (!datos.datos_bancarios.trim()) return setError("Completá el alias o CBU");
    iniciar(async () => {
      const r = inicial ? await editarSolicitudPago(inicial.id, datos) : await crearSolicitudPago(datos, clave);
      if (r.error) return setError(r.error);
      alTerminar();
      if (!inicial && "numero" in r && r.numero) router.replace(`/solicitudes-pago?ver=${r.numero}`, { scroll: false });
    });
  };

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="etiqueta">Proveedor</span>
          <input
            value={datos.proveedor}
            onChange={(e) => elegirProveedor(e.target.value)}
            list="proveedores-solicitud"
            placeholder="Elegí uno cargado o escribilo"
            required
            maxLength={200}
            className="campo"
            autoComplete="off"
          />
          <datalist id="proveedores-solicitud">
            {opciones.proveedores.map((p) => (
              <option key={p.id} value={p.nombre} />
            ))}
          </datalist>
          <span className="mt-0.5 block text-xs text-stone-500">{datos.proveedor_id ? "Proveedor cargado en Planix" : datos.proveedor.trim() ? "Proveedor nuevo (no se crea en Planix)" : ""}</span>
        </label>

        <fieldset>
          <legend className="etiqueta">Empresa</legend>
          <div className="flex gap-2">
            {EMPRESAS.map((e) => (
              <label key={e} className={`flex-1 cursor-pointer rounded-md border px-3 py-2 text-center text-sm font-semibold ${datos.empresa === e ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}>
                <input type="radio" name="empresa" value={e} checked={datos.empresa === e} onChange={() => cambiar({ empresa: e as Empresa, evento_id: null })} className="sr-only" />
                {NOMBRE_EMPRESA[e]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="etiqueta">Evento</span>
          <select value={datos.evento_id ?? ""} onChange={(e) => cambiar({ evento_id: e.target.value || null })} className="campo">
            <option value="">Sin evento</option>
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre} · {formatoFecha(e.fecha)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="etiqueta">Monto solicitado ($)</span>
          <span className="campo flex items-center p-0">
            <CampoMonto valor={datos.monto} alCambiar={(n) => cambiar({ monto: n })} etiqueta="Monto solicitado" />
          </span>
        </label>

        <label className="block">
          <span className="etiqueta">Alias / CBU</span>
          <input value={datos.datos_bancarios} onChange={(e) => cambiar({ datos_bancarios: e.target.value })} required maxLength={300} className="campo" autoComplete="off" />
        </label>

        <fieldset className="sm:col-span-2">
          <legend className="etiqueta">Prioridad</legend>
          <div className="flex flex-wrap gap-2">
            {(["normal", "urgente", "muy_urgente"] as PrioridadPago[]).map((p) => (
              <label
                key={p}
                className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium ${
                  datos.prioridad === p ? (p === "normal" ? "border-stone-900 bg-stone-900 text-white" : p === "urgente" ? "border-amber-500 bg-amber-100 text-amber-950" : "border-red-600 bg-red-600 text-white") : "border-stone-300 bg-white"
                }`}
              >
                <input type="radio" name="prioridad" value={p} checked={datos.prioridad === p} onChange={() => cambiar({ prioridad: p })} className="sr-only" />
                {NOMBRE_PRIORIDAD_PAGO[p]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block sm:col-span-2">
          <span className="etiqueta">Motivo u observaciones (opcional)</span>
          <textarea value={datos.motivo} onChange={(e) => cambiar({ motivo: e.target.value })} rows={2} maxLength={2000} className="campo" placeholder="Ej.: el proveedor reclama el pago para seguir trabajando" />
        </label>

        {contabilidad && (
          <label className="block sm:col-span-2">
            <span className="etiqueta">Observación de Contabilidad</span>
            <textarea value={datos.nota_admin} onChange={(e) => cambiar({ nota_admin: e.target.value })} rows={2} maxLength={2000} className="campo" />
          </label>
        )}
      </div>
      {error && <p className="alerta-error">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pendiente} className="boton">
          {pendiente ? "Guardando…" : inicial ? "Guardar cambios" : "Enviar solicitud"}
        </button>
        <button type="button" onClick={alTerminar} className="boton-secundario">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Botón "+ Nueva solicitud de pago" que abre el formulario. */
export function NuevaSolicitud({ opciones }: { opciones: Opciones }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="boton px-5 py-2.5 text-base">
        + Nueva solicitud de pago
      </button>
      {abierto && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setAbierto(false)}>
          <div role="dialog" aria-modal="true" aria-label="Nueva solicitud de pago" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-lg font-semibold">Nueva solicitud de pago</h2>
            <FormularioSolicitud opciones={opciones} alTerminar={() => setAbierto(false)} />
          </div>
        </div>
      )}
    </>
  );
}
