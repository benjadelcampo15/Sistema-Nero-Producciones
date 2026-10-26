"use client";

import { useActionState, useState, useTransition } from "react";
import { agregarConvocados, cambiarConvocado, guardarPoliza, marcarTodos, quitarConvocado, verPoliza } from "@/lib/empleados/acciones";
import type { Convocado, Poliza } from "@/lib/empleados/consultas";
import { ESTADOS_SEGURO, nombreCompleto, type EstadoSeguro, type Persona } from "@/lib/empleados/tipos";

const COLOR_SEGURO: Record<EstadoSeguro, string> = {
  pendiente: "border-stone-300 bg-white",
  solicitado: "border-amber-300 bg-amber-50 text-amber-900",
  cubierto: "border-green-300 bg-green-50 text-green-800",
};

function useAccion() {
  const [pendiente, iniciar] = useTransition();
  const ejecutar = (accion: () => Promise<{ error?: string }>) =>
    iniciar(async () => {
      const r = await accion();
      if (r.error) window.alert(r.error);
    });
  return { pendiente, ejecutar };
}

export function FilaConvocado({ convocado: c, polizas, editable }: { convocado: Convocado; polizas: Poliza[]; editable: boolean }) {
  const { pendiente, ejecutar } = useAccion();
  const poliza = polizas.find((p) => p.id === c.poliza_id);
  return (
    <tr className={pendiente ? "opacity-60" : ""}>
      <td className="px-4 py-2 font-medium">{nombreCompleto(c.persona)}</td>
      <td className="px-4 py-2 font-mono text-xs text-stone-600">
        {c.persona.dni}
        {c.persona.cuil && <span className="block">{c.persona.cuil}</span>}
      </td>
      <td className="px-4 py-2">
        {editable ? (
          <input
            defaultValue={c.puesto ?? ""}
            aria-label={`Puesto de ${nombreCompleto(c.persona)}`}
            placeholder="Barra, seguridad…"
            maxLength={80}
            onBlur={(e) => e.target.value !== (c.puesto ?? "") && ejecutar(() => cambiarConvocado(c.id, { puesto: e.target.value }))}
            className="campo py-1 text-sm"
          />
        ) : (
          (c.puesto ?? "—")
        )}
      </td>
      <td className="px-4 py-2">
        {editable ? (
          <select
            value={c.seguro}
            aria-label={`Seguro de ${nombreCompleto(c.persona)}`}
            onChange={(e) =>
              ejecutar(() =>
                cambiarConvocado(c.id, {
                  seguro: e.target.value as EstadoSeguro,
                  // Al marcarlo cubierto se asocia a la única póliza, si hay una sola.
                  ...(e.target.value === "cubierto" && polizas.length === 1 ? { poliza_id: polizas[0].id } : {}),
                }),
              )
            }
            className={`rounded-md border px-2 py-1 text-xs font-medium ${COLOR_SEGURO[c.seguro]}`}
          >
            {ESTADOS_SEGURO.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        ) : (
          ESTADOS_SEGURO.find((e) => e.id === c.seguro)?.nombre
        )}
        {poliza && c.seguro === "cubierto" && <span className="block text-xs text-stone-500">{poliza.aseguradora}{poliza.numero ? ` N° ${poliza.numero}` : ""}</span>}
      </td>
      {editable && (
        <td className="px-4 py-2 text-right">
          <button
            type="button"
            onClick={() => window.confirm(`¿Quitar a ${nombreCompleto(c.persona)} de este evento?`) && ejecutar(() => quitarConvocado(c.id))}
            className="text-xs text-red-700 hover:underline"
          >
            Quitar
          </button>
        </td>
      )}
    </tr>
  );
}

/** Buscar empleados y sumarlos al evento (varios a la vez). */
export function AgregarPersonal({ eventoId, personal }: { eventoId: string; personal: Persona[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const { pendiente, ejecutar } = useAccion();
  const texto = busqueda.trim().toLowerCase();
  const visibles = (texto ? personal.filter((p) => `${p.nombre} ${p.apellido} ${p.dni}`.toLowerCase().includes(texto)) : personal).slice(0, 60);
  const alternar = (id: string) =>
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  if (!personal.length) return <p className="text-sm text-stone-500">Todo el personal cargado ya está en este evento.</p>;
  return (
    <details className="tarjeta">
      <summary className="cursor-pointer font-semibold">+ Agregar personal al evento</summary>
      <div className="mt-3 space-y-3">
        <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o DNI" aria-label="Buscar personal" className="campo" />
        <div className="max-h-72 overflow-y-auto rounded-md border border-stone-200">
          {visibles.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 border-b border-stone-100 px-3 py-2 text-sm last:border-0 hover:bg-stone-50">
              <input type="checkbox" checked={elegidos.has(p.id)} onChange={() => alternar(p.id)} />
              <span className="flex-1">{nombreCompleto(p)}</span>
              <span className="font-mono text-xs text-stone-500">{p.dni}</span>
            </label>
          ))}
          {!visibles.length && <p className="p-3 text-sm text-stone-500">No hay coincidencias.</p>}
        </div>
        <button
          type="button"
          disabled={pendiente || !elegidos.size}
          onClick={() =>
            ejecutar(async () => {
              const r = await agregarConvocados(eventoId, [...elegidos]);
              if (!r.error) setElegidos(new Set());
              return r;
            })
          }
          className="boton"
        >
          {pendiente ? "Agregando…" : `Agregar ${elegidos.size || ""} al evento`}
        </button>
      </div>
    </details>
  );
}

export function MarcarTodos({ eventoId, polizas }: { eventoId: string; polizas: Poliza[] }) {
  const { pendiente, ejecutar } = useAccion();
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <button type="button" disabled={pendiente} onClick={() => ejecutar(() => marcarTodos(eventoId, "solicitado", null))} className="boton-secundario text-xs">
        Marcar todos solicitados
      </button>
      <button
        type="button"
        disabled={pendiente || !polizas.length}
        title={polizas.length ? undefined : "Primero cargá la póliza"}
        onClick={() => ejecutar(() => marcarTodos(eventoId, "cubierto", polizas.at(-1)?.id ?? null))}
        className="boton-secundario text-xs"
      >
        Marcar todos cubiertos
      </button>
    </div>
  );
}

