"use client";

import { useActionState, useState, useTransition } from "react";
import { aplicarEnvio, configurarFormulario, descartarEnvio, guardarPersona } from "@/lib/empleados/acciones";
import { nombreCompleto, type Persona } from "@/lib/empleados/tipos";
import { formatoFecha } from "@/lib/formato";
import { CamposPersona } from "@/components/campos-persona";

/** Link del formulario público para mandarle al personal (reemplaza al Google Form). */
export function LinkFormulario({ url, abierto }: { url: string | null; abierto: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const ejecutar = (accion: "crear" | "abrir" | "cerrar" | "renovar") =>
    iniciar(async () => {
      const r = await configurarFormulario(accion);
      if (r.error) setAviso(r.error);
      else if (accion === "renovar") setAviso("Link nuevo generado: el anterior ya no funciona.");
    });

  if (!url) {
    return (
      <section className="tarjeta flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600">Creá el formulario para que el personal cargue sus datos (reemplaza al Google Form).</p>
        <button type="button" disabled={pendiente} onClick={() => ejecutar("crear")} className="boton">Crear formulario</button>
      </section>
    );
  }
  return (
    <section className="tarjeta space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">
          Formulario para el personal{" "}
          <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${abierto ? "bg-green-100 text-green-800" : "bg-stone-200 text-stone-700"}`}>
            {abierto ? "Abierto" : "Cerrado"}
          </span>
        </h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(url).then(() => setAviso("Link copiado"))}
            className="boton"
          >
            Copiar link
          </button>
          <a href={url} target="_blank" rel="noreferrer" className="boton-secundario">Ver</a>
          <button type="button" disabled={pendiente} onClick={() => ejecutar(abierto ? "cerrar" : "abrir")} className="boton-secundario">
            {abierto ? "Cerrar" : "Abrir"}
          </button>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => window.confirm("¿Generar un link nuevo? El link anterior deja de funcionar.") && ejecutar("renovar")}
            className="boton-secundario"
          >
            Link nuevo
          </button>
        </div>
      </div>
      <p className="break-all font-mono text-xs text-stone-500">{url}</p>
      {aviso && <p className="text-sm text-green-700">{aviso}</p>}
    </section>
  );
}

export function AccionesEnvio({ id, hayCambios }: { id: string; hayCambios: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const ejecutar = (accion: (id: string) => Promise<{ error?: string }>) =>
    iniciar(async () => {
      const r = await accion(id);
      if (r.error) window.alert(r.error);
    });
  return (
    <div className="flex gap-2">
      {hayCambios && (
        <button type="button" disabled={pendiente} onClick={() => ejecutar(aplicarEnvio)} className="boton text-xs">
          Aplicar cambios
        </button>
      )}
      <button type="button" disabled={pendiente} onClick={() => ejecutar(descartarEnvio)} className="boton-secundario text-xs">
        {hayCambios ? "Descartar" : "Listo"}
      </button>
    </div>
  );
}

/** Alta (sin persona) o edición de la ficha de un empleado. */
export function FormularioPersona({ persona }: { persona?: Persona }) {
  const [estado, accion, enviando] = useActionState(guardarPersona.bind(null, persona?.id ?? null), {});
  const v = (campo: string, inicial: string) => estado.valores?.[campo] ?? inicial;
  return (
    <form action={accion} className="space-y-3">
      <CamposPersona persona={persona} v={v} sufijo={persona ? `-${persona.id}` : "-nuevo"} />
      <div>
        <label htmlFor={`notas-${persona?.id ?? "nuevo"}`} className="etiqueta">Notas internas</label>
        <input id={`notas-${persona?.id ?? "nuevo"}`} name="notas" maxLength={1000} defaultValue={v("notas", persona?.notas ?? "")} className="campo" />
      </div>
      {estado.error && <p className="alerta-error">{estado.error}</p>}
      {estado.ok && <p className="text-sm text-green-700">{estado.ok}</p>}
      <button type="submit" disabled={enviando} className={persona ? "boton-secundario" : "boton"}>
        {enviando ? "Guardando…" : persona ? "Guardar cambios" : "Agregar empleado"}
      </button>
    </form>
  );
}

/** Lista con búsqueda; cada empleado se abre para ver o editar su ficha. */
export function ListaPersonal({ personal, editable }: { personal: Persona[]; editable: boolean }) {
  const [busqueda, setBusqueda] = useState("");
  const texto = busqueda.trim().toLowerCase();
  const filtrados = texto
    ? personal.filter((p) => `${p.nombre} ${p.apellido} ${p.dni} ${p.cuil ?? ""} ${p.telefono ?? ""}`.toLowerCase().includes(texto))
    : personal;
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const todosLosFiltrados = filtrados.length > 0 && filtrados.every((p) => elegidos.has(p.id));
  const alternar = (id: string) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const alternarFiltrados = () =>
    setElegidos((s) => {
      const n = new Set(s);
      for (const p of filtrados) {
        if (todosLosFiltrados) n.delete(p.id);
        else n.add(p.id);
      }
      return n;
    });

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Personal ({personal.length})</h2>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, DNI o teléfono"
          aria-label="Buscar empleado"
          className="campo max-w-xs"
        />
      </div>
      {personal.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Excel: los elegidos (campos "id") o, con el otro botón, todos. */}
          <form method="post" action="/empleados/exportar">
            {[...elegidos].map((id) => (
              <input key={id} type="hidden" name="id" value={id} />
            ))}
            <button type="submit" disabled={!elegidos.size} className="boton disabled:opacity-40">
              Descargar Excel de seleccionados{elegidos.size ? ` (${elegidos.size})` : ""}
            </button>
          </form>
          <form method="post" action="/empleados/exportar">
            <button type="submit" className="boton-secundario">Descargar Excel de todos ({personal.length})</button>
          </form>
          {elegidos.size > 0 && (
            <button type="button" onClick={() => setElegidos(new Set())} className="text-sm text-stone-600 hover:text-stone-900">
              Quitar selección
            </button>
          )}
        </div>
      )}
      <div className="tarjeta divide-y divide-stone-100 p-0">
        {filtrados.length > 0 && (
          <label className="flex cursor-pointer items-center gap-3 bg-stone-50 px-4 py-2 text-xs font-medium text-stone-600">
            <input type="checkbox" checked={todosLosFiltrados} onChange={alternarFiltrados} />
            {texto ? `Seleccionar los ${filtrados.length} de la búsqueda` : "Seleccionar todos"}
          </label>
        )}
        {filtrados.length === 0 && <p className="p-6 text-center text-sm text-stone-500">{personal.length ? "No hay coincidencias." : "Todavía no hay personal cargado."}</p>}
        {filtrados.map((p) => (
          <div key={p.id} className="flex items-start">
            <input
              type="checkbox"
              checked={elegidos.has(p.id)}
              onChange={() => alternar(p.id)}
              aria-label={`Seleccionar a ${nombreCompleto(p)}`}
              className="ml-4 mt-3.5 shrink-0"
            />
          <details className="min-w-0 flex-1">            <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="min-w-48 flex-1 font-medium">{nombreCompleto(p)}</span>
              <span className="font-mono text-xs text-stone-500">DNI {p.dni}</span>
              {p.cuil && <span className="font-mono text-xs text-stone-500">CUIL {p.cuil.slice(0, 2)}-{p.cuil.slice(2, 10)}-{p.cuil.slice(10)}</span>}
              {p.telefono && <span className="text-xs text-stone-500">{p.telefono}</span>}
              {p.fecha_nacimiento && <span className="text-xs text-stone-500">Nac. {formatoFecha(p.fecha_nacimiento)}</span>}
            </summary>
            <div className="border-t border-stone-100 bg-stone-50 px-4 py-4">
              {editable ? (
                <FormularioPersona persona={p} />
              ) : (
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                  {(
                    [
                      ["Email", p.email],
                      ["Domicilio", p.domicilio],
                      ["Contacto de emergencia", p.contacto_emergencia],
                      ["Alias o CBU", p.alias_cbu],
                    ] as const
                  ).map(([n, val]) => (
                    <div key={n} className="contents">
                      <dt className="text-stone-500">{n}</dt>
                      <dd>{val ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </details>
          </div>
        ))}
      </div>
    </section>
  );
}
