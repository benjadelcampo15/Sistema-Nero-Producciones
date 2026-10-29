"use client";

import { useActionState, useState, useTransition } from "react";
import { agregarConvocados, asignarPuesto, borrarPuesto, cambiarConvocado, crearPuesto, editarPuesto, guardarPoliza, marcarTodos, quitarConvocado, verPoliza } from "@/lib/empleados/acciones";
import type { Convocado, Poliza } from "@/lib/empleados/consultas";
import { COLORES_PUESTO, ESTADOS_SEGURO, colorLibre, colorSuave, nombreCompleto, type EstadoSeguro, type Persona, type Puesto } from "@/lib/empleados/tipos";

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

/** Personal del evento: puesto y seguro por persona, filtro por puesto y asignación a varios a la vez. */
export function TablaPersonal({ convocados, polizas, puestos, editable }: { convocados: Convocado[]; polizas: Poliza[]; puestos: Puesto[]; editable: boolean }) {
  const { pendiente, ejecutar } = useAccion();
  const [filtro, setFiltro] = useState<string | null>(null); // id de puesto, "sin" o null (todos)
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [puestoMasivo, setPuestoMasivo] = useState("");
  const visibles = convocados.filter((c) => filtro === null || (filtro === "sin" ? !c.puesto_id : c.puesto_id === filtro));
  const todos = visibles.length > 0 && visibles.every((c) => elegidos.has(c.id));
  const alternar = (id: string) =>
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  const sinPuesto = convocados.filter((c) => !c.puesto_id).length;

  return (
    <div className="space-y-2">
      {puestos.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setFiltro(null)}
            className={`rounded-full border px-2.5 py-1 font-medium ${filtro === null ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}
          >
            Todos ({convocados.length})
          </button>
          {puestos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setFiltro(filtro === p.id ? null : p.id)}
              style={filtro === p.id ? { backgroundColor: p.color, borderColor: p.color, color: "white" } : { borderColor: p.color, backgroundColor: colorSuave(p.color) }}
              className="rounded-full border px-2.5 py-1 font-medium"
            >
              {p.nombre} ({convocados.filter((c) => c.puesto_id === p.id).length})
            </button>
          ))}
          {sinPuesto > 0 && (
            <button
              type="button"
              onClick={() => setFiltro(filtro === "sin" ? null : "sin")}
              className={`rounded-full border border-dashed px-2.5 py-1 font-medium ${filtro === "sin" ? "border-stone-900 bg-stone-900 text-white" : "border-stone-400 bg-white text-stone-600"}`}
            >
              Sin puesto ({sinPuesto})
            </button>
          )}
        </div>
      )}

      {editable && elegidos.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm">
          <span className="font-medium">
            {elegidos.size} {elegidos.size === 1 ? "seleccionado" : "seleccionados"}
          </span>
          <select value={puestoMasivo} onChange={(e) => setPuestoMasivo(e.target.value)} aria-label="Puesto para los seleccionados" className="campo w-auto py-1 text-sm">
            <option value="">Elegí el puesto…</option>
            {puestos.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
            <option value="sin">Sin puesto</option>
          </select>
          <button
            type="button"
            disabled={pendiente || !puestoMasivo}
            onClick={() =>
              ejecutar(async () => {
                const r = await asignarPuesto([...elegidos], puestoMasivo === "sin" ? null : puestoMasivo);
                if (!r.error) {
                  setElegidos(new Set());
                  setPuestoMasivo("");
                }
                return r;
              })
            }
            className="boton py-1"
          >
            Asignar
          </button>
          <button type="button" onClick={() => setElegidos(new Set())} className="text-xs text-stone-600 hover:text-stone-900">Cancelar</button>
        </div>
      )}

      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              {editable && (
                <th className="w-8 py-3 pl-4">
                  <input type="checkbox" checked={todos} aria-label="Seleccionar todos" onChange={() => setElegidos(todos ? new Set() : new Set(visibles.map((c) => c.id)))} />
                </th>
              )}
              <th className="px-4 py-3">Persona</th>
              <th className="px-4 py-3">DNI / CUIL</th>
              <th className="px-4 py-3">Puesto</th>
              <th className="px-4 py-3">Seguro</th>
              {editable && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {visibles.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-stone-500">
                  {convocados.length ? "No hay nadie en este puesto." : "Todavía no hay personal en este evento."}
                </td>
              </tr>
            )}
            {visibles.map((c) => (
              <FilaConvocado key={c.id} convocado={c} polizas={polizas} puestos={puestos} editable={editable} elegido={elegidos.has(c.id)} alternar={() => alternar(c.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaConvocado({
  convocado: c,
  polizas,
  puestos,
  editable,
  elegido,
  alternar,
}: {
  convocado: Convocado;
  polizas: Poliza[];
  puestos: Puesto[];
  editable: boolean;
  elegido: boolean;
  alternar: () => void;
}) {
  const { pendiente, ejecutar } = useAccion();
  const poliza = polizas.find((p) => p.id === c.poliza_id);
  const puesto = puestos.find((p) => p.id === c.puesto_id);
  return (
    <tr className={pendiente ? "opacity-60" : ""} style={puesto ? { boxShadow: `inset 4px 0 0 ${puesto.color}` } : undefined}>
      {editable && (
        <td className="py-2 pl-4">
          <input type="checkbox" checked={elegido} onChange={alternar} aria-label={`Seleccionar a ${nombreCompleto(c.persona)}`} />
        </td>
      )}
      <td className="px-4 py-2 font-medium">{nombreCompleto(c.persona)}</td>
      <td className="px-4 py-2 font-mono text-xs text-stone-600">
        {c.persona.dni}
        {c.persona.cuil && <span className="block">{c.persona.cuil}</span>}
      </td>
      <td className="px-4 py-2">
        {editable ? (
          <select
            value={c.puesto_id ?? ""}
            aria-label={`Puesto de ${nombreCompleto(c.persona)}`}
            onChange={(e) => ejecutar(() => cambiarConvocado(c.id, { puesto_id: e.target.value || null }))}
            style={puesto ? { borderColor: puesto.color, backgroundColor: colorSuave(puesto.color) } : undefined}
            className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-medium"
          >
            <option value="">{puestos.length ? "Sin puesto" : "Creá los puestos arriba"}</option>
            {puestos.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        ) : puesto ? (
          <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: puesto.color }}>
            {puesto.nombre}
          </span>
        ) : (
          "—"
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
        {poliza && c.seguro === "cubierto" && (
          <span className="block text-xs text-stone-500">
            {poliza.aseguradora}
            {poliza.numero ? ` N° ${poliza.numero}` : ""}
          </span>
        )}
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

/** Elegir uno de los colores de los puestos. */
function SelectorColor({ valor, alElegir }: { valor: string; alElegir: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLORES_PUESTO.map((c) => (
        <button
          key={c.color}
          type="button"
          title={c.nombre}
          aria-label={c.nombre}
          aria-pressed={valor === c.color}
          onClick={() => alElegir(c.color)}
          style={{ backgroundColor: c.color }}
          className={`h-6 w-6 rounded-full ${valor === c.color ? "ring-2 ring-stone-900 ring-offset-2" : ""}`}
        />
      ))}
    </div>
  );
}

/** Los puestos de trabajo del evento: crear, renombrar, cambiar el color y borrar. */
export function PuestosEvento({ eventoId, puestos, cantidades, editable }: { eventoId: string; puestos: Puesto[]; cantidades: Record<string, number>; editable: boolean }) {
  const { pendiente, ejecutar } = useAccion();
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState<string>(colorLibre(puestos));
  const [editando, setEditando] = useState<string | null>(null);

  function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    ejecutar(async () => {
      const r = await crearPuesto(eventoId, nombre, color);
      if (!r.error) {
        setNombre("");
        // El próximo puesto arranca con otro color.
        setColor(colorLibre([...puestos, { color }]));
      }
      return r;
    });
  }

  return (
    <div className="space-y-3">
      {puestos.length === 0 && (
        <p className="text-sm text-stone-500">
          Todavía no hay puestos. {editable && "Creá los que necesites (Barra, Seguridad, Caja…) y después asignáselos a cada persona."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {puestos.map((p) =>
          editando === p.id ? (
            <EditorPuesto key={p.id} puesto={p} cantidad={cantidades[p.id] ?? 0} cerrar={() => setEditando(null)} />
          ) : (
            <button
              key={p.id}
              type="button"
              disabled={!editable}
              onClick={() => setEditando(p.id)}
              title={editable ? "Editar puesto" : undefined}
              className="flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-sm font-medium enabled:hover:shadow-sm"
              style={{ borderColor: p.color, backgroundColor: colorSuave(p.color) }}
            >
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
              {p.nombre}
              <span className="text-xs font-normal text-stone-600">{cantidades[p.id] ?? 0}</span>
            </button>
          ),
        )}
      </div>
      {editable && (
        <form onSubmit={crear} className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-stone-300 p-3">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nuevo puesto, ej. Barra" aria-label="Nombre del puesto" maxLength={60} className="campo w-56 py-1.5" />
          <SelectorColor valor={color} alElegir={setColor} />
          <button type="submit" disabled={pendiente || !nombre.trim()} className="boton py-1.5">
            + Agregar puesto
          </button>
        </form>
      )}
    </div>
  );
}

function EditorPuesto({ puesto, cantidad, cerrar }: { puesto: Puesto; cantidad: number; cerrar: () => void }) {
  const { pendiente, ejecutar } = useAccion();
  const [nombre, setNombre] = useState(puesto.nombre);
  const [color, setColor] = useState(puesto.color);
  return (
    <div className="w-full space-y-2 rounded-lg border-2 bg-white p-3 sm:w-auto" style={{ borderColor: color }}>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del puesto" maxLength={60} autoFocus className="campo py-1.5" />
      <SelectorColor valor={color} alElegir={setColor} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pendiente || !nombre.trim()}
          onClick={() =>
            ejecutar(async () => {
              const r = await editarPuesto(puesto.id, { nombre, color });
              if (!r.error) cerrar();
              return r;
            })
          }
          className="boton py-1"
        >
          Guardar
        </button>
        <button type="button" onClick={cerrar} className="text-sm text-stone-600 hover:text-stone-900">Cancelar</button>
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            window.confirm(`¿Borrar el puesto "${puesto.nombre}"?${cantidad ? ` Sus ${cantidad} personas quedan en el evento, sin puesto.` : ""}`) &&
            ejecutar(() => borrarPuesto(puesto.id))
          }
          className="ml-auto text-xs text-red-700 hover:underline"
        >
          Borrar puesto
        </button>
      </div>
    </div>
  );
}

/** Buscar empleados y sumarlos al evento (varios a la vez). */
export function AgregarPersonal({ eventoId, personal, puestos }: { eventoId: string; personal: Persona[]; puestos: Puesto[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [puesto, setPuesto] = useState("");
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
        {puestos.length > 0 && (
          <select value={puesto} onChange={(e) => setPuesto(e.target.value)} aria-label="Puesto de los que se agregan" className="campo w-auto">
            <option value="">Sin puesto (se asigna después)</option>
            {puestos.map((p) => (
              <option key={p.id} value={p.id}>Como {p.nombre}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          disabled={pendiente || !elegidos.size}
          onClick={() =>
            ejecutar(async () => {
              const r = await agregarConvocados(eventoId, [...elegidos], puesto || null);
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
