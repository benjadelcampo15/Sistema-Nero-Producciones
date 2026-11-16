"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DatosTablero } from "@/lib/tareas/consultas";
import { editarTablero, eliminarTablero, eliminarTarjeta, miembroTablero, subirFondoTablero } from "@/lib/tareas/acciones";
import { marcarPlantillaTablero, tableroDesde } from "@/lib/tareas/acciones-avanzadas";
import { FONDOS, NOMBRE_ROL, fondoCss, type Lista, type RolTablero, type Tablero, type Tarjeta } from "@/lib/tareas/tipos";
import { Avatar } from "../comunes";
import type { Operaciones } from "./tablero";

/** Título del tablero: se edita haciendo clic (solo administradores). */
export function TituloTablero({ tablero }: { tablero: Tablero }) {
  const [texto, setTexto] = useState<string | null>(null);
  const [nombre, setNombre] = useState(tablero.nombre);
  const [, iniciar] = useTransition();
  const admin = tablero.rol === "admin";
  if (texto !== null) {
    return (
      <input
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          const n = texto.trim();
          setTexto(null);
          if (n && n !== nombre) {
            setNombre(n);
            iniciar(async () => void (await editarTablero(tablero.id, { nombre: n })));
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setTexto(null);
        }}
        maxLength={120}
        aria-label="Nombre del tablero"
        className="rounded bg-white px-2 py-1 text-lg font-bold text-stone-900 outline-none"
      />
    );
  }
  return (
    <h1 onClick={() => admin && setTexto(nombre)} className={`rounded px-2 py-1 text-lg font-bold ${admin ? "cursor-pointer hover:bg-white/20" : ""}`}>
      {nombre}
    </h1>
  );
}

type Panel = "menu" | "fondo" | "integrantes" | "archivados" | "acerca";

