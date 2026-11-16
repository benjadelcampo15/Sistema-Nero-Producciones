"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { eliminarTarjeta } from "@/lib/tareas/acciones";
import {
  adjuntarEnlace,
  borrarAdjunto,
  borrarChecklist,
  borrarComentario,
  borrarEtiqueta,
  borrarItem,
  comentar,
  confirmarAdjunto,
  crearChecklist,
  crearEtiqueta,
  crearItem,
  detalleTarjeta,
  editarChecklist,
  editarComentario,
  editarEtiqueta,
  editarItem,
  prepararAdjunto,
  seguirTarjeta,
} from "@/lib/tareas/acciones-tarjeta";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { marcarPlantillaTarjeta } from "@/lib/tareas/acciones-avanzadas";
import type { Boton } from "@/lib/tareas/automatizaciones";
import {
  COLORES_ETIQUETA,
  COLORES_PORTADA,
  COLOR_VENCIMIENTO,
  RECORDATORIOS,
  colorEtiqueta,
  esImagen,
  estadoVencimiento,
  posicionEntre,
  type Actividad,
  type Adjunto,
  type Checklist,
  type Comentario,
  type DetalleTarjeta,
  type Lista,
  type RolTablero,
  type Tarjeta,
  type Usuario,
} from "@/lib/tareas/tipos";
import { Formato, htmlAFormato } from "@/lib/tareas/markdown";
import { Avatar, Ventana } from "../comunes";
import type { Operaciones } from "./tablero";

const nuevoId = () => crypto.randomUUID();
const ZONA = "America/Argentina/Buenos_Aires";

