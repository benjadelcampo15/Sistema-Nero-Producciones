"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  activarRecurrente,
  activarRegla,
  automatizacionesTablero,
  borrarBoton,
  borrarRecurrente,
  borrarRegla,
  guardarBoton,
  guardarRecurrente,
  guardarRegla,
  usarBoton,
} from "@/lib/tareas/acciones-avanzadas";
import {
  ACCIONES,
  DIAS_SEMANA,
  DISPARADORES,
  describirAccion,
  describirDisparador,
  describirFrecuencia,
  type Accion,
  type AccionTablero,
  type Boton,
  type Disparador,
  type Ejecucion,
  type Recurrente,
  type Regla,
} from "@/lib/tareas/automatizaciones";
import { colorEtiqueta, type Etiqueta, type Lista, type Usuario } from "@/lib/tareas/tipos";

type Datos = NonNullable<Awaited<ReturnType<typeof automatizacionesTablero>>>;
type Pestana = "reglas" | "tarjeta" | "tablero" | "recurrentes" | "historial";

/** Automatizaciones del tablero (como Butler): reglas, botones, recurrentes y su historial. */
export function PanelAutomatizaciones({
  tableroId,
  listas,
  etiquetas,
  usuarios,
  editable,
  cerrar,
}: {
  tableroId: string;
  listas: Lista[];
  etiquetas: Etiqueta[];
  usuarios: Usuario[];
  editable: boolean;
  cerrar: () => void;
}) {
  const router = useRouter();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [pestana, setPestana] = useState<Pestana>("reglas");
  const [editando, setEditando] = useState<"nueva" | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cargar = () => void automatizacionesTablero(tableroId).then(setDatos);
  // Una vez al abrir.
  useEffect(cargar, [tableroId]);
  const nombres = {
    lista: (id?: string | null) => listas.find((l) => l.id === id)?.nombre ?? "lista borrada",
    etiqueta: (id?: string | null) => {
      const e = etiquetas.find((x) => x.id === id);
      return e ? e.nombre || colorEtiqueta(e.color).nombre : "etiqueta borrada";
    },
    usuario: (id?: string | null) => usuarios.find((u) => u.id === id)?.nombre ?? "alguien",
  };
  const correr = (f: () => Promise<{ error?: string; aviso?: string }>, alTerminar?: () => void) =>
    iniciar(async () => {
      const r = await f();
      setError(r.error ?? r.aviso ?? null);
      if (!r.error) {
        alTerminar?.();
        cargar();
      }
    });

  const pestanas: [Pestana, string][] = [
    ["reglas", "Reglas"],
    ["tarjeta", "Botones de tarjeta"],
    ["tablero", "Botones de tablero"],
    ["recurrentes", "Recurrentes"],
    ["historial", "Ejecuciones"],
  ];

  return (
    <div className="fixed inset-0 z-40 bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
      <aside className="absolute right-0 top-0 flex h-full w-[min(100vw,560px)] flex-col bg-stone-50 text-stone-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
          <h2 className="font-semibold">⚡ Automatizaciones</h2>
          <button type="button" onClick={cerrar} aria-label="Cerrar" className="rounded px-2 text-xl leading-none text-stone-500 hover:bg-stone-100">×</button>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-stone-200 bg-white px-2 py-1.5 text-sm">
          {pestanas.map(([p, n]) => (
            <button key={p} type="button" onClick={() => { setPestana(p); setEditando(null); }} className={`shrink-0 rounded px-3 py-1 ${pestana === p ? "bg-stone-900 text-white" : "hover:bg-stone-100"}`}>
              {n}
            </button>
          ))}
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
          {error && <p className="alerta-error">{error}</p>}
          {!datos ? (
            <div className="esqueleto h-24 rounded-lg" />
          ) : pestana === "reglas" ? (
            <>
              <p className="text-stone-600">Cuando pasa algo en una tarjeta, Planix hace otra cosa sola. Evita ejecuciones repetidas y ciclos.</p>
              {editando ? (
                <EditorRegla
                  regla={datos.reglas.find((r) => r.id === editando)}
                  listas={listas}
                  etiquetas={etiquetas}
                  usuarios={usuarios}
                  nombres={nombres}
                  pendiente={pendiente}
                  cancelar={() => setEditando(null)}
                  guardar={(r) => correr(() => guardarRegla(tableroId, editando === "nueva" ? null : editando, r), () => setEditando(null))}
                />
              ) : (
                editable && (
                  <button type="button" onClick={() => setEditando("nueva")} className="boton w-full">
                    + Crear regla
                  </button>
                )
              )}
              {datos.reglas.length === 0 && !editando && <p className="text-stone-500">Todavía no hay reglas.</p>}
              {datos.reglas.map((r) => (
                <div key={r.id} className={`rounded-lg border bg-white p-3 ${r.activa ? "border-stone-200" : "border-dashed border-stone-300 opacity-70"}`}>
                  <div className="flex items-start gap-2">
                    <p className="flex-1 font-semibold">{r.nombre}</p>
                    {editable && (
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={r.activa} onChange={(e) => correr(() => activarRegla(r.id, e.target.checked))} className="h-4 w-4" />
                        Activa
                      </label>
                    )}
                  </div>
                  <p className="mt-1 text-stone-700">
                    <strong>{describirDisparador(r.disparador, nombres)}</strong>, {r.acciones.map((a) => describirAccion(a, nombres)).join(", luego ")}.
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {r.ejecuciones} {r.ejecuciones === 1 ? "ejecución" : "ejecuciones"}
                    {r.ultima_ejecucion && ` · última ${new Date(r.ultima_ejecucion).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}`}
                  </p>
                  {r.ultimo_error && <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-800">⚠ {r.ultimo_error}</p>}
                  {editable && (
                    <p className="mt-2 flex gap-3 text-xs">
                      <button type="button" onClick={() => setEditando(r.id)} className="underline">Editar</button>
                      <button type="button" onClick={() => window.confirm("¿Eliminar la regla?") && correr(() => borrarRegla(r.id))} className="text-red-700 underline">Eliminar</button>
                    </p>
                  )}
                </div>
              ))}
            </>
          ) : pestana === "tarjeta" || pestana === "tablero" ? (
            <Botones
              ambito={pestana}
              botones={datos.botones.filter((b) => b.ambito === pestana)}
              editando={editando}
              setEditando={setEditando}
              listas={listas}
              etiquetas={etiquetas}
              usuarios={usuarios}
              nombres={nombres}
              editable={editable}
              pendiente={pendiente}
              guardar={(id, b) => correr(() => guardarBoton(tableroId, id, b), () => setEditando(null))}
              borrar={(id) => correr(() => borrarBoton(id))}
              usar={(id) => correr(() => usarBoton(id), () => router.refresh())}
            />
          ) : pestana === "recurrentes" ? (
            <>
              <p className="text-stone-600">Tareas que se crean solas en las fechas elegidas, con sus responsables, descripción y checklist. Nunca se duplican ni se crean completadas.</p>
              {editando ? (
                <EditorRecurrente
                  r={datos.recurrentes.find((x) => x.id === editando)}
                  listas={listas}
                  etiquetas={etiquetas}
                  usuarios={usuarios}
                  pendiente={pendiente}
                  cancelar={() => setEditando(null)}
                  guardar={(r) => correr(() => guardarRecurrente(tableroId, editando === "nueva" ? null : editando, r), () => { setEditando(null); router.refresh(); })}
                />
              ) : (
                editable && (
                  <button type="button" onClick={() => setEditando("nueva")} className="boton w-full">
                    + Nueva tarea recurrente
                  </button>
                )
              )}
              {datos.recurrentes.map((r) => (
                <div key={r.id} className={`rounded-lg border bg-white p-3 ${r.activa ? "border-stone-200" : "border-dashed border-stone-300 opacity-70"}`}>
                  <div className="flex items-start gap-2">
                    <p className="flex-1 font-semibold">{r.titulo}</p>
                    {editable && (
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={r.activa} onChange={(e) => correr(() => activarRecurrente(r.id, e.target.checked))} className="h-4 w-4" />
                        Activa
                      </label>
                    )}
                  </div>
                  <p className="text-stone-700">{describirFrecuencia(r)} · en “{nombres.lista(r.lista_id)}”</p>
                  <p className="text-xs text-stone-500">
                    {r.proxima ? `Próxima: ${r.proxima.split("-").reverse().join("/")}` : "Sin próximas fechas"}
                    {r.miembros.length > 0 && ` · para ${r.miembros.map((m) => nombres.usuario(m)).join(", ")}`}
                    {r.checklists.length > 0 && ` · ${r.checklists.reduce((s, c) => s + c.items.length, 0)} pasos de checklist`}
                  </p>
                  {editable && (
                    <p className="mt-2 flex gap-3 text-xs">
                      <button type="button" onClick={() => setEditando(r.id)} className="underline">Editar</button>
                      <button type="button" onClick={() => window.confirm("¿Eliminar la tarea recurrente? Las tarjetas ya creadas quedan.") && correr(() => borrarRecurrente(r.id))} className="text-red-700 underline">Eliminar</button>
                    </p>
                  )}
                </div>
              ))}
            </>
          ) : (
            <Historial log={datos.log} reglas={datos.reglas} botones={datos.botones} />
          )}
        </div>
      </aside>
    </div>
  );
}

type Nombres = { lista: (id?: string | null) => string; etiqueta: (id?: string | null) => string; usuario: (id?: string | null) => string };

function Historial({ log, reglas, botones }: { log: Ejecucion[]; reglas: Regla[]; botones: Boton[] }) {
  if (!log.length) return <p className="text-stone-500">Todavía no se ejecutó ninguna automatización.</p>;
  return (
    <ul className="space-y-1.5">
      {log.map((l) => (
        <li key={l.id} className={`rounded border px-3 py-2 ${l.ok ? "border-stone-200 bg-white" : "border-red-200 bg-red-50"}`}>
          <p className="font-medium">
            {l.ok ? "✓" : "⚠"} {l.regla_id ? `Regla "${reglas.find((r) => r.id === l.regla_id)?.nombre ?? "borrada"}"` : `Botón "${botones.find((b) => b.id === l.boton_id)?.nombre ?? "borrado"}"`}
          </p>
          <p className="text-xs text-stone-600">
            {new Date(l.creado_en).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })} · {l.detalle}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Selector de un dato (lista, etiqueta o persona) según lo que pide el disparador o la acción. */
function Dato({
  tipo,
  valor,
  cambiar,
  listas,
  etiquetas,
  usuarios,
  conMiembros,
}: {
  tipo: "lista" | "etiqueta" | "usuario" | "notificar";
  valor: string | undefined;
  cambiar: (v: string) => void;
  listas: Lista[];
  etiquetas: Etiqueta[];
  usuarios: Usuario[];
  conMiembros?: boolean;
}) {
  return (
    <select value={valor ?? ""} onChange={(e) => cambiar(e.target.value)} className="campo py-1 text-sm" aria-label="Elegir">
      <option value="">Elegí…</option>
      {tipo === "lista" && listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
      {tipo === "etiqueta" && etiquetas.map((e) => <option key={e.id} value={e.id}>{e.nombre || colorEtiqueta(e.color).nombre}</option>)}
      {(tipo === "usuario" || tipo === "notificar") && (
        <>
          {(tipo === "notificar" || conMiembros) && <option value="miembros">Los miembros de la tarjeta</option>}
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </>
      )}
    </select>
  );
}

function EditorAcciones({ acciones, setAcciones, listas, etiquetas, usuarios }: { acciones: Accion[]; setAcciones: (a: Accion[]) => void; listas: Lista[]; etiquetas: Etiqueta[]; usuarios: Usuario[] }) {
  const cambiar = (i: number, c: Partial<Accion>) => setAcciones(acciones.map((a, j) => (j === i ? { ...a, ...c } : a)));
  return (
    <div className="space-y-2">
      {acciones.map((a, i) => {
        const def = ACCIONES.find((x) => x.tipo === a.tipo)!;
        return (
          <div key={i} className="space-y-1 rounded border border-stone-200 bg-stone-50 p-2">
            <div className="flex gap-1">
              <select value={a.tipo} onChange={(e) => cambiar(i, { tipo: e.target.value as Accion["tipo"], lista_id: undefined, etiqueta_id: undefined, usuario_id: undefined })} className="campo py-1 text-sm" aria-label="Acción">
                {ACCIONES.map((x) => <option key={x.tipo} value={x.tipo}>{x.nombre}</option>)}
              </select>
              <button type="button" onClick={() => setAcciones(acciones.filter((_, j) => j !== i))} aria-label="Quitar acción" className="px-2 text-stone-500 hover:text-red-700">×</button>
            </div>
            {def.dato && (
              <Dato
                tipo={def.dato}
                valor={def.dato === "lista" ? a.lista_id : def.dato === "etiqueta" ? a.etiqueta_id : a.usuario_id}
                cambiar={(v) => cambiar(i, def.dato === "lista" ? { lista_id: v } : def.dato === "etiqueta" ? { etiqueta_id: v } : { usuario_id: v })}
                listas={listas}
                etiquetas={etiquetas}
                usuarios={usuarios}
              />
            )}
            {a.tipo === "mover" && (
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={!!a.arriba} onChange={(e) => cambiar(i, { arriba: e.target.checked })} /> Arriba de la lista
              </label>
            )}
            {def.dias && (
              <input type="number" min={0} max={365} value={a.dias ?? 1} onChange={(e) => cambiar(i, { dias: Number(e.target.value) })} className="campo w-24 py-1 text-sm" aria-label="Días" />
            )}
            {a.tipo === "notificar" && (
              <input value={a.mensaje ?? ""} onChange={(e) => cambiar(i, { mensaje: e.target.value })} maxLength={200} placeholder="Mensaje (ej.: Revisar la tarea)" aria-label="Mensaje" className="campo py-1 text-sm" />
            )}
          </div>
        );
      })}
      <button type="button" onClick={() => setAcciones([...acciones, { tipo: "completar" }])} className="text-sm underline">
        + Agregar acción
      </button>
    </div>
  );
}

function EditorRegla({
  regla,
  listas,
  etiquetas,
  usuarios,
  nombres,
  pendiente,
  cancelar,
  guardar,
}: {
  regla?: Regla;
  listas: Lista[];
  etiquetas: Etiqueta[];
  usuarios: Usuario[];
  nombres: Nombres;
  pendiente: boolean;
  cancelar: () => void;
  guardar: (r: { nombre: string; disparador: Disparador; acciones: Accion[] }) => void;
}) {
  const [disparador, setDisparador] = useState<Disparador>(regla?.disparador ?? { tipo: "movida_a" });
  const [acciones, setAcciones] = useState<Accion[]>(regla?.acciones ?? [{ tipo: "completar" }]);
  const [nombre, setNombre] = useState(regla?.nombre ?? "");
  const def = DISPARADORES.find((d) => d.tipo === disparador.tipo)!;
  const sugerido = `${describirDisparador(disparador, nombres)}, ${acciones.map((a) => describirAccion(a, nombres)).join(" y ")}`;
  return (
    <div className="space-y-3 rounded-lg border-2 border-sky-600 bg-white p-3">
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-sky-800">Cuando</p>
        <select value={disparador.tipo} onChange={(e) => setDisparador({ tipo: e.target.value as Disparador["tipo"], dias: 2 })} className="campo py-1 text-sm" aria-label="Disparador">
          {DISPARADORES.map((d) => <option key={d.tipo} value={d.tipo}>{d.nombre}</option>)}
        </select>
        {def.dato && (
          <div className="mt-1">
            <Dato tipo={def.dato} valor={disparador.dato ?? undefined} cambiar={(v) => setDisparador({ ...disparador, dato: v || null })} listas={listas} etiquetas={etiquetas} usuarios={usuarios} />
          </div>
        )}
        {def.dias && (
          <input type="number" min={0} max={60} value={disparador.dias ?? 2} onChange={(e) => setDisparador({ ...disparador, dias: Number(e.target.value) })} className="campo mt-1 w-24 py-1 text-sm" aria-label="Días antes" />
        )}
      </div>
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-sky-800">Entonces</p>
        <EditorAcciones acciones={acciones} setAcciones={setAcciones} listas={listas} etiquetas={etiquetas} usuarios={usuarios} />
      </div>
      <label className="block">
        <span className="text-xs font-semibold text-stone-600">Nombre de la regla</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={200} placeholder={sugerido.slice(0, 200)} className="campo py-1 text-sm" />
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={pendiente} onClick={() => guardar({ nombre: nombre.trim() || sugerido.slice(0, 200), disparador, acciones })} className="boton py-1.5 text-sm">
          Guardar regla
        </button>
        <button type="button" onClick={cancelar} className="boton-secundario py-1.5 text-sm">Cancelar</button>
      </div>
    </div>
  );
}

function Botones({
  ambito,
  botones,
  editando,
  setEditando,
  listas,
  etiquetas,
  usuarios,
  nombres,
  editable,
  pendiente,
  guardar,
  borrar,
  usar,
}: {
  ambito: "tarjeta" | "tablero";
  botones: Boton[];
  editando: string | null;
  setEditando: (s: string | null) => void;
  listas: Lista[];
  etiquetas: Etiqueta[];
  usuarios: Usuario[];
  nombres: Nombres;
  editable: boolean;
  pendiente: boolean;
  guardar: (id: string | null, b: { ambito: "tarjeta"; nombre: string; acciones: Accion[] } | { ambito: "tablero"; nombre: string; acciones: AccionTablero[] }) => void;
  borrar: (id: string) => void;
  usar: (id: string) => void;
}) {
  const actual = botones.find((b) => b.id === editando);
  return (
    <>
      <p className="text-stone-600">
        {ambito === "tarjeta"
          ? "Aparecen en cada tarjeta abierta: con un clic hacen varias cosas juntas (por ejemplo, mover a revisión, asignar al supervisor y etiquetar)."
          : "Aparecen arriba del tablero: hacen tareas de todo el tablero (crear un conjunto de tarjetas, mover o archivar en bloque)."}
      </p>
      {editando ? (
        ambito === "tarjeta" ? (
          <EditorBotonTarjeta
            boton={actual}
            listas={listas}
            etiquetas={etiquetas}
            usuarios={usuarios}
            pendiente={pendiente}
            cancelar={() => setEditando(null)}
            guardar={(n, a) => guardar(editando === "nueva" ? null : editando, { ambito: "tarjeta", nombre: n, acciones: a })}
          />
        ) : (
          <EditorBotonTablero
            boton={actual}
            listas={listas}
            usuarios={usuarios}
            pendiente={pendiente}
            cancelar={() => setEditando(null)}
            guardar={(n, a) => guardar(editando === "nueva" ? null : editando, { ambito: "tablero", nombre: n, acciones: a })}
          />
        )
      ) : (
        editable && (
          <button type="button" onClick={() => setEditando("nueva")} className="boton w-full">
            + Crear botón
          </button>
        )
      )}
      {botones.map((b) => (
        <div key={b.id} className="rounded-lg border border-stone-200 bg-white p-3">
          <p className="font-semibold">▶ {b.nombre}</p>
          <p className="text-stone-700">{b.acciones.map((a) => describirAccion(a, nombres)).join(", luego ")}.</p>
          {editable && (
            <p className="mt-2 flex gap-3 text-xs">
              {ambito === "tablero" && (
                <button type="button" disabled={pendiente} onClick={() => usar(b.id)} className="font-medium underline">
                  Ejecutar ahora
                </button>
              )}
              <button type="button" onClick={() => setEditando(b.id)} className="underline">Editar</button>
              <button type="button" onClick={() => window.confirm("¿Eliminar el botón?") && borrar(b.id)} className="text-red-700 underline">Eliminar</button>
            </p>
          )}
        </div>
      ))}
    </>
  );
}

function EditorBotonTarjeta({
  boton,
  listas,
  etiquetas,
  usuarios,
  pendiente,
  cancelar,
  guardar,
}: {
  boton?: Boton;
  listas: Lista[];
  etiquetas: Etiqueta[];
  usuarios: Usuario[];
  pendiente: boolean;
  cancelar: () => void;
  guardar: (nombre: string, acciones: Accion[]) => void;
}) {
  const [nombre, setNombre] = useState(boton?.nombre ?? "");
  const [acciones, setAcciones] = useState<Accion[]>((boton?.acciones as Accion[]) ?? [{ tipo: "mover" }]);
  return (
    <div className="space-y-3 rounded-lg border-2 border-sky-600 bg-white p-3">
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="Nombre del botón (ej.: Enviar a revisión)" aria-label="Nombre del botón" className="campo py-1 text-sm" />
      <EditorAcciones acciones={acciones} setAcciones={setAcciones} listas={listas} etiquetas={etiquetas} usuarios={usuarios} />
      <div className="flex gap-2">
        <button type="button" disabled={pendiente} onClick={() => guardar(nombre, acciones)} className="boton py-1.5 text-sm">Guardar botón</button>
        <button type="button" onClick={cancelar} className="boton-secundario py-1.5 text-sm">Cancelar</button>
      </div>
    </div>
  );
}

function EditorBotonTablero({
  boton,
  listas,
  usuarios,
  pendiente,
  cancelar,
  guardar,
}: {
  boton?: Boton;
  listas: Lista[];
  usuarios: Usuario[];
  pendiente: boolean;
  cancelar: () => void;
  guardar: (nombre: string, acciones: AccionTablero[]) => void;
}) {
  const [nombre, setNombre] = useState(boton?.nombre ?? "");
  const [acciones, setAcciones] = useState<AccionTablero[]>((boton?.acciones as AccionTablero[]) ?? [{ tipo: "crear_tarjeta", lista_id: listas[0]?.id ?? "", titulo: "" }]);
  const cambiar = (i: number, a: AccionTablero) => setAcciones(acciones.map((x, j) => (j === i ? a : x)));
  return (
    <div className="space-y-3 rounded-lg border-2 border-sky-600 bg-white p-3">
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="Nombre del botón (ej.: Tareas del lunes)" aria-label="Nombre del botón" className="campo py-1 text-sm" />
      {acciones.map((a, i) => (
        <div key={i} className="space-y-1 rounded border border-stone-200 bg-stone-50 p-2">
          <div className="flex gap-1">
            <select
              value={a.tipo}
              onChange={(e) => {
                const t = e.target.value as AccionTablero["tipo"];
                cambiar(i, t === "crear_tarjeta" ? { tipo: t, lista_id: listas[0]?.id ?? "", titulo: "" } : t === "mover_lista" ? { tipo: t, desde: listas[0]?.id ?? "", hacia: listas[1]?.id ?? "" } : { tipo: t });
              }}
              className="campo py-1 text-sm"
              aria-label="Acción"
            >
              <option value="crear_tarjeta">Crear una tarjeta</option>
              <option value="mover_lista">Mover todas las tarjetas de una lista</option>
              <option value="archivar_completadas">Archivar las tarjetas completadas</option>
            </select>
            <button type="button" onClick={() => setAcciones(acciones.filter((_, j) => j !== i))} aria-label="Quitar acción" className="px-2 text-stone-500 hover:text-red-700">×</button>
          </div>
          {a.tipo === "crear_tarjeta" && (
            <>
              <input value={a.titulo} onChange={(e) => cambiar(i, { ...a, titulo: e.target.value })} maxLength={500} placeholder="Título de la tarjeta" aria-label="Título" className="campo py-1 text-sm" />
              <select value={a.lista_id} onChange={(e) => cambiar(i, { ...a, lista_id: e.target.value })} className="campo py-1 text-sm" aria-label="Lista">
                {listas.map((l) => <option key={l.id} value={l.id}>en {l.nombre}</option>)}
              </select>
              <select multiple value={a.miembros ?? []} onChange={(e) => cambiar(i, { ...a, miembros: [...e.target.selectedOptions].map((o) => o.value) })} className="campo h-20 py-1 text-sm" aria-label="Responsables">
                {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </>
          )}
          {a.tipo === "mover_lista" && (
            <div className="flex gap-1">
              <select value={a.desde} onChange={(e) => cambiar(i, { ...a, desde: e.target.value })} className="campo py-1 text-sm" aria-label="Desde">
                {listas.map((l) => <option key={l.id} value={l.id}>de {l.nombre}</option>)}
              </select>
              <select value={a.hacia} onChange={(e) => cambiar(i, { ...a, hacia: e.target.value })} className="campo py-1 text-sm" aria-label="Hacia">
                {listas.map((l) => <option key={l.id} value={l.id}>a {l.nombre}</option>)}
              </select>
            </div>
          )}
          {a.tipo === "archivar_completadas" && (
            <select value={a.lista_id ?? ""} onChange={(e) => cambiar(i, { tipo: "archivar_completadas", lista_id: e.target.value || undefined })} className="campo py-1 text-sm" aria-label="Lista">
              <option value="">de todo el tablero</option>
              {listas.map((l) => <option key={l.id} value={l.id}>de {l.nombre}</option>)}
            </select>
          )}
        </div>
      ))}
      <button type="button" onClick={() => setAcciones([...acciones, { tipo: "crear_tarjeta", lista_id: listas[0]?.id ?? "", titulo: "" }])} className="text-sm underline">
        + Agregar acción
      </button>
      <div className="flex gap-2">
        <button type="button" disabled={pendiente} onClick={() => guardar(nombre, acciones)} className="boton py-1.5 text-sm">Guardar botón</button>
        <button type="button" onClick={cancelar} className="boton-secundario py-1.5 text-sm">Cancelar</button>
      </div>
    </div>
  );
}

function EditorRecurrente({
  r,
  listas,
  etiquetas,
  usuarios,
  pendiente,
  cancelar,
  guardar,
}: {
  r?: Recurrente;
  listas: Lista[];
  etiquetas: Etiqueta[];
  usuarios: Usuario[];
  pendiente: boolean;
  cancelar: () => void;
  guardar: (r: {
    lista_id: string;
    titulo: string;
    descripcion: string | null;
    miembros: string[];
    etiquetas: string[];
    checklists: { nombre: string; items: string[] }[];
    frecuencia: Recurrente["frecuencia"];
    dias: number[];
    fechas: string[];
    hora: string | null;
    desde: string;
  }) => void;
}) {
  const [titulo, setTitulo] = useState(r?.titulo ?? "");
  const [lista, setLista] = useState(r?.lista_id ?? listas[0]?.id ?? "");
  const [descripcion, setDescripcion] = useState(r?.descripcion ?? "");
  const [miembros, setMiembros] = useState<string[]>(r?.miembros ?? []);
  const [etqs, setEtqs] = useState<string[]>(r?.etiquetas ?? []);
  const [frecuencia, setFrecuencia] = useState<Recurrente["frecuencia"]>(r?.frecuencia ?? "semanal");
  const [dias, setDias] = useState<number[]>(r?.dias ?? [1]);
  const [fechas, setFechas] = useState(r?.fechas.join(", ") ?? "");
  const [hora, setHora] = useState(r?.hora?.slice(0, 5) ?? "");
  const [desde, setDesde] = useState(() => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10));
  const [checklist, setChecklist] = useState(r?.checklists[0]?.items.join("\n") ?? "");
  return (
    <div className="space-y-2 rounded-lg border-2 border-sky-600 bg-white p-3">
      <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={500} placeholder="Título (ej.: Revisar campañas publicitarias)" aria-label="Título" className="campo py-1 text-sm" />
      <select value={lista} onChange={(e) => setLista(e.target.value)} className="campo py-1 text-sm" aria-label="Lista">
        {listas.map((l) => <option key={l.id} value={l.id}>Crear en “{l.nombre}”</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <select value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as Recurrente["frecuencia"])} className="campo py-1 text-sm" aria-label="Frecuencia">
          <option value="diaria">Todos los días</option>
          <option value="semanal">Días de la semana</option>
          <option value="mensual">Cada mes</option>
          <option value="fechas">Fechas específicas</option>
        </select>
        <label className="flex items-center gap-1 text-xs">
          Desde <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="campo py-1 text-sm" />
        </label>
      </div>
      {frecuencia === "semanal" && (
        <div className="flex flex-wrap gap-1">
          {DIAS_SEMANA.map((d, i) => (
            <button key={d} type="button" onClick={() => setDias(dias.includes(i) ? dias.filter((x) => x !== i) : [...dias, i].sort())} className={`rounded px-2 py-1 text-xs ${dias.includes(i) ? "bg-stone-900 text-white" : "bg-stone-200"}`}>
              {d}
            </button>
          ))}
        </div>
      )}
      {frecuencia === "mensual" && (
        <label className="flex items-center gap-2 text-xs">
          Día del mes <input type="number" min={1} max={31} value={dias[0] ?? 1} onChange={(e) => setDias([Number(e.target.value)])} className="campo w-20 py-1 text-sm" />
        </label>
      )}
      {frecuencia === "fechas" && (
        <input value={fechas} onChange={(e) => setFechas(e.target.value)} placeholder="2026-12-01, 2026-12-15" aria-label="Fechas" className="campo py-1 text-sm" />
      )}
      <label className="flex items-center gap-2 text-xs">
        Vence ese día a las <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="campo w-28 py-1 text-sm" /> (vacío: sin vencimiento)
      </label>
      <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} maxLength={20000} placeholder="Descripción (opcional)" aria-label="Descripción" className="campo text-sm" />
      <textarea value={checklist} onChange={(e) => setChecklist(e.target.value)} rows={3} placeholder={"Checklist: un paso por línea (opcional)"} aria-label="Checklist" className="campo text-sm" />
      <div className="flex flex-wrap gap-1">
        {usuarios.map((u) => (
          <button key={u.id} type="button" onClick={() => setMiembros(miembros.includes(u.id) ? miembros.filter((x) => x !== u.id) : [...miembros, u.id])} className={`rounded-full px-2 py-0.5 text-xs ${miembros.includes(u.id) ? "bg-stone-900 text-white" : "bg-stone-200"}`}>
            {u.nombre}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {etiquetas.map((e) => {
          const c = colorEtiqueta(e.color);
          const sel = etqs.includes(e.id);
          return (
            <button key={e.id} type="button" onClick={() => setEtqs(sel ? etqs.filter((x) => x !== e.id) : [...etqs, e.id])} className={`rounded px-2 py-0.5 text-xs font-semibold ${sel ? "ring-2 ring-stone-900" : "opacity-60"}`} style={{ background: c.fondo, color: c.texto }}>
              {e.nombre || c.nombre}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            guardar({
              lista_id: lista,
              titulo,
              descripcion: descripcion.trim() || null,
              miembros,
              etiquetas: etqs,
              checklists: checklist.trim() ? [{ nombre: "Checklist", items: checklist.split("\n").map((x) => x.trim()).filter(Boolean) }] : [],
              frecuencia,
              dias: frecuencia === "semanal" || frecuencia === "mensual" ? dias : [],
              fechas: frecuencia === "fechas" ? fechas.split(/[,\s]+/).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f)) : [],
              hora: hora || null,
              desde,
            })
          }
          className="boton py-1.5 text-sm"
        >
          Guardar
        </button>
        <button type="button" onClick={cancelar} className="boton-secundario py-1.5 text-sm">Cancelar</button>
      </div>
    </div>
  );
}