/** Menú del tablero (panel lateral, como Trello). */
export function MenuTablero({
  datos,
  estado,
  yo,
  ops,
  cambiarLista,
}: {
  datos: DatosTablero;
  estado: { listas: Lista[]; tarjetas: Record<string, Tarjeta> };
  yo: string;
  ops: Operaciones;
  cambiarLista: (id: string, cambios: Partial<Lista>) => void;
}) {
  const router = useRouter();
  const { tablero } = datos;
  const admin = tablero.rol === "admin";
  const editable = tablero.rol !== "observador";
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const correr = (f: () => Promise<{ error?: string }>, alTerminar?: () => void) =>
    iniciar(async () => {
      const r = await f();
      setError(r.error ?? null);
      if (!r.error) alTerminar?.();
    });

  const titulo: Record<Panel, string> = { menu: "Menú", fondo: "Cambiar fondo", integrantes: "Integrantes", archivados: "Elementos archivados", acerca: "Acerca de este tablero" };

  return (
    <>
      <button type="button" onClick={() => setPanel("menu")} aria-label="Menú del tablero" className="rounded px-2 py-1 text-lg leading-none hover:bg-white/20">
        ⋯
      </button>
      {panel && (
        <div className="fixed inset-0 z-40" onMouseDown={(e) => e.target === e.currentTarget && setPanel(null)}>
          <aside className="absolute right-0 top-0 flex h-full w-[340px] max-w-full flex-col bg-white text-stone-900 shadow-2xl">
            <div className="flex items-center gap-2 border-b border-stone-200 px-3 py-3">
              {panel !== "menu" && (
                <button type="button" onClick={() => setPanel("menu")} aria-label="Volver" className="rounded px-2 text-stone-500 hover:bg-stone-100">
                  ‹
                </button>
              )}
              <h2 className="flex-1 text-center font-semibold">{titulo[panel]}</h2>
              <button type="button" onClick={() => setPanel(null)} aria-label="Cerrar menú" className="rounded px-2 text-xl leading-none text-stone-500 hover:bg-stone-100">
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 text-sm">
              {error && <p className="alerta-error mb-2">{error}</p>}

              {panel === "menu" && (
                <div className="space-y-0.5">
                  {[
                    ["ⓘ Acerca de este tablero", "acerca"],
                    ["👥 Integrantes", "integrantes"],
                    ...(admin ? [["🎨 Cambiar fondo", "fondo"]] : []),
                    ["🗄 Elementos archivados", "archivados"],
                  ].map(([texto, p]) => (
                    <button key={p} type="button" onClick={() => setPanel(p as Panel)} className="block w-full rounded px-3 py-2 text-left hover:bg-stone-100">
                      {texto}
                    </button>
                  ))}
                  <hr className="my-2 border-stone-200" />
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => {
                      const n = window.prompt("Nombre del tablero nuevo:", `${tablero.nombre} (copia)`);
                      if (!n?.trim()) return;
                      const conTarjetas = window.confirm("¿Copiar también las tarjetas abiertas, con sus etiquetas y checklists? (sin responsables, fechas, completados ni comentarios)\n\nAceptar: con tarjetas · Cancelar: solo las listas");
                      correr(async () => {
                        const r = await tableroDesde(tablero.id, tablero.espacio_id, n, conTarjetas);
                        if (r.id) router.push(`/tareas/${r.id}`);
                        return r;
                      });
                    }}
                    className="block w-full rounded px-3 py-2 text-left hover:bg-stone-100"
                  >
                    ⧉ Copiar tablero
                  </button>
                  {admin && (
                    <>
                      <button
                        type="button"
                        disabled={pendiente}
                        onClick={() => correr(() => marcarPlantillaTablero(tablero.id, !tablero.es_plantilla), () => router.refresh())}
                        className="block w-full rounded px-3 py-2 text-left hover:bg-stone-100"
                      >
                        {tablero.es_plantilla ? "📋 Dejar de usar como plantilla" : "📋 Usar como plantilla de tableros"}
                      </button>
                      <button
                        type="button"
                        disabled={pendiente}
                        onClick={() => correr(() => editarTablero(tablero.id, { visibilidad: tablero.visibilidad === "privado" ? "espacio" : "privado" }), () => router.refresh())}
                        className="block w-full rounded px-3 py-2 text-left hover:bg-stone-100"
                      >
                        {tablero.visibilidad === "privado" ? "👥 Hacer visible para el espacio de trabajo" : "🔒 Hacer privado (solo integrantes)"}
                      </button>
                      <button
                        type="button"
                        disabled={pendiente}
                        onClick={() => {
                          if (!tablero.archivado && !window.confirm("¿Archivar el tablero? Deja de verse en el inicio; se puede restaurar.")) return;
                          correr(() => editarTablero(tablero.id, { archivado: !tablero.archivado }), () => router.refresh());
                        }}
                        className="block w-full rounded px-3 py-2 text-left hover:bg-stone-100"
                      >
                        {tablero.archivado ? "↺ Restaurar tablero" : "🗄 Archivar tablero"}
                      </button>
                      {tablero.archivado && (
                        <button
                          type="button"
                          disabled={pendiente}
                          onClick={() => {
                            if (!window.confirm(`¿Eliminar "${tablero.nombre}" para siempre? Se borran todas sus listas y tarjetas. No se puede deshacer.`)) return;
                            correr(async () => {
                              const r = await eliminarTablero(tablero.id);
                              if (!r.error) router.push("/tareas");
                              return r;
                            });
                          }}
                          className="block w-full rounded px-3 py-2 text-left text-red-700 hover:bg-red-50"
                        >
                          🗑 Eliminar tablero
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {panel === "acerca" && <Acerca tablero={tablero} admin={admin} />}

              {panel === "fondo" && admin && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(FONDOS).map(([k, f]) => (
                      <button
                        key={k}
                        type="button"
                        disabled={pendiente}
                        onClick={() => correr(() => editarTablero(tablero.id, { fondo: `c:${k}` }), () => router.refresh())}
                        className={`h-16 rounded-lg ${tablero.fondo === `c:${k}` ? "ring-2 ring-stone-900 ring-offset-2" : ""}`}
                        style={{ background: f.css }}
                        aria-label={`Fondo ${f.nombre}`}
                        title={f.nombre}
                      />
                    ))}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      correr(() => subirFondoTablero(tablero.id, fd), () => router.refresh());
                    }}
                    className="space-y-2 rounded-lg border border-stone-200 p-3"
                  >
                    <p className="font-medium">Imagen propia</p>
                    <input type="file" name="imagen" accept="image/jpeg,image/png,image/webp" required className="block w-full text-xs" />
                    <button type="submit" disabled={pendiente} className="boton-secundario py-1 text-sm">
                      {pendiente ? "Subiendo…" : "Usar como fondo"}
                    </button>
                  </form>
                  {tablero.fondoUrl && <div className="h-20 rounded-lg" style={{ background: fondoCss(tablero.fondo, tablero.fondoUrl) }} />}
                </div>
              )}

              {panel === "integrantes" && <Integrantes datos={datos} yo={yo} admin={admin} correr={correr} pendiente={pendiente} />}

              {panel === "archivados" && (
                <Archivados estado={estado} editable={editable} ops={ops} cambiarLista={cambiarLista} admin={admin} />
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function Acerca({ tablero, admin }: { tablero: Tablero; admin: boolean }) {
  const [texto, setTexto] = useState(tablero.descripcion ?? "");
  const [guardado, setGuardado] = useState(true);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="space-y-2">
      <p className="font-medium">Descripción</p>
      {admin ? (
        <>
          <textarea
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setGuardado(false);
            }}
            rows={6}
            maxLength={4000}
            placeholder="¿Para qué es este tablero?"
            className="campo"
          />
          <button
            type="button"
            disabled={pendiente || guardado}
            onClick={() =>
              iniciar(async () => {
                const r = await editarTablero(tablero.id, { descripcion: texto.trim() || null });
                if (!r.error) setGuardado(true);
              })
            }
            className="boton py-1 text-sm"
          >
            {guardado ? "Guardado" : "Guardar"}
          </button>
        </>
      ) : (
        <p className="whitespace-pre-wrap text-stone-700">{texto || "Sin descripción."}</p>
      )}
      <p className="pt-2 text-xs text-stone-500">
        Tu rol: <strong>{NOMBRE_ROL[tablero.rol]}</strong>. Visibilidad: {tablero.visibilidad === "privado" ? "privado (solo integrantes)" : "todo el espacio de trabajo"}.
      </p>
    </div>
  );
}

function Integrantes({
  datos,
  yo,
  admin,
  correr,
  pendiente,
}: {
  datos: DatosTablero;
  yo: string;
  admin: boolean;
  correr: (f: () => Promise<{ error?: string }>, alTerminar?: () => void) => void;
  pendiente: boolean;
}) {
  const { tablero, miembros, usuarios } = datos;
  const libres = usuarios.filter((u) => !miembros.some((m) => m.usuario_id === u.id));
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-stone-100">
        {miembros.map((m) => {
          const u = usuarios.find((x) => x.id === m.usuario_id);
          return (
            <li key={m.usuario_id} className="flex items-center gap-2 py-2">
              <Avatar usuario={u ?? { id: m.usuario_id, nombre: "?" }} tam={28} />
              <span className="min-w-0 flex-1 truncate">
                {u?.nombre ?? "Sin acceso a Tareas"}
                {m.usuario_id === yo && <span className="text-stone-500"> (vos)</span>}
              </span>
              {admin ? (
                <>
                  <select
                    value={m.rol}
                    disabled={pendiente}
                    onChange={(e) => correr(() => miembroTablero(tablero.id, m.usuario_id, e.target.value as RolTablero))}
                    aria-label={`Rol de ${u?.nombre ?? "integrante"}`}
                    className="campo w-auto py-1 text-xs"
                  >
                    {(Object.keys(NOMBRE_ROL) as RolTablero[]).map((r) => (
                      <option key={r} value={r}>{NOMBRE_ROL[r]}</option>
                    ))}
                  </select>
                  <button type="button" disabled={pendiente} onClick={() => correr(() => miembroTablero(tablero.id, m.usuario_id, null))} aria-label="Quitar del tablero" className="px-1 text-stone-400 hover:text-red-700">
                    ×
                  </button>
                </>
              ) : (
                <span className="text-xs text-stone-500">{NOMBRE_ROL[m.rol]}</span>
              )}
            </li>
          );
        })}
      </ul>
      {admin && libres.length > 0 && (
        <select value="" disabled={pendiente} onChange={(e) => e.target.value && correr(() => miembroTablero(tablero.id, e.target.value, "miembro"))} aria-label="Agregar integrante" className="campo text-sm">
          <option value="">+ Agregar integrante…</option>
          {libres.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre}</option>
          ))}
        </select>
      )}
      <div className="rounded-lg bg-stone-50 p-2 text-xs text-stone-600">
        <p><strong>Administrador:</strong> gestiona el tablero, sus integrantes y su configuración.</p>
        <p><strong>Miembro:</strong> crea, edita y mueve listas y tarjetas.</p>
        <p><strong>Observador:</strong> solo mira, no modifica.</p>
        {tablero.visibilidad === "espacio" && <p className="mt-1">Además, los integrantes del espacio de trabajo ven y editan este tablero.</p>}
      </div>
    </div>
  );
}