/** ISO → "2026-11-20" y "18:00" en hora de Buenos Aires (y al revés). */
function partes(iso: string | null) {
  if (!iso) return { fecha: "", hora: "" };
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString();
  return { fecha: d.slice(0, 10), hora: d.slice(11, 16) };
}
const aIso = (fecha: string, hora: string) => (fecha ? `${fecha}T${hora || "23:59"}:00-03:00` : null);
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: ZONA });
const tamano = (b: number | null) => (!b ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

type Panel = "miembros" | "etiquetas" | "checklist" | "fechas" | "adjunto" | "portada" | "mover" | "copiar" | null;

/** La tarjeta abierta (ventana sobre el tablero, como en Trello). */
export function VentanaTarjeta({
  tarjeta: t,
  listas,
  usuarios,
  miembrosTablero,
  editable,
  rol,
  yo,
  ops,
  cerrar,
  tableroId,
  botones,
  usarBoton,
}: {
  tarjeta: Tarjeta;
  listas: Lista[];
  usuarios: Usuario[];
  miembrosTablero: string[];
  editable: boolean;
  rol: RolTablero;
  yo: string;
  ops: Operaciones;
  cerrar: () => void;
  tableroId: string;
  botones: Boton[];
  usarBoton: (id: string) => void;
}) {
  const router = useRouter();
  const [detalle, setDetalle] = useState<DetalleTarjeta | null>(null);
  const [titulo, setTitulo] = useState(t.titulo);
  const [panel, setPanel] = useState<Panel>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const lista = listas.find((l) => l.id === t.lista_id);
  const nombre = (id: string | null) => usuarios.find((u) => u.id === id)?.nombre ?? "Alguien";
  const candidatos = usuarios.filter((u) => miembrosTablero.includes(u.id) || t.miembros.includes(u.id));

  // Al abrir: checklists, adjuntos, comentarios e historial.
  const cargar = () =>
    void detalleTarjeta(t.id).then((d) => {
      if (d) {
        setDetalle(d);
        ops.local(t.id, {
          resumen: {
            items: d.checklists.reduce((s, c) => s + c.items.length, 0),
            hechos: d.checklists.reduce((s, c) => s + c.items.filter((i) => i.hecho).length, 0),
            adjuntos: d.adjuntos.length,
            comentarios: d.comentarios.length,
            sigo: d.sigo,
          },
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- se carga una vez por tarjeta abierta
  useEffect(cargar, [t.id]);

  /** Cambia el detalle y recalcula los contadores de la cara de la tarjeta. */
  const cambiarDetalle = (f: (d: DetalleTarjeta) => DetalleTarjeta) =>
    setDetalle((d) => {
      if (!d) return d;
      const n = f(d);
      ops.local(t.id, {
        resumen: {
          items: n.checklists.reduce((s, c) => s + c.items.length, 0),
          hechos: n.checklists.reduce((s, c) => s + c.items.filter((i) => i.hecho).length, 0),
          adjuntos: n.adjuntos.length,
          comentarios: n.comentarios.length,
          sigo: n.sigo,
        },
      });
      return n;
    });
  const correr = (accion: () => Promise<{ error?: string }>, alFallar?: () => void) =>
    iniciar(async () => {
      const r = await accion();
      if (r.error) {
        setAviso(r.error);
        alFallar?.();
        cargar();
      }
    });

  const guardarTitulo = () => {
    const n = titulo.trim();
    if (!n) return setTitulo(t.titulo);
    if (n !== t.titulo) void ops.editar(t.id, { titulo: n });
  };
  const seguir = (s: boolean) => {
    cambiarDetalle((d) => ({ ...d, sigo: s }));
    correr(() => seguirTarjeta(t.id, s));
  };

  const portadaColor = t.portada?.startsWith("c:") ? colorEtiqueta(t.portada.slice(2)).fondo : null;
  const propias = ops.etiquetas.filter((e) => t.etiquetas.includes(e.id));
  const estadoFecha = estadoVencimiento(t.vence, t.completada);
  const alternar = (p: Panel) => setPanel(panel === p ? null : p);

  return (
    <Ventana titulo={t.titulo} cerrar={cerrar} ancho="max-w-4xl" sinTitulo>
      {(t.portadaUrl || portadaColor) && (
        <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-t-2xl sm:rounded-t-xl" style={{ background: portadaColor ?? "#e7e5e4" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- link temporal de Storage */}
          {t.portadaUrl && <img src={t.portadaUrl} alt="" className="h-full object-contain" />}
        </div>
      )}
      <div className="p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="mt-2 text-stone-500" aria-hidden>▭</span>
          <div className="min-w-0 flex-1">
            <textarea
              value={titulo}
              disabled={!editable}
              onChange={(e) => setTitulo(e.target.value)}
              onBlur={guardarTitulo}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              rows={1}
              maxLength={500}
              aria-label="Título de la tarjeta"
              className="w-full resize-none rounded border-2 border-transparent bg-transparent px-1 text-xl font-semibold outline-none focus:border-sky-600 focus:bg-white"
            />
            <p className="px-1 text-sm text-stone-600">
              en la lista <span className="font-medium underline">{lista?.nombre ?? "—"}</span>
              {detalle?.sigo && <span className="ml-2" title="Seguís esta tarjeta">👁</span>}
              {t.es_plantilla && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-900">📋 Plantilla: se usa con el ícono 📋 de cada lista</span>}
              {t.archivada && <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-xs font-medium text-amber-950">Archivada: no se ve en el tablero</span>}
            </p>
          </div>
          <button type="button" onClick={cerrar} aria-label="Cerrar tarjeta" className="rounded p-1 text-2xl leading-none text-stone-500 hover:bg-stone-200">
            ×
          </button>
        </div>

        {aviso && (
          <p role="alert" className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {aviso}
            <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso">×</button>
          </p>
        )}

        <div className="mt-4 grid gap-6 md:grid-cols-[1fr_190px]">
          <div className="min-w-0 space-y-6">
            {/* Miembros, etiquetas, fechas y seguir */}
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {t.miembros.length > 0 && (
                <Bloque titulo="Miembros">
                  <div className="flex flex-wrap items-center gap-1">
                    {t.miembros.map((m) => (
                      <Avatar key={m} usuario={usuarios.find((u) => u.id === m) ?? { id: m, nombre: "?" }} tam={32} />
                    ))}
                    {editable && (
                      <button type="button" onClick={() => alternar("miembros")} aria-label="Agregar miembros" className="h-8 w-8 rounded-full bg-stone-200 text-stone-700 hover:bg-stone-300">
                        +
                      </button>
                    )}
                  </div>
                </Bloque>
              )}
              {propias.length > 0 && (
                <Bloque titulo="Etiquetas">
                  <div className="flex flex-wrap items-center gap-1">
                    {propias.map((e) => {
                      const c = colorEtiqueta(e.color);
                      return (
                        <span key={e.id} className="h-8 min-w-12 rounded px-3 text-sm font-semibold leading-8" style={{ background: c.fondo, color: c.texto }}>
                          {e.nombre}
                        </span>
                      );
                    })}
                    {editable && (
                      <button type="button" onClick={() => alternar("etiquetas")} aria-label="Agregar etiquetas" className="h-8 w-8 rounded bg-stone-200 text-stone-700 hover:bg-stone-300">
                        +
                      </button>
                    )}
                  </div>
                </Bloque>
              )}
              {(t.vence || t.inicio) && (
                <Bloque titulo={t.inicio && t.vence ? "Fechas" : t.vence ? "Vencimiento" : "Fecha de inicio"}>
                  <div className="flex items-center gap-2 rounded bg-stone-200/70 px-2 py-1 text-sm">
                    {t.vence && (
                      <input type="checkbox" checked={t.completada} disabled={!editable} onChange={(e) => void ops.editar(t.id, { completada: e.target.checked })} className="h-4 w-4" aria-label="Completada" />
                    )}
                    <button type="button" disabled={!editable} onClick={() => alternar("fechas")}>
                      {t.inicio && new Date(`${t.inicio}T12:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                      {t.inicio && t.vence && " – "}
                      {t.vence && new Date(t.vence).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: ZONA })}
                    </button>
                    {estadoFecha && estadoFecha !== "normal" && (
                      <span className={`rounded px-1.5 text-xs font-semibold ${COLOR_VENCIMIENTO[estadoFecha]}`}>
                        {estadoFecha === "completada" ? "Completada" : estadoFecha === "vencida" ? "Vencida" : "Vence pronto"}
                      </span>
                    )}
                  </div>
                </Bloque>
              )}
              {!t.vence && (
                <label className="flex items-center gap-2 self-end text-sm">
                  <input type="checkbox" checked={t.completada} disabled={!editable} onChange={(e) => void ops.editar(t.id, { completada: e.target.checked })} className="h-4 w-4" />
                  Completada
                </label>
              )}
              {detalle && (
                <Bloque titulo="Notificaciones">
                  <button type="button" onClick={() => seguir(!detalle.sigo)} className="rounded bg-stone-200/80 px-3 py-1 text-sm font-medium hover:bg-stone-300">
                    👁 {detalle.sigo ? "Siguiendo ✓" : "Seguir"}
                  </button>
                </Bloque>
              )}
            </div>

            <Descripcion t={t} editable={editable} ops={ops} nombres={usuarios.map((u) => u.nombre)} recargar={() => router.refresh()} />

            {!detalle ? (
              <div className="space-y-2" aria-label="Cargando">
                <div className="esqueleto h-5 w-40 rounded" />
                <div className="esqueleto h-16 rounded" />
              </div>
            ) : (
              <>
                {detalle.checklists.map((c) => (
                  <ChecklistVista key={c.id} c={c} editable={editable} usuarios={candidatos} cambiarDetalle={cambiarDetalle} correr={correr} />
                ))}
                {detalle.adjuntos.length > 0 && (
                  <Adjuntos
                    adjuntos={detalle.adjuntos}
                    t={t}
                    editable={editable}
                    puedeBorrar={(a) => a.subido_por === yo || rol === "admin"}
                    nombre={nombre}
                    ops={ops}
                    cambiarDetalle={cambiarDetalle}
                    correr={correr}
                    agregar={() => alternar("adjunto")}
                  />
                )}
                <Conversacion
                  t={t}
                  detalle={detalle}
                  editable={editable}
                  yo={yo}
                  esAdmin={rol === "admin"}
                  usuarios={usuarios}
                  candidatos={candidatos}
                  nombre={nombre}
                  cambiarDetalle={cambiarDetalle}
                  correr={correr}
                  listas={listas}
                />
              </>
            )}
          </div>

          {/* Columna de acciones (como en Trello) */}
          <div className="space-y-1.5 text-sm">
            {editable && (
              <>
                <p className="text-xs font-semibold text-stone-600">Añadir a la tarjeta</p>
                <BotonLateral onClick={() => alternar("miembros")}>👤 Miembros</BotonLateral>
                {panel === "miembros" && <PanelMiembros t={t} candidatos={candidatos} ops={ops} />}
                <BotonLateral onClick={() => alternar("etiquetas")}>🏷 Etiquetas</BotonLateral>
                {panel === "etiquetas" && <PanelEtiquetas t={t} ops={ops} tableroId={tableroId} correr={correr} />}
                <BotonLateral onClick={() => alternar("checklist")}>☑ Checklist</BotonLateral>
                {panel === "checklist" && detalle && (
                  <PanelNuevaChecklist
                    crear={(n) => {
                      const c: Checklist = { id: nuevoId(), nombre: n, posicion: posicionEntre(detalle.checklists.at(-1)?.posicion, undefined), items: [] };
                      cambiarDetalle((d) => ({ ...d, checklists: [...d.checklists, c] }));
                      correr(() => crearChecklist(t.id, c.id, n, c.posicion));
                      setPanel(null);
                    }}
                  />
                )}
                <BotonLateral onClick={() => alternar("fechas")}>🕒 Fechas</BotonLateral>
                {panel === "fechas" && <PanelFechas t={t} ops={ops} cerrar={() => setPanel(null)} />}
                <BotonLateral onClick={() => alternar("adjunto")}>📎 Adjunto</BotonLateral>
                {panel === "adjunto" && detalle && <PanelAdjunto t={t} cambiarDetalle={cambiarDetalle} cerrar={() => setPanel(null)} setAviso={setAviso} />}
                <BotonLateral onClick={() => alternar("portada")}>🖼 Portada</BotonLateral>
                {panel === "portada" && <PanelPortada t={t} adjuntos={detalle?.adjuntos ?? []} ops={ops} />}
              </>
            )}

            {editable && botones.length > 0 && (
              <>
                <p className="pt-3 text-xs font-semibold text-stone-600">Botones</p>
                {botones.map((b) => (
                  <BotonLateral
                    key={b.id}
                    onClick={() => {
                      usarBoton(b.id);
                      setTimeout(cargar, 900);
                    }}
                  >
                    ▶ {b.nombre}
                  </BotonLateral>
                ))}
              </>
            )}

            <p className="pt-3 text-xs font-semibold text-stone-600">Acciones</p>
            {editable && (
              <>
                <BotonLateral onClick={() => alternar("mover")}>→ Mover</BotonLateral>
                {panel === "mover" && (
                  <Caja>
                    {listas.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        disabled={l.id === t.lista_id}
                        onClick={() => {
                          ops.mover(t.id, l.id);
                          setPanel(null);
                        }}
                        className="block w-full rounded px-2 py-1 text-left hover:bg-stone-100 disabled:text-stone-400"
                      >
                        {l.nombre} {l.id === t.lista_id && "(actual)"}
                      </button>
                    ))}
                  </Caja>
                )}
                <BotonLateral onClick={() => alternar("copiar")}>⧉ Copiar</BotonLateral>
                {panel === "copiar" && <PanelCopiar t={t} listas={listas} ops={ops} cerrar={() => setPanel(null)} />}
              </>
            )}
            {detalle && <BotonLateral onClick={() => seguir(!detalle.sigo)}>👁 {detalle.sigo ? "Dejar de seguir" : "Seguir"}</BotonLateral>}
            {editable && (
              <BotonLateral
                onClick={() => {
                  ops.local(t.id, { es_plantilla: !t.es_plantilla });
                  correr(() => marcarPlantillaTarjeta(t.id, !t.es_plantilla), () => ops.local(t.id, { es_plantilla: t.es_plantilla }));
                }}
              >
                📋 {t.es_plantilla ? "Dejar de ser plantilla" : "Convertir en plantilla"}
              </BotonLateral>
            )}
            <BotonLateral
              onClick={() => {
                void navigator.clipboard?.writeText(`${window.location.origin}/tareas/${tableroId}?tarjeta=${t.id}`);
                setAviso("Enlace copiado: solo lo abren quienes tienen acceso a este tablero.");
              }}
            >
              🔗 Compartir enlace
            </BotonLateral>
            {editable &&
              (t.archivada ? (
                <>
                  <BotonLateral onClick={() => ops.archivar(t.id, false)}>↺ Restaurar</BotonLateral>
                  <BotonLateral
                    peligro
                    onClick={() => {
                      if (!window.confirm("¿Eliminar la tarjeta para siempre? Se borran sus checklists, adjuntos y comentarios. No se puede deshacer.")) return;
                      iniciar(async () => {
                        const r = await eliminarTarjeta(t.id);
                        if (r.error) return setAviso(r.error);
                        cerrar();
                        ops.quitarDelTablero(t.id);
                      });
                    }}
                  >
                    🗑 Eliminar
                  </BotonLateral>
                </>
              ) : (
                <BotonLateral onClick={() => ops.archivar(t.id, true)}>🗄 Archivar</BotonLateral>
              ))}
          </div>
        </div>
      </div>
    </Ventana>
  );
}

// ─── Piezas ──────────────────────────────────────────────────────────────

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-stone-600">{titulo}</p>
      {children}
    </div>
  );
}

function Caja({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-2 shadow">{children}</div>;
}

function BotonLateral({ children, onClick, peligro }: { children: React.ReactNode; onClick: () => void; peligro?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`block w-full rounded px-3 py-1.5 text-left font-medium ${peligro ? "bg-red-600 text-white hover:bg-red-700" : "bg-stone-200/80 text-stone-800 hover:bg-stone-300"}`}>
      {children}
    </button>
  );
}

function PanelMiembros({ t, candidatos, ops }: { t: Tarjeta; candidatos: Usuario[]; ops: Operaciones }) {
  const [q, setQ] = useState("");
  const lista = candidatos.filter((u) => u.nombre.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Caja>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar miembros…" aria-label="Buscar miembros" className="campo py-1 text-sm" />
      {lista.length === 0 && <p className="text-xs text-stone-500">Nadie con ese nombre. Los integrantes se agregan desde el menú del tablero.</p>}
      {lista.map((u) => {
        const sel = t.miembros.includes(u.id);
        return (
          <button key={u.id} type="button" onClick={() => ops.asignar(t.id, u.id, !sel)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 hover:bg-stone-100">
            <Avatar usuario={u} tam={24} />
            <span className="flex-1 truncate text-left">{u.nombre}</span>
            {sel && <span className="text-sky-700">✓</span>}
          </button>
        );
      })}
    </Caja>
  );
}

function PanelEtiquetas({ t, ops, tableroId, correr }: { t: Tarjeta; ops: Operaciones; tableroId: string; correr: (a: () => Promise<{ error?: string }>) => void }) {
  const [editando, setEditando] = useState<{ id: string | null; nombre: string; color: string } | null>(null);
  const [q, setQ] = useState("");
  if (editando) {
    const c = colorEtiqueta(editando.color);
    return (
      <Caja>
        <p className="text-center text-xs font-semibold text-stone-500">{editando.id ? "Editar etiqueta" : "Crear etiqueta"}</p>
        <div className="flex h-9 items-center justify-center rounded" style={{ background: c.fondo, color: c.texto }}>
          <span className="truncate px-2 text-sm font-semibold">{editando.nombre}</span>
        </div>
        <input autoFocus value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} maxLength={60} placeholder="Nombre (opcional)" aria-label="Nombre de la etiqueta" className="campo py-1 text-sm" />
        <div className="grid grid-cols-5 gap-1">
          {Object.entries(COLORES_ETIQUETA).map(([k, v]) => (
            <button key={k} type="button" title={v.nombre} aria-label={v.nombre} onClick={() => setEditando({ ...editando, color: k })} className={`h-7 rounded ${editando.color === k ? "ring-2 ring-stone-900 ring-offset-1" : ""}`} style={{ background: v.fondo }} />
          ))}
        </div>
        <div className="flex justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              const { id, nombre, color } = editando;
              if (id) {
                ops.setEtiquetas((l) => l.map((e) => (e.id === id ? { ...e, nombre: nombre.trim(), color } : e)));
                correr(() => editarEtiqueta(id, nombre, color));
              } else {
                const nueva = { id: nuevoId(), nombre: nombre.trim(), color, posicion: Date.now() % 1e9 };
                ops.setEtiquetas((l) => [...l, nueva]);
                correr(async () => {
                  const r = await crearEtiqueta(tableroId, nueva.id, nueva.nombre, color);
                  if (!r.error) ops.etiquetar(t.id, nueva.id, true);
                  return r;
                });
              }
              setEditando(null);
            }}
            className="rounded bg-sky-700 px-3 py-1 text-sm font-medium text-white"
          >
            {editando.id ? "Guardar" : "Crear"}
          </button>
          {editando.id && (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm("¿Borrar la etiqueta? Se quita de todas las tarjetas del tablero.")) return;
                const id = editando.id!;
                ops.setEtiquetas((l) => l.filter((e) => e.id !== id));
                correr(() => borrarEtiqueta(id));
                setEditando(null);
              }}
              className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white"
            >
              Borrar
            </button>
          )}
          <button type="button" onClick={() => setEditando(null)} className="text-sm underline">Volver</button>
        </div>
      </Caja>
    );
  }
  const lista = ops.etiquetas.filter((e) => !q.trim() || e.nombre.toLowerCase().includes(q.trim().toLowerCase()) || colorEtiqueta(e.color).nombre.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Caja>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar etiquetas…" aria-label="Buscar etiquetas" className="campo py-1 text-sm" />
      {lista.map((e) => {
        const c = colorEtiqueta(e.color);
        const puesta = t.etiquetas.includes(e.id);
        return (
          <div key={e.id} className="flex items-center gap-1.5">
            <input type="checkbox" checked={puesta} onChange={() => ops.etiquetar(t.id, e.id, !puesta)} className="h-4 w-4" aria-label={`Etiqueta ${e.nombre || c.nombre}`} />
            <button type="button" onClick={() => ops.etiquetar(t.id, e.id, !puesta)} className="h-8 flex-1 truncate rounded px-2 text-left text-sm font-semibold" style={{ background: c.fondo, color: c.texto }}>
              {e.nombre}
            </button>
            <button type="button" onClick={() => setEditando({ id: e.id, nombre: e.nombre, color: e.color })} aria-label="Editar etiqueta" className="rounded px-1.5 py-1 text-stone-500 hover:bg-stone-100">
              ✎
            </button>
          </div>
        );
      })}
      <button type="button" onClick={() => setEditando({ id: null, nombre: q.trim(), color: "verde" })} className="w-full rounded bg-stone-200 py-1.5 text-sm font-medium hover:bg-stone-300">
        Crear una etiqueta nueva
      </button>
    </Caja>
  );
}

function PanelFechas({ t, ops, cerrar }: { t: Tarjeta; ops: Operaciones; cerrar: () => void }) {
  const [conInicio, setConInicio] = useState(!!t.inicio);
  const [inicio, setInicio] = useState(() => t.inicio ?? new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10));
  const [conVence, setConVence] = useState(!!t.vence || !t.inicio);
  const p = partes(t.vence);
  const [fecha, setFecha] = useState(() => p.fecha || new Date(Date.now() + 21 * 3600 * 1000).toISOString().slice(0, 10));
  const [hora, setHora] = useState(p.hora || "18:00");
  const [recordatorio, setRecordatorio] = useState<number | null>(t.recordatorio ?? 1440);
  const [error, setError] = useState<string | null>(null);
  return (
    <Caja>
      <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
        <input type="checkbox" checked={conInicio} onChange={(e) => setConInicio(e.target.checked)} className="h-4 w-4" /> Fecha de inicio
      </label>
      <input type="date" value={inicio} disabled={!conInicio} onChange={(e) => setInicio(e.target.value)} aria-label="Fecha de inicio" className="campo py-1 text-sm" />
      <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
        <input type="checkbox" checked={conVence} onChange={(e) => setConVence(e.target.checked)} className="h-4 w-4" /> Fecha de vencimiento
      </label>
      <div className="flex gap-1">
        <input type="date" value={fecha} disabled={!conVence} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha de vencimiento" className="campo py-1 text-sm" />
        <input type="time" value={hora} disabled={!conVence} onChange={(e) => setHora(e.target.value)} aria-label="Hora de vencimiento" className="campo w-24 py-1 text-sm" />
      </div>
      <label className="block text-xs font-semibold text-stone-600">
        Recordatorio
        <select value={recordatorio ?? ""} disabled={!conVence} onChange={(e) => setRecordatorio(e.target.value === "" ? null : Number(e.target.value))} className="campo mt-1 py-1 text-sm">
          {RECORDATORIOS.map((r) => (
            <option key={r.nombre} value={r.valor ?? ""}>{r.nombre}</option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-stone-500">El aviso les llega a los miembros y a quienes siguen la tarjeta.</p>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            const vence = conVence ? aIso(fecha, hora) : null;
            const ini = conInicio ? inicio : null;
            if (ini && vence && ini > fecha) return setError("El inicio no puede ser posterior al vencimiento");
            const r = await ops.editar(t.id, { inicio: ini, vence, recordatorio: conVence ? recordatorio : null });
            if (r.error) return setError(r.error);
            cerrar();
          }}
          className="rounded bg-sky-700 px-3 py-1 text-sm font-medium text-white"
        >
          Guardar
        </button>
        {(t.vence || t.inicio) && (
          <button
            type="button"
            onClick={() => {
              void ops.editar(t.id, { inicio: null, vence: null, recordatorio: null });
              cerrar();
            }}
            className="rounded px-3 py-1 text-sm hover:bg-stone-200"
          >
            Quitar
          </button>
        )}
      </div>
    </Caja>
  );
}

function PanelNuevaChecklist({ crear }: { crear: (nombre: string) => void }) {
  const [nombre, setNombre] = useState("Checklist");
  return (
    <Caja>
      <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && nombre.trim() && crear(nombre.trim())} maxLength={200} aria-label="Título de la checklist" className="campo py-1 text-sm" />
      <button type="button" onClick={() => nombre.trim() && crear(nombre.trim())} className="rounded bg-sky-700 px-3 py-1 text-sm font-medium text-white">
        Añadir
      </button>
    </Caja>
  );
}

function PanelPortada({ t, adjuntos, ops }: { t: Tarjeta; adjuntos: Adjunto[]; ops: Operaciones }) {
  const imagenes = adjuntos.filter((a) => a.ruta && esImagen(a.mime));
  const poner = (portada: string | null, url: string | null = null) => {
    ops.local(t.id, { portadaUrl: url });
    void ops.editar(t.id, { portada });
  };
  return (
    <Caja>
      <p className="text-xs font-semibold text-stone-600">Colores</p>
      <div className="grid grid-cols-5 gap-1">
        {COLORES_PORTADA.map((c) => (
          <button key={c} type="button" aria-label={`Portada ${colorEtiqueta(c).nombre}`} onClick={() => poner(`c:${c}`)} className={`h-8 rounded ${t.portada === `c:${c}` ? "ring-2 ring-stone-900 ring-offset-1" : ""}`} style={{ background: colorEtiqueta(c).fondo }} />
        ))}
      </div>
      {imagenes.length > 0 && (
        <>
          <p className="text-xs font-semibold text-stone-600">Imágenes adjuntas</p>
          <div className="grid grid-cols-2 gap-1">
            {imagenes.map((a) => (
              <button key={a.id} type="button" onClick={() => poner(`a:${a.id}`, a.enlace)} className={`h-14 overflow-hidden rounded bg-stone-100 ${t.portada === `a:${a.id}` ? "ring-2 ring-stone-900 ring-offset-1" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- link temporal de Storage */}
                {a.enlace && <img src={a.enlace} alt={a.nombre} className="h-full w-full object-cover" />}
              </button>
            ))}
          </div>
        </>
      )}
      {imagenes.length === 0 && <p className="text-[11px] text-stone-500">Adjuntá una imagen para usarla de portada.</p>}
      {t.portada && (
        <button type="button" onClick={() => poner(null)} className="w-full rounded bg-stone-200 py-1 text-sm hover:bg-stone-300">
          Quitar portada
        </button>
      )}
    </Caja>
  );
}

function PanelCopiar({ t, listas, ops, cerrar }: { t: Tarjeta; listas: Lista[]; ops: Operaciones; cerrar: () => void }) {
  const [titulo, setTitulo] = useState(t.titulo);
  const [lista, setLista] = useState(t.lista_id);
  const [conservar, setConservar] = useState({ checklists: true, etiquetas: true, miembros: true });
  return (
    <Caja>
      <label className="block text-xs font-semibold text-stone-600">
        Título
        <textarea value={titulo} onChange={(e) => setTitulo(e.target.value)} rows={2} maxLength={500} className="campo mt-1 py-1 text-sm" />
      </label>
      <p className="text-xs font-semibold text-stone-600">Mantener…</p>
      {(
        [
          ["checklists", "Checklists (sin marcar)"],
          ["etiquetas", "Etiquetas"],
          ["miembros", "Miembros"],
        ] as const
      ).map(([k, n]) => (
        <label key={k} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={conservar[k]} onChange={(e) => setConservar({ ...conservar, [k]: e.target.checked })} className="h-4 w-4" />
          {n}
        </label>
      ))}
      <label className="block text-xs font-semibold text-stone-600">
        Lista
        <select value={lista} onChange={(e) => setLista(e.target.value)} className="campo mt-1 py-1 text-sm">
          {listas.map((l) => (
            <option key={l.id} value={l.id}>{l.nombre}</option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-stone-500">Es una tarea nueva: no copia comentarios, adjuntos ni el estado completado.</p>
      <button
        type="button"
        onClick={() => {
          ops.duplicar(t.id, lista, titulo, conservar);
          cerrar();
        }}
        className="rounded bg-sky-700 px-3 py-1 text-sm font-medium text-white"
      >
        Crear tarjeta
      </button>
    </Caja>
  );
}

// ─── Descripción ─────────────────────────────────────────────────────────

const BOTONES_FORMATO = [
  { texto: "B", nombre: "Negrita", antes: "**", despues: "**", linea: false, clase: "font-bold" },
  { texto: "I", nombre: "Cursiva", antes: "*", despues: "*", linea: false, clase: "italic" },
  { texto: "H", nombre: "Título", antes: "## ", despues: "", linea: true, clase: "" },
  { texto: "• Lista", nombre: "Lista", antes: "- ", despues: "", linea: true, clase: "" },
  { texto: "1. Lista", nombre: "Lista numerada", antes: "1. ", despues: "", linea: true, clase: "" },
  { texto: "🔗 Enlace", nombre: "Enlace", antes: "[", despues: "](https://)", linea: false, clase: "" },
];

/**
 * Descripción con formato. Mientras se escribe, el borrador se guarda en el
 * navegador (no se pierde si se cierra). Al guardar se verifica que nadie la
 * haya cambiado mientras tanto; si pasó, se avisa en vez de pisar.
 */
function Descripcion({ t, editable, ops, nombres, recargar }: { t: Tarjeta; editable: boolean; ops: Operaciones; nombres: string[]; recargar: () => void }) {
  const clave = `tareas:borrador:${t.id}`;
  const [texto, setTexto] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const [borrador, setBorrador] = useState<string | null>(null);
  useEffect(() => {
    try {
      const b = localStorage.getItem(clave);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- borrador guardado en el navegador
      if (b !== null && b !== (t.descripcion ?? "")) setBorrador(b);
    } catch {}
  }, [clave, t.descripcion]);

  const cambiar = (v: string) => {
    setTexto(v);
    try {
      localStorage.setItem(clave, v);
    } catch {}
  };
  const limpiar = () => {
    setTexto(null);
    setBorrador(null);
    setConflicto(false);
    try {
      localStorage.removeItem(clave);
    } catch {}
  };
  const guardar = async (forzar = false) => {
    if (texto === null) return;
    setGuardando(true);
    const r = await ops.editar(t.id, { descripcion: texto.trim() || null }, !forzar);
    setGuardando(false);
    if (r.conflicto) return setConflicto(true);
    if (!r.error) limpiar();
  };
  /** Envuelve la selección (negrita, cursiva) o agrega un prefijo a la línea (títulos, listas). */
  const aplicar = (antes: string, despues = "", linea = false) => {
    const el = area.current;
    if (!el || texto === null) return;
    const { selectionStart: a, selectionEnd: b } = el;
    let nuevo: string;
    if (linea) {
      const inicio = texto.lastIndexOf("\n", a - 1) + 1;
      nuevo = texto.slice(0, inicio) + antes + texto.slice(inicio);
    } else nuevo = texto.slice(0, a) + antes + (texto.slice(a, b) || "texto") + despues + texto.slice(b);
    cambiar(nuevo);
    requestAnimationFrame(() => el.focus());
  };

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 font-semibold">≡ Descripción</h3>
      {borrador !== null && texto === null && (
        <p className="mb-2 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-900">
          Tenés un borrador sin guardar.{" "}
          <button type="button" className="font-medium underline" onClick={() => setTexto(borrador)}>Retomarlo</button> ·{" "}
          <button type="button" className="underline" onClick={limpiar}>Descartarlo</button>
        </p>
      )}
      {texto !== null ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1 rounded-t border border-b-0 border-stone-300 bg-white p-1 text-sm">
            {BOTONES_FORMATO.map((b) => (
              <button key={b.nombre} type="button" title={b.nombre} onMouseDown={(e) => e.preventDefault()} onClick={() => aplicar(b.antes, b.despues, b.linea)} className={`rounded px-2 py-0.5 hover:bg-stone-100 ${b.clase}`}>
                {b.texto}
              </button>
            ))}
          </div>
          <textarea
            ref={area}
            autoFocus
            value={texto}
            onChange={(e) => cambiar(e.target.value)}
            onPaste={(e) => {
              // Pegado desde Word / Google Docs / una web: se conserva el formato.
              const html = e.clipboardData.getData("text/html");
              if (!html) return;
              const convertido = htmlAFormato(html);
              if (!convertido) return;
              e.preventDefault();
              const el = e.currentTarget;
              cambiar(texto.slice(0, el.selectionStart) + convertido + texto.slice(el.selectionEnd));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void guardar();
              if (e.key === "Escape") e.stopPropagation();
            }}
            rows={10}
            maxLength={20000}
            placeholder="Añadí una descripción más detallada…"
            aria-label="Descripción"
            className="-mt-2 block w-full rounded-b border border-stone-300 bg-white p-2 font-mono text-sm outline-none focus:border-sky-600"
          />
          {conflicto ? (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p>Otra persona cambió esta tarjeta mientras escribías. Tu texto sigue acá (no se perdió).</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={recargar} className="rounded bg-white px-3 py-1 font-medium ring-1 ring-amber-300">
                  Ver la versión nueva (mi borrador queda guardado)
                </button>
                <button type="button" onClick={() => void guardar(true)} className="rounded bg-amber-600 px-3 py-1 font-medium text-white">
                  Guardar la mía igual
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" disabled={guardando} onClick={() => void guardar()} className="rounded bg-sky-700 px-3 py-1.5 text-sm font-medium text-white">
                {guardando ? "Guardando…" : "Guardar"}
              </button>
              <button type="button" onClick={limpiar} className="rounded px-3 py-1.5 text-sm hover:bg-stone-200">
                Cancelar
              </button>
              <span className="text-[11px] text-stone-500">**negrita**, *cursiva*, # título, - lista, [texto](enlace) · Ctrl+Enter guarda</span>
            </div>
          )}
          {texto.trim() && (
            <details className="rounded border border-stone-200 bg-white p-2">
              <summary className="cursor-pointer text-xs text-stone-500">Vista previa</summary>
              <div className="mt-2">
                <Formato texto={texto} nombres={nombres} />
              </div>
            </details>
          )}
        </div>
      ) : t.descripcion ? (
        <div onClick={(e) => editable && !(e.target as HTMLElement).closest("a") && cambiar(t.descripcion ?? "")} className={`rounded px-1 ${editable ? "cursor-pointer hover:bg-stone-100" : ""}`}>
          <Formato texto={t.descripcion} nombres={nombres} />
        </div>
      ) : (
        editable && (
          <button type="button" onClick={() => cambiar("")} className="block min-h-14 w-full rounded-lg bg-stone-200/70 px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-200">
            Añadí una descripción más detallada…
          </button>
        )
      )}
    </section>
  );
}

// ─── Checklists ──────────────────────────────────────────────────────────

function ChecklistVista({
  c,
  editable,
  usuarios,
  cambiarDetalle,
  correr,
}: {
  c: Checklist;
  editable: boolean;
  usuarios: Usuario[];
  cambiarDetalle: (f: (d: DetalleTarjeta) => DetalleTarjeta) => void;
  correr: (a: () => Promise<{ error?: string }>) => void;
}) {
  const [nombre, setNombre] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [ocultarHechos, setOcultarHechos] = useState(false);
  const hechos = c.items.filter((i) => i.hecho).length;
  const pct = c.items.length ? Math.round((hechos / c.items.length) * 100) : 0;
  const editarItems = (f: (items: Checklist["items"]) => Checklist["items"]) =>
    cambiarDetalle((d) => ({ ...d, checklists: d.checklists.map((x) => (x.id === c.id ? { ...x, items: f(x.items) } : x)) }));
  const agregar = () => {
    const textoItem = nuevo?.trim();
    if (!textoItem) return;
    const item = { id: nuevoId(), checklist_id: c.id, texto: textoItem, hecho: false, posicion: posicionEntre(c.items.at(-1)?.posicion, undefined), responsable_id: null, vence: null };
    editarItems((items) => [...items, item]);
    correr(() => crearItem(c.id, item.id, item.texto, item.posicion));
    setNuevo("");
  };
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= c.items.length) return;
    const orden = [...c.items];
    [orden[i], orden[j]] = [orden[j], orden[i]];
    const posicion = posicionEntre(orden[j - 1]?.posicion, orden[j + 1]?.posicion);
    orden[j] = { ...orden[j], posicion };
    editarItems(() => orden);
    correr(() => editarItem(orden[j].id, { posicion }));
  };
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span aria-hidden>☑</span>
        {nombre !== null ? (
          <input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={() => {
              if (nombre.trim() && nombre.trim() !== c.nombre) {
                const n = nombre.trim();
                cambiarDetalle((d) => ({ ...d, checklists: d.checklists.map((x) => (x.id === c.id ? { ...x, nombre: n } : x)) }));
                correr(() => editarChecklist(c.id, n));
              }
              setNombre(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            maxLength={200}
            aria-label="Título de la checklist"
            className="campo flex-1 py-1 font-semibold"
          />
        ) : (
          <h3 onClick={() => editable && setNombre(c.nombre)} className={`flex-1 font-semibold ${editable ? "cursor-pointer" : ""}`}>
            {c.nombre}
          </h3>
        )}
        {hechos > 0 && (
          <button type="button" onClick={() => setOcultarHechos(!ocultarHechos)} className="rounded bg-stone-200/80 px-2 py-1 text-xs hover:bg-stone-300">
            {ocultarHechos ? `Mostrar marcados (${hechos})` : "Ocultar marcados"}
          </button>
        )}
        {editable && (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`¿Eliminar la checklist "${c.nombre}"?`)) return;
              cambiarDetalle((d) => ({ ...d, checklists: d.checklists.filter((x) => x.id !== c.id) }));
              correr(() => borrarChecklist(c.id));
            }}
            className="rounded bg-stone-200/80 px-2 py-1 text-xs hover:bg-stone-300"
          >
            Eliminar
          </button>
        )}
      </div>
      <div className="mb-2 flex items-center gap-2">
        <span className="w-9 text-right text-xs text-stone-600">{pct}%</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
          <div className={`h-full transition-all ${pct === 100 ? "bg-green-600" : "bg-sky-600"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="space-y-0.5">
        {c.items.map((i, k) =>
          ocultarHechos && i.hecho ? null : (
            <ItemVista key={i.id} i={i} editable={editable} usuarios={usuarios} primero={k === 0} ultimo={k === c.items.length - 1} mover={(d) => mover(k, d)} editarItems={editarItems} correr={correr} />
          ),
        )}
      </ul>
      {editable &&
        (nuevo !== null ? (
          <div className="mt-1 space-y-1 pl-8">
            <textarea
              autoFocus
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregar();
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setNuevo(null);
                }
              }}
              rows={2}
              maxLength={1000}
              placeholder="Añadí un elemento"
              aria-label="Elemento nuevo"
              className="campo text-sm"
            />
            <div className="flex gap-2">
              <button type="button" onClick={agregar} className="rounded bg-sky-700 px-3 py-1 text-sm font-medium text-white">Añadir</button>
              <button type="button" onClick={() => setNuevo(null)} className="rounded px-3 py-1 text-sm hover:bg-stone-200">Cancelar</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setNuevo("")} className="ml-8 mt-1 rounded bg-stone-200/80 px-3 py-1 text-sm hover:bg-stone-300">
            Añadir un elemento
          </button>
        ))}
    </section>
  );
}

function ItemVista({
  i,
  editable,
  usuarios,
  primero,
  ultimo,
  mover,
  editarItems,
  correr,
}: {
  i: Checklist["items"][number];
  editable: boolean;
  usuarios: Usuario[];
  primero: boolean;
  ultimo: boolean;
  mover: (d: -1 | 1) => void;
  editarItems: (f: (items: Checklist["items"]) => Checklist["items"]) => void;
  correr: (a: () => Promise<{ error?: string }>) => void;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const cambiar = (cambios: Partial<Checklist["items"][number]>) => {
    editarItems((items) => items.map((x) => (x.id === i.id ? { ...x, ...cambios } : x)));
    correr(() => editarItem(i.id, cambios));
  };
  const responsable = usuarios.find((u) => u.id === i.responsable_id);
  return (
    <li className="group flex items-start gap-2 rounded px-1 py-1 hover:bg-stone-100">
      <input type="checkbox" checked={i.hecho} disabled={!editable} onChange={(e) => cambiar({ hecho: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0" aria-label={i.texto} />
      <div className="min-w-0 flex-1">
        {texto !== null ? (
          <textarea
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => {
              if (texto.trim() && texto.trim() !== i.texto) cambiar({ texto: texto.trim() });
              setTexto(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === "Escape") e.stopPropagation();
            }}
            rows={2}
            maxLength={1000}
            aria-label="Texto del elemento"
            className="campo text-sm"
          />
        ) : (
          <p onClick={() => editable && setTexto(i.texto)} className={`break-words text-sm ${i.hecho ? "text-stone-500 line-through" : ""} ${editable ? "cursor-pointer" : ""}`}>
            {i.texto}
          </p>
        )}
        {(responsable || i.vence) && (
          <p className="mt-0.5 flex items-center gap-2 text-xs text-stone-600">
            {responsable && (
              <span className="flex items-center gap-1">
                <Avatar usuario={responsable} tam={18} /> {responsable.nombre}
              </span>
            )}
            {i.vence && <span>🕒 {new Date(`${i.vence}T12:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}</span>}
          </p>
        )}
        {menu && editable && (
          <div className="mt-1 flex flex-wrap items-center gap-2 rounded border border-stone-200 bg-white p-2 text-xs">
            <label>
              Responsable{" "}
              <select value={i.responsable_id ?? ""} onChange={(e) => cambiar({ responsable_id: e.target.value || null })} className="campo inline w-auto py-0.5 text-xs">
                <option value="">Nadie</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </label>
            <label>
              Fecha <input type="date" value={i.vence ?? ""} onChange={(e) => cambiar({ vence: e.target.value || null })} className="campo inline w-auto py-0.5 text-xs" />
            </label>
            <button type="button" disabled={primero} onClick={() => mover(-1)} className="rounded px-1.5 hover:bg-stone-100 disabled:opacity-30" aria-label="Subir">↑</button>
            <button type="button" disabled={ultimo} onClick={() => mover(1)} className="rounded px-1.5 hover:bg-stone-100 disabled:opacity-30" aria-label="Bajar">↓</button>
            <button
              type="button"
              onClick={() => {
                editarItems((items) => items.filter((x) => x.id !== i.id));
                correr(() => borrarItem(i.id));
              }}
              className="text-red-700 underline"
            >
              Eliminar
            </button>
          </div>
        )}
      </div>
      {editable && (
        <button type="button" onClick={() => setMenu(!menu)} aria-label="Opciones del elemento" className="rounded px-1.5 text-stone-500 opacity-100 hover:bg-stone-200 sm:opacity-0 sm:group-hover:opacity-100">
          ⋯
        </button>
      )}
    </li>
  );
}

// ─── Adjuntos ────────────────────────────────────────────────────────────

function PanelAdjunto({
  t,
  cambiarDetalle,
  cerrar,
  setAviso,
}: {
  t: Tarjeta;
  cambiarDetalle: (f: (d: DetalleTarjeta) => DetalleTarjeta) => void;
  cerrar: () => void;
  setAviso: (s: string | null) => void;
}) {
  const [url, setUrl] = useState("");
  const [nombre, setNombre] = useState("");
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const subir = async (archivos: FileList | null) => {
    if (!archivos?.length) return;
    const supabase = crearClienteNavegador();
    for (const archivo of [...archivos]) {
      setSubiendo(archivo.name);
      const p = await prepararAdjunto(t.id, archivo.name, archivo.size);
      if (p.error || !p.ruta || !p.token) {
        setAviso(`${archivo.name}: ${p.error ?? "no se pudo subir"}`);
        continue;
      }
      const { error } = await supabase.storage.from("tareas").uploadToSignedUrl(p.ruta, p.token, archivo, { contentType: archivo.type || "application/octet-stream" });
      if (error) {
        setAviso(`${archivo.name}: no se pudo subir`);
        continue;
      }
      const r = await confirmarAdjunto(t.id, p.ruta, archivo.name, archivo.type, archivo.size);
      if (r.error || !r.id) {
        setAviso(`${archivo.name}: ${r.error ?? "no se pudo adjuntar"}`);
        continue;
      }
      const nuevo: Adjunto = { id: r.id, nombre: archivo.name, ruta: p.ruta, url: null, mime: archivo.type, tamano: archivo.size, subido_por: null, creado_en: new Date().toISOString(), enlace: URL.createObjectURL(archivo) };
      cambiarDetalle((d) => ({ ...d, adjuntos: [nuevo, ...d.adjuntos] }));
    }
    setSubiendo(null);
    cerrar();
  };
  return (
    <Caja>
      <label className="block text-xs font-semibold text-stone-600">
        Archivo (hasta 25 MB)
        <input type="file" multiple onChange={(e) => void subir(e.target.files)} disabled={!!subiendo} className="mt-1 block w-full text-xs" />
      </label>
      {subiendo && <p className="text-xs text-stone-600">Subiendo {subiendo}…</p>}
      <hr className="border-stone-200" />
      <label className="block text-xs font-semibold text-stone-600">
        Enlace web
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="campo mt-1 py-1 text-sm" />
      </label>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Texto a mostrar (opcional)" aria-label="Texto del enlace" className="campo py-1 text-sm" />
      <button
        type="button"
        disabled={!url.trim()}
        onClick={async () => {
          const r = await adjuntarEnlace(t.id, url, nombre);
          if (r.error || !r.id) return setAviso(r.error ?? "No se pudo adjuntar");
          const nuevo: Adjunto = { id: r.id, nombre: nombre.trim() || url.trim(), ruta: null, url: url.trim(), mime: null, tamano: null, subido_por: null, creado_en: new Date().toISOString(), enlace: url.trim() };
          cambiarDetalle((d) => ({ ...d, adjuntos: [nuevo, ...d.adjuntos] }));
          cerrar();
        }}
        className="rounded bg-sky-700 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
      >
        Adjuntar enlace
      </button>
    </Caja>
  );
}

function Adjuntos({
  adjuntos,
  t,
  editable,
  puedeBorrar,
  nombre,
  ops,
  cambiarDetalle,
  correr,
  agregar,
}: {
  adjuntos: Adjunto[];
  t: Tarjeta;
  editable: boolean;
  puedeBorrar: (a: Adjunto) => boolean;
  nombre: (id: string | null) => string;
  ops: Operaciones;
  cambiarDetalle: (f: (d: DetalleTarjeta) => DetalleTarjeta) => void;
  correr: (a: () => Promise<{ error?: string }>) => void;
  agregar: () => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">📎 Adjuntos</h3>
        {editable && (
          <button type="button" onClick={agregar} className="rounded bg-stone-200/80 px-2 py-1 text-xs hover:bg-stone-300">
            Añadir
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {adjuntos.map((a) => {
          const imagen = a.ruta && esImagen(a.mime);
          const extension = a.ruta ? (/\.([a-z0-9]+)$/i.exec(a.nombre)?.[1] ?? "archivo").toUpperCase() : "ENLACE";
          return (
            <li key={a.id} className="flex items-center gap-3">
              <a href={a.enlace ?? "#"} target="_blank" rel="noopener noreferrer" className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-stone-200 text-xs font-bold text-stone-600">
                {/* eslint-disable-next-line @next/next/no-img-element -- link temporal de Storage */}
                {imagen && a.enlace ? <img src={a.enlace} alt="" className="h-full w-full object-cover" /> : extension}
              </a>
              <div className="min-w-0 flex-1 text-sm">
                <a href={a.enlace ?? "#"} target="_blank" rel="noopener noreferrer" className="block truncate font-medium hover:underline">
                  {a.nombre}
                </a>
                <p className="text-xs text-stone-500">
                  {fechaHora(a.creado_en)} · {a.subido_por ? nombre(a.subido_por) : "vos"} {tamano(a.tamano) && `· ${tamano(a.tamano)}`}
                </p>
                <p className="flex flex-wrap gap-3 text-xs">
                  {a.ruta && a.enlace && (
                    <a href={a.enlace} download={a.nombre} className="underline">
                      Descargar
                    </a>
                  )}
                  {editable && imagen && (
                    <button
                      type="button"
                      onClick={() => {
                        const es = t.portada === `a:${a.id}`;
                        ops.local(t.id, { portadaUrl: es ? null : a.enlace });
                        void ops.editar(t.id, { portada: es ? null : `a:${a.id}` });
                      }}
                      className="underline"
                    >
                      {t.portada === `a:${a.id}` ? "Quitar portada" : "Hacer portada"}
                    </button>
                  )}
                  {editable && puedeBorrar(a) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`¿Eliminar "${a.nombre}"?`)) return;
                        cambiarDetalle((d) => ({ ...d, adjuntos: d.adjuntos.filter((x) => x.id !== a.id) }));
                        if (t.portada === `a:${a.id}`) ops.local(t.id, { portada: null, portadaUrl: null });
                        correr(() => borrarAdjunto(a.id));
                      }}
                      className="text-red-700 underline"
                    >
                      Eliminar
                    </button>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── Comentarios y actividad ────────────────────────────────────────────

function textoActividad(a: Actividad, nombre: (id: string | null) => string) {
  const d = a.detalle ?? {};
  switch (a.tipo) {
    case "creada":
      return `agregó esta tarjeta a ${d.lista ?? "la lista"}`;
    case "movida":
      return `movió esta tarjeta de ${d.de ?? "?"} a ${d.a ?? "?"}`;
    case "fechas":
      return d.vence ? `puso el vencimiento ${fechaHora(d.vence)}` : "quitó el vencimiento";
    case "completada":
      return "marcó la tarjeta como completada";
    case "pendiente":
      return "marcó la tarjeta como pendiente";
    case "archivada":
      return "archivó esta tarjeta";
    case "restaurada":
      return "restauró esta tarjeta";
    case "titulo":
      return `cambió el título (antes: "${d.antes ?? ""}")`;
    case "descripcion":
      return "editó la descripción";
    case "miembro_agregado":
      return `agregó a ${d.usuario ?? "alguien"}`;
    case "miembro_quitado":
      return `quitó a ${d.usuario ?? "alguien"}`;
    case "etiqueta_agregada":
      return `agregó la etiqueta ${d.nombre ?? ""}`;
    case "etiqueta_quitada":
      return `quitó la etiqueta ${d.nombre ?? ""}`;
    case "item_hecho":
      return `completó "${d.texto ?? ""}" en ${d.checklist ?? "la checklist"}`;
    case "item_pendiente":
      return `marcó "${d.texto ?? ""}" como pendiente en ${d.checklist ?? "la checklist"}`;
    case "checklist_completa":
      return `completó la checklist ${d.checklist ?? ""}`;
    case "adjunto":
      return `adjuntó ${d.nombre ?? "un archivo"}`;
    case "comentario":
      return null;
    default:
      return `${a.tipo.replace(/_/g, " ")} (${nombre(a.usuario_id)})`;
  }
}

function Conversacion({
  t,
  detalle,
  editable,
  yo,
  esAdmin,
  usuarios,
  candidatos,
  nombre,
  cambiarDetalle,
  correr,
}: {
  t: Tarjeta;
  detalle: DetalleTarjeta;
  editable: boolean;
  yo: string;
  esAdmin: boolean;
  usuarios: Usuario[];
  candidatos: Usuario[];
  nombre: (id: string | null) => string;
  cambiarDetalle: (f: (d: DetalleTarjeta) => DetalleTarjeta) => void;
  correr: (a: () => Promise<{ error?: string }>) => void;
  listas: Lista[];
}) {
  const [verActividad, setVerActividad] = useState(true);
  const [respondiendo, setRespondiendo] = useState<Comentario | null>(null);
  const nombres = usuarios.map((u) => u.nombre);
  type Entrada = { tipo: "comentario"; c: Comentario; fecha: string } | { tipo: "actividad"; a: Actividad; fecha: string };
  const entradas: Entrada[] = [
    ...detalle.comentarios.map((c) => ({ tipo: "comentario" as const, c, fecha: c.creado_en })),
    ...(verActividad ? detalle.actividad.filter((a) => a.tipo !== "comentario").map((a) => ({ tipo: "actividad" as const, a, fecha: a.creado_en })) : []),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">💬 Comentarios y actividad</h3>
        <button type="button" onClick={() => setVerActividad(!verActividad)} className="rounded bg-stone-200/80 px-2 py-1 text-xs hover:bg-stone-300">
          {verActividad ? "Ocultar detalles" : "Mostrar detalles"}
        </button>
      </div>
      {editable && (
        <NuevoComentario
          key={respondiendo?.id ?? "nuevo"}
          inicial={respondiendo ? `@${nombre(respondiendo.autor_id)} ` : ""}
          respuestaA={respondiendo}
          cancelarRespuesta={() => setRespondiendo(null)}
          candidatos={candidatos}
          clave={`tareas:comentario:${t.id}`}
          yo={yo}
          enviar={(texto) => {
            const c: Comentario = { id: nuevoId(), autor_id: yo, texto, respuesta_a: respondiendo?.id ?? null, creado_en: new Date().toISOString(), editado_en: null };
            cambiarDetalle((d) => ({ ...d, comentarios: [c, ...d.comentarios], sigo: true }));
            correr(() => comentar(t.id, c.id, texto, c.respuesta_a));
            setRespondiendo(null);
          }}
        />
      )}
      <ul className="mt-3 space-y-3">
        {entradas.map((e) =>
          e.tipo === "comentario" ? (
            <ComentarioVista
              key={e.c.id}
              c={e.c}
              original={e.c.respuesta_a ? detalle.comentarios.find((x) => x.id === e.c.respuesta_a) : undefined}
              autor={usuarios.find((u) => u.id === e.c.autor_id) ?? { id: e.c.autor_id, nombre: nombre(e.c.autor_id), email: "" }}
              propio={e.c.autor_id === yo}
              puedeBorrar={e.c.autor_id === yo || esAdmin}
              editable={editable}
              nombres={nombres}
              nombre={nombre}
              responder={() => setRespondiendo(e.c)}
              cambiarDetalle={cambiarDetalle}
              correr={correr}
            />
          ) : (
            <li key={`a${e.a.id}`} className="flex items-start gap-2 text-sm">
              <Avatar usuario={usuarios.find((u) => u.id === e.a.usuario_id) ?? { id: e.a.usuario_id ?? "x", nombre: nombre(e.a.usuario_id) }} tam={28} />
              <p className="min-w-0 flex-1 text-stone-700">
                <strong>{nombre(e.a.usuario_id)}</strong> {textoActividad(e.a, nombre)}
                <span className="block text-xs text-stone-500">{fechaHora(e.a.creado_en)}</span>
              </p>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

/** Caja para comentar, con @menciones (sugiere a los integrantes al escribir @). El borrador queda guardado. */
function NuevoComentario({
  inicial,
  respuestaA,
  cancelarRespuesta,
  candidatos,
  clave,
  yo,
  enviar,
}: {
  inicial: string;
  respuestaA: Comentario | null;
  cancelarRespuesta: () => void;
  candidatos: Usuario[];
  clave: string;
  yo: string;
  enviar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState(() => {
    if (inicial) return inicial;
    try {
      return localStorage.getItem(clave) ?? "";
    } catch {
      return "";
    }
  });
  const [activo, setActivo] = useState(!!inicial);
  const [sugerencia, setSugerencia] = useState<{ desde: number; q: string } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const cambiar = (v: string, cursor: number) => {
    setTexto(v);
    try {
      localStorage.setItem(clave, v);
    } catch {}
    const m = /(^|\s)@([^\s@]*)$/.exec(v.slice(0, cursor));
    setSugerencia(m ? { desde: cursor - m[2].length - 1, q: m[2].toLowerCase() } : null);
  };
  const opciones = sugerencia ? candidatos.filter((u) => u.id !== yo && u.nombre.toLowerCase().includes(sugerencia.q)).slice(0, 6) : [];
  const mencionar = (u: Usuario) => {
    if (!sugerencia) return;
    const cursor = area.current?.selectionStart ?? texto.length;
    const nuevo = `${texto.slice(0, sugerencia.desde)}@${u.nombre} ${texto.slice(cursor)}`;
    setTexto(nuevo);
    setSugerencia(null);
    requestAnimationFrame(() => area.current?.focus());
  };
  const mandar = () => {
    if (!texto.trim()) return;
    enviar(texto.trim());
    setTexto("");
    setActivo(false);
    try {
      localStorage.removeItem(clave);
    } catch {}
  };
  return (
    <div className="relative">
      {respuestaA && (
        <p className="mb-1 text-xs text-stone-600">
          Respondiendo un comentario ·{" "}
          <button type="button" onClick={cancelarRespuesta} className="underline">cancelar</button>
        </p>
      )}
      <textarea
        ref={area}
        autoFocus={!!inicial}
        value={texto}
        onFocus={() => setActivo(true)}
        onChange={(e) => cambiar(e.target.value, e.target.selectionStart)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) mandar();
          if (e.key === "Escape") e.stopPropagation();
        }}
        rows={activo ? 3 : 1}
        maxLength={10000}
        placeholder="Escribí un comentario… (@ para mencionar)"
        aria-label="Comentario"
        className="campo text-sm"
      />
      {opciones.length > 0 && (
        <div className="absolute z-10 mt-1 w-64 rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
          {opciones.map((u) => (
            <button key={u.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => mencionar(u)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-stone-100">
              <Avatar usuario={u} tam={22} /> {u.nombre}
            </button>
          ))}
        </div>
      )}
      {activo && (
        <div className="mt-1 flex items-center gap-2">
          <button type="button" disabled={!texto.trim()} onClick={mandar} className="rounded bg-sky-700 px-3 py-1 text-sm font-medium text-white disabled:opacity-50">
            Guardar
          </button>
          <span className="text-[11px] text-stone-500">Ctrl+Enter para enviar · los mencionados reciben un aviso</span>
        </div>
      )}
    </div>
  );
}

function ComentarioVista({
  c,
  original,
  autor,
  propio,
  puedeBorrar,
  editable,
  nombres,
  nombre,
  responder,
  cambiarDetalle,
  correr,
}: {
  c: Comentario;
  original?: Comentario;
  autor: Usuario;
  propio: boolean;
  puedeBorrar: boolean;
  editable: boolean;
  nombres: string[];
  nombre: (id: string | null) => string;
  responder: () => void;
  cambiarDetalle: (f: (d: DetalleTarjeta) => DetalleTarjeta) => void;
  correr: (a: () => Promise<{ error?: string }>) => void;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <li className="flex items-start gap-2">
      <Avatar usuario={autor} tam={32} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <strong>{autor.nombre}</strong> <span className="text-xs text-stone-500">{fechaHora(c.creado_en)}{c.editado_en && " (editado)"}</span>
        </p>
        {original && <p className="mt-0.5 truncate border-l-2 border-stone-300 pl-2 text-xs text-stone-500">En respuesta a {nombre(original.autor_id)}: {original.texto}</p>}
        {texto !== null ? (
          <div className="mt-1 space-y-1">
            <textarea autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Escape" && e.stopPropagation()} rows={3} maxLength={10000} aria-label="Editar comentario" className="campo text-sm" />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const n = texto.trim();
                  if (!n) return;
                  cambiarDetalle((d) => ({ ...d, comentarios: d.comentarios.map((x) => (x.id === c.id ? { ...x, texto: n, editado_en: new Date().toISOString() } : x)) }));
                  correr(() => editarComentario(c.id, n));
                  setTexto(null);
                }}
                className="rounded bg-sky-700 px-3 py-1 text-sm font-medium text-white"
              >
                Guardar
              </button>
              <button type="button" onClick={() => setTexto(null)} className="rounded px-3 py-1 text-sm hover:bg-stone-200">Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="mt-1 rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-stone-200">
            <Formato texto={c.texto} nombres={nombres} />
          </div>
        )}
        <p className="mt-0.5 flex gap-3 text-xs text-stone-600">
          {editable && (
            <button type="button" onClick={responder} className="underline">
              Responder
            </button>
          )}
          {propio && texto === null && (
            <button type="button" onClick={() => setTexto(c.texto)} className="underline">
              Editar
            </button>
          )}
          {puedeBorrar && (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm("¿Eliminar el comentario?")) return;
                cambiarDetalle((d) => ({ ...d, comentarios: d.comentarios.filter((x) => x.id !== c.id) }));
                correr(() => borrarComentario(c.id));
              }}
              className="underline"
            >
              Eliminar
            </button>
          )}
        </p>
      </div>
    </li>
  );
}