export function FormularioPoliza({ eventoId }: { eventoId: string }) {
  const [estado, accion, enviando] = useActionState(guardarPoliza.bind(null, eventoId), {});
  const v = (campo: string) => estado.valores?.[campo] ?? "";
  return (
    <form action={accion} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="aseguradora" className="etiqueta">Aseguradora</label>
          <input id="aseguradora" name="aseguradora" required maxLength={100} defaultValue={v("aseguradora")} className="campo" />
        </div>
        <div>
          <label htmlFor="numero" className="etiqueta">N° de póliza</label>
          <input id="numero" name="numero" maxLength={60} defaultValue={v("numero")} className="campo font-mono" />
        </div>
        <div>
          <label htmlFor="vigencia_desde" className="etiqueta">Vigencia desde</label>
          <input id="vigencia_desde" name="vigencia_desde" type="date" defaultValue={v("vigencia_desde")} className="campo" />
        </div>
        <div>
          <label htmlFor="vigencia_hasta" className="etiqueta">Vigencia hasta</label>
          <input id="vigencia_hasta" name="vigencia_hasta" type="date" defaultValue={v("vigencia_hasta")} className="campo" />
        </div>
      </div>
      <div>
        <label htmlFor="archivo" className="etiqueta">Póliza (PDF o foto)</label>
        <input id="archivo" name="archivo" type="file" accept="application/pdf,image/jpeg,image/png" className="block text-sm" />
      </div>
      {estado.error && <p className="alerta-error">{estado.error}</p>}
      {estado.ok && <p className="text-sm text-green-700">{estado.ok}</p>}
      <button type="submit" disabled={enviando} className="boton">{enviando ? "Guardando…" : "Guardar póliza"}</button>
    </form>
  );
}

export function VerPoliza({ path }: { path: string }) {
  const { pendiente, ejecutar } = useAccion();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        ejecutar(async () => {
          const r = await verPoliza(path);
          if (r.url) window.open(r.url, "_blank", "noopener");
          return r;
        })
      }
      className="text-xs font-medium underline"
    >
      Ver póliza
    </button>
  );
}