function Archivados({
  estado,
  editable,
  ops,
  cambiarLista,
  admin,
}: {
  estado: { listas: Lista[]; tarjetas: Record<string, Tarjeta> };
  editable: boolean;
  ops: Operaciones;
  cambiarLista: (id: string, cambios: Partial<Lista>) => void;
  admin: boolean;
}) {
  const [ver, setVer] = useState<"tarjetas" | "listas">("tarjetas");
  const [, iniciar] = useTransition();
  const listas = estado.listas.filter((l) => l.archivada);
  const tarjetas = Object.values(estado.tarjetas).filter((t) => t.archivada);
  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-stone-100 p-1">
        {(["tarjetas", "listas"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setVer(v)} className={`flex-1 rounded px-2 py-1 ${ver === v ? "bg-white font-medium shadow-sm" : ""}`}>
            {v === "tarjetas" ? `Tarjetas (${tarjetas.length})` : `Listas (${listas.length})`}
          </button>
        ))}
      </div>
      {ver === "tarjetas" &&
        (tarjetas.length ? (
          <ul className="space-y-2">
            {tarjetas.map((t) => (
              <li key={t.id} className="rounded-lg border border-stone-200 p-2">
                <p className="break-words">{t.titulo}</p>
                <p className="text-xs text-stone-500">en {estado.listas.find((l) => l.id === t.lista_id)?.nombre ?? "—"}</p>
                {editable && (
                  <div className="mt-1 flex gap-3 text-xs">
                    <button type="button" onClick={() => ops.archivar(t.id, false)} className="underline">Restaurar</button>
                    {admin && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm("¿Eliminar la tarjeta para siempre? No se puede deshacer.")) return;
                          ops.quitarDelTablero(t.id);
                          iniciar(async () => void (await eliminarTarjeta(t.id)));
                        }}
                        className="text-red-700 underline"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone-500">No hay tarjetas archivadas.</p>
        ))}
      {ver === "listas" &&
        (listas.length ? (
          <ul className="space-y-2">
            {listas.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 p-2">
                <span>{l.nombre}</span>
                {editable && (
                  <button type="button" onClick={() => cambiarLista(l.id, { archivada: false })} className="text-xs underline">
                    Restaurar
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone-500">No hay listas archivadas.</p>
        ))}
    </div>
  );
}
