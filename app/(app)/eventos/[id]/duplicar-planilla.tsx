"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { duplicarPlanilla } from "@/lib/eventos/duplicar";
import { EMPRESAS, NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";
import type { Evento } from "@/lib/eventos/tipos";

/** "Duplicar planilla": crea un evento nuevo con esta planilla como presupuesto (sin pagos ni movimientos). */
export function DuplicarPlanilla({ evento, className = "boton-secundario" }: { evento: Evento; className?: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(`${evento.nombre} (copia)`);
  const [fecha, setFecha] = useState("");
  const [lugar, setLugar] = useState(evento.lugar ?? "");
  const [empresa, setEmpresa] = useState<Empresa>(evento.empresa);
  const [estado, setEstado] = useState<"planificado" | "en_curso">("planificado");
  const [modo, setModo] = useState<"importes" | "estructura">("importes");
  // Una clave por formulario: si se toca dos veces, no se crean dos eventos.
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fecha) return setError("Elegí la fecha del evento nuevo");
    const texto =
      modo === "importes"
        ? `Se crea "${nombre}" con la planilla de "${evento.nombre}" (conceptos, proveedores e importes). Señas, cobros y pagos quedan en $0 y no se genera nada en Financiero. ¿Duplicar?`
        : `Se crea "${nombre}" con la estructura de la planilla de "${evento.nombre}" (sectores, conceptos y proveedores) e importes en $0. ¿Duplicar?`;
    if (!window.confirm(texto)) return;
    setError(null);
    iniciar(async () => {
      const r = await duplicarPlanilla(evento.id, { nombre, fecha, lugar, empresa, estado, modo }, clave);
      if (r.error || !r.id) return setError(r.error ?? "No se pudo duplicar");
      setClave(crypto.randomUUID());
      router.push(`/eventos/${r.id}`);
    });
  };

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={className}>
        ⧉ Duplicar planilla
      </button>
      {abierto && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && setAbierto(false)}>
          <form onSubmit={enviar} role="dialog" aria-modal="true" aria-label="Duplicar planilla" className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div>
              <h2 className="text-lg font-semibold">Duplicar planilla</h2>
              <p className="text-sm text-stone-600">
                Copiando de: <strong>{evento.nombre}</strong>. El evento original no se modifica.
              </p>
            </div>
            <label className="block">
              <span className="etiqueta">Nombre del evento nuevo</span>
              <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={120} className="campo" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="etiqueta">Fecha</span>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className="campo" />
              </label>
              <label className="block">
                <span className="etiqueta">Ubicación</span>
                <input value={lugar} onChange={(e) => setLugar(e.target.value)} maxLength={200} className="campo" />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <fieldset>
                <legend className="etiqueta">Empresa</legend>
                <div className="flex gap-2">
                  {EMPRESAS.map((e) => (
                    <label key={e} className={`flex-1 cursor-pointer rounded-md border px-3 py-1.5 text-center text-sm font-semibold ${empresa === e ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"}`}>
                      <input type="radio" name="empresa" checked={empresa === e} onChange={() => setEmpresa(e)} className="sr-only" />
                      {NOMBRE_EMPRESA[e]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className="etiqueta">Estado</span>
                <select value={estado} onChange={(e) => setEstado(e.target.value as "planificado" | "en_curso")} className="campo">
                  <option value="planificado">Planificado</option>
                  <option value="en_curso">En curso</option>
                </select>
              </label>
            </div>
            <fieldset className="space-y-2">
              <legend className="etiqueta">Qué copiar</legend>
              <label className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${modo === "importes" ? "border-stone-900 bg-stone-50" : "border-stone-200"}`}>
                <input type="radio" name="modo" checked={modo === "importes"} onChange={() => setModo("importes")} className="mt-0.5" />
                <span>
                  <strong>Duplicar con importes</strong>
                  <span className="block text-stone-600">Sectores, conceptos, proveedores e importes presupuestados.</span>
                </span>
              </label>
              <label className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${modo === "estructura" ? "border-stone-900 bg-stone-50" : "border-stone-200"}`}>
                <input type="radio" name="modo" checked={modo === "estructura"} onChange={() => setModo("estructura")} className="mt-0.5" />
                <span>
                  <strong>Duplicar estructura solamente</strong>
                  <span className="block text-stone-600">Sectores, conceptos y proveedores, con los importes en $0 para presupuestar de nuevo.</span>
                </span>
              </label>
            </fieldset>
            <p className="rounded-lg bg-stone-100 p-3 text-xs text-stone-600">
              No se copian pagos, señas, cobros, movimientos de Financiero ni de cuentas corrientes, facturas, cierres de caja ni liquidaciones. La planilla nueva pasa a Financiero recién cuando cierres el evento nuevo.
              {empresa !== evento.empresa && " Los proveedores que no están habilitados para la otra empresa se quitan."}
            </p>
            {error && <p className="alerta-error">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={pendiente} className="boton">
                {pendiente ? "Duplicando…" : "Duplicar"}
              </button>
              <button type="button" onClick={() => setAbierto(false)} className="boton-secundario">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
