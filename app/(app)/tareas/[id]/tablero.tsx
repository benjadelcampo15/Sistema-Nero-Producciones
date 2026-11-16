"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DatosTablero } from "@/lib/tareas/consultas";
import { crearLista, crearTarjeta, duplicarLista, editarLista, editarTarjeta, marcarFavorito, moverTarjeta } from "@/lib/tareas/acciones";
import { copiarTarjeta, etiquetarTarjeta, responsableTarjeta } from "@/lib/tareas/acciones-tarjeta";
import {
  COLOR_VENCIMIENTO,
  colorEtiqueta,
  estadoVencimiento,
  fondoCss,
  posicionEntre,
  textoVencimiento,
  type Etiqueta,
  type Lista,
  type Tarjeta,
  type Usuario,
} from "@/lib/tareas/tipos";
import { Avatar, Menu, OpcionMenu } from "../comunes";
import { MenuTablero, TituloTablero } from "./encabezado";
import { FiltroTablero, coincide, filtroVacio, type Filtro } from "./filtro";
import { PanelAutomatizaciones } from "./automatizaciones";
import { VistaCalendario, VistaCronograma, VistaPanel } from "./vistas";
import { tarjetaDesdePlantilla, usarBoton } from "@/lib/tareas/acciones-avanzadas";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { VentanaTarjeta } from "./tarjeta";

type Estado = { listas: Lista[]; tarjetas: Record<string, Tarjeta>; orden: Record<string, string[]> };

const nuevoId = () => crypto.randomUUID();

function armar(d: DatosTablero): Estado {
  const listas = [...d.listas].sort((a, b) => a.posicion - b.posicion);
  const tarjetas = Object.fromEntries(d.tarjetas.map((t) => [t.id, t]));
  const orden: Record<string, string[]> = {};
  for (const l of listas) orden[l.id] = [];
  for (const t of [...d.tarjetas].sort((a, b) => a.posicion - b.posicion)) if (!t.archivada && orden[t.lista_id]) orden[t.lista_id].push(t.id);
  return { listas, tarjetas, orden };
}

/** Las acciones del tablero que comparten la ventana de la tarjeta y los menús rápidos. */
export type Operaciones = {
  editar: (id: string, cambios: Partial<Tarjeta>, conVersion?: boolean) => Promise<{ error?: string; conflicto?: boolean }>;
  asignar: (id: string, usuarioId: string, asignado: boolean) => void;
  etiquetar: (id: string, etiquetaId: string, puesta: boolean) => void;
  mover: (id: string, listaId: string, arriba?: boolean) => void;
  duplicar: (id: string, listaId?: string, titulo?: string, conservar?: { checklists: boolean; etiquetas: boolean; miembros: boolean }) => void;
  archivar: (id: string, archivada: boolean) => void;
  quitarDelTablero: (id: string) => void;
  /** Cambios locales que vienen de la ventana de la tarjeta (contadores, portada). */
  local: (id: string, cambios: Partial<Tarjeta>) => void;
  /** Las etiquetas del tablero (se crean y editan desde la tarjeta). */
  etiquetas: Etiqueta[];
  setEtiquetas: (f: (e: Etiqueta[]) => Etiqueta[]) => void;
};

export function TableroKanban({ datos, yo, tarjetaInicial }: { datos: DatosTablero; yo: string; tarjetaInicial: string | null }) {
  const router = useRouter();
  const { tablero } = datos;
  const editable = tablero.rol !== "observador" && !tablero.archivado;
  const [estado, setEstado] = useState<Estado>(() => armar(datos));
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>(datos.etiquetas);
  const [filtro, setFiltro] = useState<Filtro>(filtroVacio);
  // Si el servidor trae datos nuevos (por ejemplo, después de "Actualizar"), se toman.
  const [datosPrevios, setDatosPrevios] = useState(datos);
  if (datos !== datosPrevios) {
    setDatosPrevios(datos);
    setEstado(armar(datos));
    setEtiquetas(datos.etiquetas);
  }
  const estadoRef = useRef(estado);
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  const [abierta, setAbierta] = useState<string | null>(tarjetaInicial);
  const [arrastrando, setArrastrando] = useState<{ tipo: "tarjeta" | "lista"; id: string } | null>(null);
  const origen = useRef<{ lista: string; posicion: number } | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [colapsadas, setColapsadas] = useState<Set<string>>(() => new Set());
  const [favorito, setFavorito] = useState(tablero.favorito);
  const idDnd = useId();
  const [vista, setVista] = useState<"tablero" | "calendario" | "cronograma" | "panel">("tablero");
  const [automatizaciones, setAutomatizaciones] = useState(false);
  const [menuBotones, setMenuBotones] = useState(false);
  const arrastrandoRef = useRef(false);
  useEffect(() => {
    arrastrandoRef.current = arrastrando !== null;
  }, [arrastrando]);

  // Tiempo real: si otra persona cambia algo del tablero, se actualiza solo (sin perder lo que se está escribiendo).
  useEffect(() => {
    const supabase = crearClienteNavegador();
    let espera: ReturnType<typeof setTimeout> | null = null;
    const actualizar = () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(function intentar() {
        // Mientras se arrastra, se espera a que suelte.
        if (arrastrandoRef.current) {
          espera = setTimeout(intentar, 800);
          return;
        }
        router.refresh();
      }, 700);
    };
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let cerrado = false;
    // El canal se autentica con la sesión del usuario: así solo recibe cambios de lo que puede ver.
    void supabase.auth.getSession().then(({ data }) => {
      if (cerrado || !data.session) return;
      void supabase.realtime.setAuth(data.session.access_token);
      canal = supabase
        .channel(`tablero:${tablero.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "tareas_tarjetas", filter: `tablero_id=eq.${tablero.id}` }, actualizar)
        .on("postgres_changes", { event: "*", schema: "public", table: "tareas_listas", filter: `tablero_id=eq.${tablero.id}` }, actualizar)
        .subscribe();
    });
    return () => {
      cerrado = true;
      if (espera) clearTimeout(espera);
      if (canal) void supabase.removeChannel(canal);
    };
  }, [tablero.id, router]);
  const [, iniciar] = useTransition();
  const usuarios = datos.usuarios;
  const usuario = (id: string): Usuario | undefined => usuarios.find((u) => u.id === id);

  // Listas colapsadas: preferencia de cada persona en su navegador.
  const claveColapsadas = `tareas:colapsadas:${tablero.id}`;
  useEffect(() => {
    try {
      const guardadas = JSON.parse(localStorage.getItem(claveColapsadas) ?? "[]");
      if (Array.isArray(guardadas) && guardadas.length) setColapsadas(new Set(guardadas));
    } catch {}
  }, [claveColapsadas]);
  const alternarColapsada = (id: string) =>
    setColapsadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      try {
        localStorage.setItem(claveColapsadas, JSON.stringify([...n]));
      } catch {}
      return n;
    });

  /** Abre / cierra la tarjeta y lo refleja en la dirección (para compartir el link) sin recargar. */
  const abrir = useCallback(
    (id: string | null) => {
      setAbierta(id);
      const url = new URL(window.location.href);
      if (id) url.searchParams.set("tarjeta", id);
      else url.searchParams.delete("tarjeta");
      window.history.replaceState(window.history.state, "", url);
    },
    [],
  );

  /** Ejecuta una acción del servidor; si falla, avisa y vuelve a traer el tablero. */
  const guardar = (accion: () => Promise<{ error?: string }>) =>
    iniciar(async () => {
      const r = await accion();
      if (r.error) {
        setMensaje(r.error);
        router.refresh();
      }
    });

  const listaDe = (id: string, e = estadoRef.current) => Object.keys(e.orden).find((l) => e.orden[l].includes(id));
  const posicionEn = (lista: string, indice: number, sin: string, e = estadoRef.current) => {
    const ids = e.orden[lista].filter((x) => x !== sin);
    return posicionEntre(e.tarjetas[ids[indice - 1]]?.posicion, e.tarjetas[ids[indice]]?.posicion);
  };

  // ─── Operaciones sobre tarjetas ────────────────────────────────────────
  const ops: Operaciones = {
    editar: async (id, cambios, conVersion) => {
      const anterior = estadoRef.current.tarjetas[id];
      if (!anterior) return { error: "La tarjeta ya no existe" };
      setEstado((e) => ({ ...e, tarjetas: { ...e.tarjetas, [id]: { ...e.tarjetas[id], ...cambios } } }));
      const { titulo, descripcion, vence, inicio, recordatorio, portada, completada, archivada } = cambios;
      const r = await editarTarjeta(id, { titulo, descripcion, vence, inicio, recordatorio, portada, completada, archivada }, conVersion ? anterior.version : undefined);
      if (r.error) {
        setEstado((e) => ({ ...e, tarjetas: { ...e.tarjetas, [id]: anterior } }));
        if (!r.conflicto) setMensaje(r.error);
        return r;
      }
      setEstado((e) => ({ ...e, tarjetas: { ...e.tarjetas, [id]: { ...e.tarjetas[id], version: r.version ?? e.tarjetas[id].version } } }));
      return {};
    },
    asignar: (id, usuarioId, asignado) => {
      setEstado((e) => {
        const t = e.tarjetas[id];
        const miembros = asignado ? [...new Set([...t.miembros, usuarioId])] : t.miembros.filter((m) => m !== usuarioId);
        return { ...e, tarjetas: { ...e.tarjetas, [id]: { ...t, miembros } } };
      });
      guardar(() => responsableTarjeta(id, usuarioId, asignado));
    },
    etiquetar: (id, etiquetaId, puesta) => {
      setEstado((e) => {
        const t = e.tarjetas[id];
        const lista = puesta ? [...new Set([...t.etiquetas, etiquetaId])] : t.etiquetas.filter((x) => x !== etiquetaId);
        return { ...e, tarjetas: { ...e.tarjetas, [id]: { ...t, etiquetas: lista } } };
      });
      guardar(() => etiquetarTarjeta(id, etiquetaId, puesta));
    },
    local: (id, cambios) => setEstado((e) => (e.tarjetas[id] ? { ...e, tarjetas: { ...e.tarjetas, [id]: { ...e.tarjetas[id], ...cambios } } } : e)),
    etiquetas,
    setEtiquetas,
    mover: (id, listaId, arriba = false) => {
      const e = estadoRef.current;
      const ids = e.orden[listaId].filter((x) => x !== id);
      const posicion = arriba ? posicionEntre(undefined, e.tarjetas[ids[0]]?.posicion) : posicionEntre(e.tarjetas[ids[ids.length - 1]]?.posicion, undefined);
      setEstado((s) => {
        const orden = Object.fromEntries(Object.entries(s.orden).map(([l, xs]) => [l, xs.filter((x) => x !== id)]));
        orden[listaId] = arriba ? [id, ...orden[listaId]] : [...orden[listaId], id];
        return { ...s, orden, tarjetas: { ...s.tarjetas, [id]: { ...s.tarjetas[id], lista_id: listaId, posicion } } };
      });
      guardar(() => moverTarjeta(id, listaId, posicion));
    },
    duplicar: (id, listaId, titulo, conservar = { checklists: true, etiquetas: true, miembros: true }) => {
      const e = estadoRef.current;
      const t = e.tarjetas[id];
      const destino = listaId ?? t.lista_id;
      const ids = e.orden[destino];
      const i = destino === t.lista_id ? ids.indexOf(id) + 1 : ids.length;
      const posicion = posicionEntre(e.tarjetas[ids[i - 1]]?.posicion, e.tarjetas[ids[i]]?.posicion);
      // La copia es una tarea nueva: sin completar, sin adjuntos ni comentarios, ítems sin marcar.
      const copia: Tarjeta = {
        ...t,
        id: nuevoId(),
        lista_id: destino,
        posicion,
        titulo: titulo?.trim() || t.titulo,
        completada: false,
        archivada: false,
        version: 1,
        portada: t.portada?.startsWith("c:") ? t.portada : null,
        portadaUrl: null,
        miembros: conservar.miembros ? t.miembros : [],
        etiquetas: conservar.etiquetas ? t.etiquetas : [],
        resumen: { items: conservar.checklists ? t.resumen.items : 0, hechos: 0, adjuntos: 0, comentarios: 0, sigo: true },
      };
      setEstado((s) => ({
        ...s,
        tarjetas: { ...s.tarjetas, [copia.id]: copia },
        orden: { ...s.orden, [destino]: [...s.orden[destino].slice(0, i), copia.id, ...s.orden[destino].slice(i)] },
      }));
      guardar(() => copiarTarjeta(id, copia.id, destino, posicion, copia.titulo, conservar));
    },
    archivar: (id, archivada) => {
      setEstado((s) => {
        const t = s.tarjetas[id];
        const orden = { ...s.orden };
        if (archivada) orden[t.lista_id] = orden[t.lista_id].filter((x) => x !== id);
        else if (orden[t.lista_id] && !orden[t.lista_id].includes(id)) orden[t.lista_id] = [...orden[t.lista_id], id].sort((a, b) => s.tarjetas[a].posicion - s.tarjetas[b].posicion);
        return { ...s, orden, tarjetas: { ...s.tarjetas, [id]: { ...t, archivada } } };
      });
      guardar(() => editarTarjeta(id, { archivada }));
    },
    quitarDelTablero: (id) =>
      setEstado((s) => {
        const tarjetas = { ...s.tarjetas };
        delete tarjetas[id];
        return { ...s, tarjetas, orden: Object.fromEntries(Object.entries(s.orden).map(([l, xs]) => [l, xs.filter((x) => x !== id)])) };
      }),
  };

  // ─── Arrastrar y soltar ────────────────────────────────────────────────
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // En el celular: mantener apretado un instante para arrastrar (así se puede desplazar con el dedo).
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const alEmpezar = (ev: DragStartEvent) => {
    const tipo = ev.active.data.current?.tipo as "tarjeta" | "lista";
    const id = String(ev.active.id);
    setArrastrando({ tipo, id });
    if (tipo === "tarjeta") {
      const t = estadoRef.current.tarjetas[id];
      origen.current = { lista: t.lista_id, posicion: t.posicion };
    }
  };

  const alPasar = (ev: DragOverEvent) => {
    const { active, over } = ev;
    if (!over || active.data.current?.tipo !== "tarjeta") return;
    const id = String(active.id);
    const sobre = String(over.id);
    const desde = listaDe(id);
    const hacia = over.data.current?.tipo === "lista" ? sobre : listaDe(sobre);
    if (!desde || !hacia || desde === hacia) return;
    setEstado((e) => {
      const destino = e.orden[hacia].filter((x) => x !== id);
      const i = over.data.current?.tipo === "lista" ? destino.length : Math.max(0, destino.indexOf(sobre));
      return { ...e, orden: { ...e.orden, [desde]: e.orden[desde].filter((x) => x !== id), [hacia]: [...destino.slice(0, i), id, ...destino.slice(i)] } };
    });
  };

  const alSoltar = (ev: DragEndEvent) => {
    const { active, over } = ev;
    setArrastrando(null);
    const id = String(active.id);
    if (active.data.current?.tipo === "lista") {
      if (!over) return;
      const sobre = over.data.current?.tipo === "tarjeta" ? listaDe(String(over.id)) : String(over.id);
      const e = estadoRef.current;
      const desde = e.listas.findIndex((l) => l.id === id);
      const hasta = e.listas.findIndex((l) => l.id === sobre);
      if (desde < 0 || hasta < 0 || desde === hasta) return;
      const nuevas = arrayMove(e.listas, desde, hasta);
      const posicion = posicionEntre(nuevas[hasta - 1]?.posicion, nuevas[hasta + 1]?.posicion);
      nuevas[hasta] = { ...nuevas[hasta], posicion };
      setEstado({ ...e, listas: nuevas });
      guardar(() => editarLista(id, { posicion }));
      return;
    }
    // Tarjeta: orden final dentro de su lista y posición entre sus vecinas.
    const lista = listaDe(id);
    if (!lista) return;
    let ids = estadoRef.current.orden[lista];
    if (over && over.data.current?.tipo === "tarjeta" && String(over.id) !== id && ids.includes(String(over.id))) {
      ids = arrayMove(ids, ids.indexOf(id), ids.indexOf(String(over.id)));
    }
    const i = ids.indexOf(id);
    const posicion = posicionEn(lista, i, id, { ...estadoRef.current, orden: { ...estadoRef.current.orden, [lista]: ids } });
    const antes = origen.current;
    origen.current = null;
    setEstado((e) => ({ ...e, orden: { ...e.orden, [lista]: ids }, tarjetas: { ...e.tarjetas, [id]: { ...e.tarjetas[id], lista_id: lista, posicion } } }));
    if (antes && antes.lista === lista && antes.posicion === posicion) return;
    guardar(() => moverTarjeta(id, lista, posicion));
  };

  // ─── Listas ───────────────────────────────────────────────────────────
  const agregarLista = (nombre: string) => {
    const e = estadoRef.current;
    const l: Lista = { id: nuevoId(), nombre, posicion: posicionEntre(e.listas[e.listas.length - 1]?.posicion, undefined), archivada: false };
    setEstado((s) => ({ ...s, listas: [...s.listas, l], orden: { ...s.orden, [l.id]: [] } }));
    guardar(() => crearLista(tablero.id, l.id, nombre, l.posicion));
  };
  const cambiarLista = (id: string, cambios: Partial<Lista>) => {
    setEstado((s) => ({ ...s, listas: s.listas.map((l) => (l.id === id ? { ...l, ...cambios } : l)) }));
    guardar(() => editarLista(id, cambios));
  };
  const agregarTarjeta = (lista: string, titulo: string, arriba = false) => {
    const e = estadoRef.current;
    const ids = e.orden[lista];
    const posicion = arriba ? posicionEntre(undefined, e.tarjetas[ids[0]]?.posicion) : posicionEntre(e.tarjetas[ids[ids.length - 1]]?.posicion, undefined);
    const t: Tarjeta = {
      id: nuevoId(),
      lista_id: lista,
      titulo,
      descripcion: null,
      posicion,
      vence: null,
      inicio: null,
      recordatorio: null,
      portada: null,
      completada: false,
      archivada: false,
      version: 1,
      es_plantilla: false,
      miembros: [],
      etiquetas: [],
      resumen: { items: 0, hechos: 0, adjuntos: 0, comentarios: 0, sigo: true },
    };
    setEstado((s) => ({ ...s, tarjetas: { ...s.tarjetas, [t.id]: t }, orden: { ...s.orden, [lista]: arriba ? [t.id, ...s.orden[lista]] : [...s.orden[lista], t.id] } }));
    guardar(() => crearTarjeta(lista, t.id, titulo, posicion));
  };

  const visibles = estado.listas.filter((l) => !l.archivada);
  const tarjetaAbierta = abierta ? estado.tarjetas[abierta] : undefined;
  const arrastrada = arrastrando?.tipo === "tarjeta" ? estado.tarjetas[arrastrando.id] : undefined;
  const listaArrastrada = arrastrando?.tipo === "lista" ? estado.listas.find((l) => l.id === arrastrando.id) : undefined;
  const miembrosTablero = datos.miembros.map((m) => m.usuario_id);
  const filtrando = filtro !== filtroVacio;

  return (
    <div className="-mx-4 -mb-6 -mt-2 flex min-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-t-xl md:-mx-4 md:-mb-8 md:-mt-4 md:min-h-[calc(100vh-2rem)]" style={{ background: fondoCss(tablero.fondo, tablero.fondoUrl) }}>
      {/* Encabezado del tablero */}
      <div className="flex flex-wrap items-center gap-2 bg-black/35 px-3 py-2 text-white backdrop-blur-sm md:px-4">
        <Link href="/tareas" className="rounded px-2 py-1 text-sm text-white/85 hover:bg-white/20" aria-label="Volver a los tableros">
          ← Tableros
        </Link>
        <TituloTablero tablero={tablero} />
        <button
          type="button"
          aria-label={favorito ? "Quitar de favoritos" : "Marcar como favorito"}
          title={favorito ? "Quitar de favoritos" : "Marcar como favorito"}
          onClick={() => {
            setFavorito(!favorito);
            guardar(() => marcarFavorito(tablero.id, !favorito));
          }}
          className={`rounded px-1.5 py-0.5 text-lg leading-none hover:bg-white/20 ${favorito ? "text-amber-300" : ""}`}
        >
          {favorito ? "★" : "☆"}
        </button>
        <span className="rounded bg-white/15 px-2 py-0.5 text-xs">{tablero.visibilidad === "privado" ? "🔒 Privado" : `👥 ${datos.espacio?.nombre ?? "Espacio"}`}</span>
        {tablero.rol === "observador" && <span className="rounded bg-amber-300 px-2 py-0.5 text-xs font-semibold text-amber-950">Observador: solo lectura</span>}
        {tablero.archivado && <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold">Archivado</span>}
        <div className="flex flex-wrap rounded-md bg-white/15 p-0.5 text-sm" role="group" aria-label="Vista">
          {(
            [
              ["tablero", "▦ Tablero"],
              ["calendario", "📅 Calendario"],
              ["cronograma", "▬ Cronograma"],
              ["panel", "📊 Panel"],
            ] as const
          ).map(([v, n]) => (
            <button key={v} type="button" onClick={() => setVista(v)} aria-pressed={vista === v} className={`rounded px-2 py-0.5 ${vista === v ? "bg-white font-medium text-stone-900" : "hover:bg-white/20"}`}>
              {n}
            </button>
          ))}
          <Link href={`/tareas/buscar?tablero=${tablero.id}`} className="rounded px-2 py-0.5 hover:bg-white/20">☰ Tabla</Link>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden -space-x-1.5 sm:flex">
            {datos.miembros.slice(0, 8).map((m) => (
              <Avatar key={m.usuario_id} usuario={usuario(m.usuario_id)} tam={28} />
            ))}
          </div>
          <FiltroTablero filtro={filtro} setFiltro={setFiltro} etiquetas={etiquetas} usuarios={usuarios.filter((u) => miembrosTablero.includes(u.id))} listas={visibles} />
          {datos.botones.some((b) => b.ambito === "tablero") && editable && (
            <div className="relative">
              <button type="button" onClick={() => setMenuBotones(!menuBotones)} className="rounded px-2 py-1 text-sm hover:bg-white/20">
                ▶ Botones
              </button>
              <Menu abierto={menuBotones} cerrar={() => setMenuBotones(false)} className="right-0 top-full w-60">
                {datos.botones
                  .filter((b) => b.ambito === "tablero")
                  .map((b) => (
                    <OpcionMenu
                      key={b.id}
                      onClick={() => {
                        setMenuBotones(false);
                        guardar(async () => {
                          const r = await usarBoton(b.id);
                          if (r.aviso) setMensaje(r.aviso);
                          return r;
                        });
                      }}
                    >
                      ▶ {b.nombre}
                    </OpcionMenu>
                  ))}
              </Menu>
            </div>
          )}
          <button type="button" onClick={() => setAutomatizaciones(true)} className="rounded px-2 py-1 text-sm hover:bg-white/20" title="Automatizaciones">
            ⚡ Automatizar
          </button>
          <button type="button" onClick={() => router.refresh()} className="rounded px-2 py-1 text-sm hover:bg-white/20" title="Traer los últimos cambios">
            ⟳
          </button>
          <MenuTablero datos={datos} estado={estado} yo={yo} ops={ops} cambiarLista={cambiarLista} />
        </div>
      </div>

      {vista !== "tablero" && (
        <div className="flex flex-1 flex-col pt-3 md:pt-4">
          {(() => {
            const props = {
              tarjetas: visibles.flatMap((l) => (estado.orden[l.id] ?? []).map((id) => estado.tarjetas[id]).filter((t) => t && (!filtrando || coincide(t, filtro, yo, l.id)))),
              listas: visibles,
              etiquetas,
              usuarios: usuarios.filter((u) => miembrosTablero.includes(u.id) || Object.values(estado.tarjetas).some((t) => t.miembros.includes(u.id))),
              editable,
              abrir,
              ops,
            };
            return vista === "calendario" ? <VistaCalendario {...props} /> : vista === "cronograma" ? <VistaCronograma {...props} /> : <VistaPanel {...props} tableroId={tablero.id} />;
          })()}
        </div>
      )}

      {/* Listas */}
      {vista === "tablero" && (
      <DndContext
        id={idDnd}
        sensors={editable ? sensores : undefined}
        collisionDetection={closestCorners}
        onDragStart={alEmpezar}
        onDragOver={alPasar}
        onDragEnd={alSoltar}
        onDragCancel={() => {
          setArrastrando(null);
          router.refresh();
        }}
      >
        <div className="flex flex-1 items-start gap-3 overflow-x-auto p-3 pb-6 md:p-4">
          <SortableContext items={visibles.map((l) => l.id)} strategy={horizontalListSortingStrategy}>
            {visibles.map((l) => (
              <ColumnaLista
                key={l.id}
                lista={l}
                ids={(estado.orden[l.id] ?? []).filter((id) => !filtrando || (estado.tarjetas[id] && coincide(estado.tarjetas[id], filtro, yo, l.id)))}
                tarjetas={estado.tarjetas}
                listas={visibles}
                usuario={usuario}
                miembrosTablero={miembrosTablero}
                usuarios={usuarios}
                etiquetas={etiquetas}
                editable={editable}
                colapsada={colapsadas.has(l.id)}
                alternarColapsada={() => alternarColapsada(l.id)}
                abrir={abrir}
                ops={ops}
                cambiarLista={cambiarLista}
                agregarTarjeta={agregarTarjeta}
                plantillas={Object.values(estado.tarjetas).filter((t) => t.es_plantilla && !t.archivada)}
                desdePlantilla={(plantilla, titulo) => {
                  const e = estadoRef.current;
                  const ids = e.orden[l.id];
                  const posicion = posicionEntre(e.tarjetas[ids[ids.length - 1]]?.posicion, undefined);
                  const p = e.tarjetas[plantilla];
                  const nueva: Tarjeta = {
                    ...p,
                    id: nuevoId(),
                    lista_id: l.id,
                    posicion,
                    titulo,
                    vence: null,
                    inicio: null,
                    recordatorio: null,
                    completada: false,
                    archivada: false,
                    es_plantilla: false,
                    version: 1,
                    portadaUrl: null,
                    portada: p.portada?.startsWith("c:") ? p.portada : null,
                    resumen: { ...p.resumen, hechos: 0, adjuntos: 0, comentarios: 0, sigo: true },
                  };
                  setEstado((s) => ({ ...s, tarjetas: { ...s.tarjetas, [nueva.id]: nueva }, orden: { ...s.orden, [l.id]: [...s.orden[l.id], nueva.id] } }));
                  guardar(() => tarjetaDesdePlantilla(plantilla, nueva.id, l.id, posicion, titulo));
                }}
                duplicar={(nombre) => {
                  const i = visibles.findIndex((x) => x.id === l.id);
                  guardar(() => duplicarLista(l.id, nombre, posicionEntre(l.posicion, visibles[i + 1]?.posicion)));
                }}
              />
            ))}
          </SortableContext>
          {editable && <NuevaLista agregar={agregarLista} />}
        </div>
        <DragOverlay>
          {arrastrada ? (
            <div className="rotate-3 cursor-grabbing">
              <CaraTarjeta t={arrastrada} usuario={usuario} etiquetas={etiquetas} levantada />
            </div>
          ) : listaArrastrada ? (
            <div className="w-72 rotate-2 rounded-xl bg-stone-100 p-3 font-semibold opacity-90 shadow-2xl">{listaArrastrada.nombre}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
      )}

      {automatizaciones && (
        <PanelAutomatizaciones
          tableroId={tablero.id}
          listas={visibles}
          etiquetas={etiquetas}
          usuarios={usuarios.filter((u) => miembrosTablero.includes(u.id))}
          editable={editable}
          cerrar={() => setAutomatizaciones(false)}
        />
      )}

      {mensaje && (
        <div role="alert" className="fixed bottom-4 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-lg bg-stone-900 px-4 py-2 text-sm text-white shadow-xl">
          {mensaje}
          <button type="button" onClick={() => setMensaje(null)} className="text-white/70 hover:text-white" aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      )}

      {tarjetaAbierta && (
        <VentanaTarjeta
          key={tarjetaAbierta.id}
          tarjeta={tarjetaAbierta}
          listas={visibles}
          usuarios={usuarios}
          miembrosTablero={miembrosTablero}
          editable={editable}
          rol={tablero.rol}
          yo={yo}
          ops={ops}
          cerrar={() => abrir(null)}
          tableroId={tablero.id}
          botones={datos.botones.filter((b) => b.ambito === "tarjeta")}
          usarBoton={(id) =>
            guardar(async () => {
              const r = await usarBoton(id, tarjetaAbierta.id);
              if (r.aviso) setMensaje(r.aviso);
              return r;
            })
          }
        />
      )}
    </div>
  );
}

// ─── Lista ───────────────────────────────────────────────────────────────

function ColumnaLista({
  lista,
  ids,
  tarjetas,
  listas,
  usuario,
  usuarios,
  etiquetas,
  miembrosTablero,
  editable,
  colapsada,
  alternarColapsada,
  abrir,
  ops,
  cambiarLista,
  agregarTarjeta,
  plantillas,
  desdePlantilla,
  duplicar,
}: {
  lista: Lista;
  ids: string[];
  tarjetas: Record<string, Tarjeta>;
  listas: Lista[];
  usuario: (id: string) => Usuario | undefined;
  usuarios: Usuario[];
  etiquetas: Etiqueta[];
  miembrosTablero: string[];
  editable: boolean;
  colapsada: boolean;
  alternarColapsada: () => void;
  abrir: (id: string) => void;
  ops: Operaciones;
  cambiarLista: (id: string, cambios: Partial<Lista>) => void;
  agregarTarjeta: (lista: string, titulo: string, arriba?: boolean) => void;
  plantillas: Tarjeta[];
  desdePlantilla: (plantilla: string, titulo: string) => void;
  duplicar: (nombre: string) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: lista.id, data: { tipo: "lista" }, disabled: !editable });
  const [nombre, setNombre] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [agregando, setAgregando] = useState<"arriba" | "abajo" | null>(null);
  const estilo = { transform: CSS.Translate.toString(transform), transition };

  if (colapsada) {
    return (
      <div ref={setNodeRef} style={estilo} className={`shrink-0 ${isDragging ? "opacity-40" : ""}`}>
        <button
          type="button"
          onClick={alternarColapsada}
          title="Expandir lista"
          className="flex h-56 w-10 flex-col items-center gap-2 rounded-xl bg-stone-100/95 py-3 text-sm font-semibold text-stone-800 shadow hover:bg-white"
        >
          <span aria-hidden>⇔</span>
          <span className="[writing-mode:vertical-rl]">{lista.nombre}</span>
          <span className="text-xs font-normal text-stone-500">{ids.length}</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={estilo} className={`flex max-h-[calc(100vh-9rem)] w-[272px] shrink-0 flex-col rounded-xl bg-stone-100/95 shadow ${isDragging ? "opacity-40" : ""}`}>
      <div className="relative flex items-center gap-1 px-2 pt-2" {...attributes} {...listeners}>
        {nombre !== null ? (
          <input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setNombre(null);
            }}
            onBlur={() => {
              if (nombre.trim() && nombre.trim() !== lista.nombre) cambiarLista(lista.id, { nombre: nombre.trim() });
              setNombre(null);
            }}
            maxLength={120}
            aria-label="Nombre de la lista"
            className="flex-1 rounded border-2 border-sky-600 px-2 py-1 text-sm font-semibold outline-none"
          />
        ) : (
          <h3
            onClick={() => editable && setNombre(lista.nombre)}
            className={`flex-1 truncate px-2 py-1 text-sm font-semibold text-stone-800 ${editable ? "cursor-pointer" : ""}`}
            title={lista.nombre}
          >
            {lista.nombre}
          </h3>
        )}
        <span className="text-xs text-stone-500">{ids.length}</span>
        <button type="button" onClick={alternarColapsada} onPointerDown={(e) => e.stopPropagation()} title="Colapsar lista" aria-label="Colapsar lista" className="rounded px-1.5 py-0.5 text-stone-500 hover:bg-stone-200">
          ⇔
        </button>
        {editable && (
          <button type="button" onClick={() => setMenu(!menu)} onPointerDown={(e) => e.stopPropagation()} aria-label="Acciones de la lista" className="rounded px-1.5 py-0.5 text-stone-600 hover:bg-stone-200">
            ⋯
          </button>
        )}
        <Menu abierto={menu} cerrar={() => setMenu(false)} className="right-0 top-full">
          <p className="mb-1 border-b border-stone-100 pb-1 text-center text-xs font-semibold text-stone-500">Acciones de la lista</p>
          <OpcionMenu onClick={() => { setMenu(false); setAgregando("arriba"); }}>Añadir tarjeta arriba</OpcionMenu>
          <OpcionMenu
            onClick={() => {
              setMenu(false);
              const n = window.prompt("Nombre de la copia de la lista:", lista.nombre);
              if (n?.trim()) duplicar(n.trim());
            }}
          >
            Copiar lista…
          </OpcionMenu>
          <OpcionMenu onClick={() => { setMenu(false); alternarColapsada(); }}>Colapsar lista</OpcionMenu>
          <OpcionMenu onClick={() => { setMenu(false); cambiarLista(lista.id, { archivada: true }); }}>Archivar esta lista</OpcionMenu>
        </Menu>
      </div>

      <div className="min-h-2 flex-1 space-y-2 overflow-y-auto px-2 py-2">
        {agregando === "arriba" && <NuevaTarjeta agregar={(t) => agregarTarjeta(lista.id, t, true)} cerrar={() => setAgregando(null)} />}
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) =>
            tarjetas[id] ? (
              <TarjetaOrdenable
                key={id}
                t={tarjetas[id]}
                listas={listas}
                usuario={usuario}
                usuarios={usuarios}
                etiquetas={etiquetas}
                miembrosTablero={miembrosTablero}
                editable={editable}
                abrir={abrir}
                ops={ops}
              />
            ) : null,
          )}
        </SortableContext>
        {agregando === "abajo" && <NuevaTarjeta agregar={(t) => agregarTarjeta(lista.id, t)} cerrar={() => setAgregando(null)} />}
      </div>
      {editable && agregando !== "abajo" && (
        <div className="mx-2 mb-2 flex items-center gap-1">
          <button type="button" onClick={() => setAgregando("abajo")} className="flex-1 rounded-lg px-2 py-1.5 text-left text-sm text-stone-600 hover:bg-stone-200 hover:text-stone-900">
            + Añadir una tarjeta
          </button>
          {plantillas.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const p = plantillas.find((x) => x.id === e.target.value);
                if (!p) return;
                const titulo = window.prompt("Título de la tarjeta nueva:", p.titulo);
                if (titulo?.trim()) desdePlantilla(p.id, titulo.trim());
              }}
              aria-label="Crear desde plantilla"
              title="Crear desde una plantilla"
              className="w-9 rounded-lg bg-transparent px-1 py-1.5 text-sm text-stone-600 hover:bg-stone-200"
            >
              <option value="">📋</option>
              {plantillas.map((p) => (
                <option key={p.id} value={p.id}>{p.titulo}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

/** Alta rápida: se escribe el título y Enter (queda abierto para seguir cargando, como en Trello). */
function NuevaTarjeta({ agregar, cerrar }: { agregar: (titulo: string) => void; cerrar: () => void }) {
  const [titulo, setTitulo] = useState("");
  const enviar = () => {
    if (titulo.trim()) agregar(titulo.trim());
    setTitulo("");
  };
  return (
    <div className="space-y-1.5" onPointerDown={(e) => e.stopPropagation()}>
      <textarea
        autoFocus
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            enviar();
          }
          if (e.key === "Escape") cerrar();
        }}
        rows={2}
        maxLength={500}
        placeholder="Introduce un título para esta tarjeta…"
        aria-label="Título de la tarjeta nueva"
        className="w-full resize-none rounded-lg border-0 bg-white px-3 py-2 text-sm shadow outline-none ring-sky-600 focus:ring-2"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={enviar} className="rounded bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800">
          Añadir tarjeta
        </button>
        <button type="button" onClick={cerrar} aria-label="Cancelar" className="px-2 text-xl leading-none text-stone-600 hover:text-stone-900">
          ×
        </button>
      </div>
    </div>
  );
}

function NuevaLista({ agregar }: { agregar: (nombre: string) => void }) {
  const [abierta, setAbierta] = useState(false);
  const [nombre, setNombre] = useState("");
  if (!abierta) {
    return (
      <button type="button" onClick={() => setAbierta(true)} className="w-[272px] shrink-0 rounded-xl bg-white/25 px-3 py-2.5 text-left text-sm font-medium text-white hover:bg-white/35">
        + Añade otra lista
      </button>
    );
  }
  const enviar = () => {
    if (nombre.trim()) agregar(nombre.trim());
    setNombre("");
  };
  return (
    <div className="w-[272px] shrink-0 space-y-1.5 rounded-xl bg-stone-100 p-2 shadow">
      <input
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") enviar();
          if (e.key === "Escape") setAbierta(false);
        }}
        maxLength={120}
        placeholder="Introduce el nombre de la lista…"
        aria-label="Nombre de la lista nueva"
        className="w-full rounded border-2 border-sky-600 px-2 py-1.5 text-sm outline-none"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={enviar} className="rounded bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800">
          Añadir lista
        </button>
        <button type="button" onClick={() => setAbierta(false)} aria-label="Cancelar" className="px-2 text-xl leading-none text-stone-600">
          ×
        </button>
      </div>
    </div>
  );
}

// ─── Tarjeta ─────────────────────────────────────────────────────────────

function TarjetaOrdenable({
  t,
  listas,
  usuario,
  usuarios,
  etiquetas,
  miembrosTablero,
  editable,
  abrir,
  ops,
}: {
  t: Tarjeta;
  listas: Lista[];
  usuario: (id: string) => Usuario | undefined;
  usuarios: Usuario[];
  etiquetas: Etiqueta[];
  miembrosTablero: string[];
  editable: boolean;
  abrir: (id: string) => void;
  ops: Operaciones;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: t.id, data: { tipo: "tarjeta" }, disabled: !editable });
  const [rapido, setRapido] = useState(false);
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className="group relative">
      {isDragging ? (
        // Lugar donde va a quedar la tarjeta.
        <div className="h-[52px] rounded-lg bg-stone-300/80" />
      ) : (
        <div {...attributes} {...listeners} onClick={() => abrir(t.id)} className="cursor-pointer">
          <CaraTarjeta t={t} usuario={usuario} etiquetas={etiquetas} />
        </div>
      )}
      {editable && !isDragging && (
        <button
          type="button"
          onClick={() => setRapido(true)}
          aria-label="Acciones rápidas"
          className="absolute right-1 top-1 rounded-full bg-white/95 px-2 py-1 text-xs text-stone-600 opacity-100 shadow-sm hover:bg-stone-100 sm:opacity-0 sm:group-hover:opacity-100"
        >
          ✎
        </button>
      )}
      {rapido && <AccionesRapidas t={t} listas={listas} usuarios={usuarios} miembrosTablero={miembrosTablero} ops={ops} abrir={abrir} cerrar={() => setRapido(false)} />}
    </div>
  );
}

/** Lo que se ve de la tarjeta en la lista: título, vencimiento, descripción y responsables. */
export function CaraTarjeta({ t, usuario, etiquetas, levantada }: { t: Tarjeta; usuario: (id: string) => Usuario | undefined; etiquetas: Etiqueta[]; levantada?: boolean }) {
  const estadoFecha = estadoVencimiento(t.vence, t.completada);
  const propias = etiquetas.filter((e) => t.etiquetas.includes(e.id));
  const portadaColor = t.portada?.startsWith("c:") ? colorEtiqueta(t.portada.slice(2)).fondo : null;
  const { items, hechos, adjuntos, comentarios, sigo } = t.resumen;
  const conInsignias = t.vence || t.inicio || t.descripcion || items || adjuntos || comentarios || sigo || t.miembros.length;
  return (
    <div className={`overflow-hidden rounded-lg bg-white text-sm text-stone-900 shadow-sm ring-sky-600 hover:ring-2 ${levantada ? "shadow-2xl ring-2" : ""}`}>
      {t.portadaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- link temporal de Storage
        <img src={t.portadaUrl} alt="" className="max-h-40 w-full object-cover" draggable={false} />
      ) : portadaColor ? (
        <div className="h-8" style={{ background: portadaColor }} />
      ) : null}
      <div className="px-3 py-2">
        {propias.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {propias.map((e) => {
              const c = colorEtiqueta(e.color);
              return (
                <span key={e.id} className="min-w-10 max-w-full truncate rounded px-1.5 text-[11px] font-semibold leading-4" style={{ background: c.fondo, color: c.texto }} title={e.nombre || c.nombre}>
                  {e.nombre || " "}
                </span>
              );
            })}
          </div>
        )}
        {t.es_plantilla && <p className="mb-1 text-[11px] font-semibold text-sky-700">📋 Plantilla</p>}
        <p className={`whitespace-pre-wrap break-words ${t.completada ? "text-stone-500" : ""}`}>
          {t.completada && <span className="mr-1 text-green-700">✓</span>}
          {t.titulo}
        </p>
        {conInsignias ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-600">
            {sigo && <span title="Seguís esta tarjeta">👁</span>}
            {(t.vence || t.inicio) && (
              <span
                className={`rounded px-1.5 py-0.5 font-medium ${estadoFecha ? COLOR_VENCIMIENTO[estadoFecha] : "bg-stone-100 text-stone-700"}`}
                title={estadoFecha === "vencida" ? "Vencida" : estadoFecha === "completada" ? "Completada" : estadoFecha === "proxima" ? "Vence pronto" : "Fechas"}
              >
                🕒 {t.inicio && `${new Date(`${t.inicio}T12:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}${t.vence ? " - " : ""}`}
                {t.vence && textoVencimiento(t.vence)}
              </span>
            )}
            {t.descripcion && <span title="Tiene descripción">≡</span>}
            {comentarios > 0 && <span title="Comentarios">💬 {comentarios}</span>}
            {adjuntos > 0 && <span title="Adjuntos">📎 {adjuntos}</span>}
            {items > 0 && (
              <span className={`rounded px-1 ${hechos === items ? "bg-green-600 text-white" : ""}`} title="Checklist">
                ☑ {hechos}/{items}
              </span>
            )}
            <span className="ml-auto flex -space-x-1">
              {t.miembros.map((m) => (
                <Avatar key={m} usuario={usuario(m)} tam={24} />
              ))}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Acciones rápidas de la tarjeta (el lápiz): título, responsables, mover, copiar y archivar. */
function AccionesRapidas({
  t,
  listas,
  usuarios,
  miembrosTablero,
  ops,
  abrir,
  cerrar,
}: {
  t: Tarjeta;
  listas: Lista[];
  usuarios: Usuario[];
  miembrosTablero: string[];
  ops: Operaciones;
  abrir: (id: string) => void;
  cerrar: () => void;
}) {
  const [titulo, setTitulo] = useState(t.titulo);
  const [panel, setPanel] = useState<"miembros" | "mover" | null>(null);
  const candidatos = usuarios.filter((u) => miembrosTablero.includes(u.id) || t.miembros.includes(u.id));
  const guardarTitulo = () => {
    if (titulo.trim() && titulo.trim() !== t.titulo) void ops.editar(t.id, { titulo: titulo.trim() });
    cerrar();
  };
  return (
    <div className="fixed inset-0 z-40 bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="absolute left-1/2 top-24 flex w-[min(92vw,560px)] -translate-x-1/2 flex-col gap-2 sm:flex-row">
        <div className="flex-1 space-y-2">
          <textarea
            autoFocus
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                guardarTitulo();
              }
              if (e.key === "Escape") cerrar();
            }}
            rows={3}
            maxLength={500}
            aria-label="Título de la tarjeta"
            className="w-full resize-none rounded-lg bg-white px-3 py-2 text-sm shadow-xl outline-none"
          />
          <button type="button" onClick={guardarTitulo} className="rounded bg-sky-700 px-4 py-1.5 text-sm font-medium text-white">
            Guardar
          </button>
        </div>
        <div className="flex flex-col items-start gap-1">
          {[
            ["Abrir tarjeta", () => { cerrar(); abrir(t.id); }],
            ["Cambiar miembros", () => setPanel(panel === "miembros" ? null : "miembros")],
            ["Mover", () => setPanel(panel === "mover" ? null : "mover")],
            ["Copiar", () => { ops.duplicar(t.id); cerrar(); }],
            [t.completada ? "Marcar como pendiente" : "Marcar como completada", () => { void ops.editar(t.id, { completada: !t.completada }); cerrar(); }],
            ["Archivar", () => { ops.archivar(t.id, true); cerrar(); }],
          ].map(([texto, accion]) => (
            <button key={texto as string} type="button" onClick={accion as () => void} className="rounded bg-black/70 px-3 py-1.5 text-sm text-white hover:bg-black/85">
              {texto as string}
            </button>
          ))}
          {panel === "miembros" && (
            <div className="w-64 rounded-lg bg-white p-2 text-sm shadow-xl">
              {candidatos.map((u) => {
                const sel = t.miembros.includes(u.id);
                return (
                  <button key={u.id} type="button" onClick={() => ops.asignar(t.id, u.id, !sel)} className="flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-stone-100">
                    <Avatar usuario={u} tam={24} />
                    <span className="flex-1 text-left">{u.nombre}</span>
                    {sel && <span className="text-sky-700">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
          {panel === "mover" && (
            <div className="w-64 space-y-1 rounded-lg bg-white p-2 text-sm shadow-xl">
              {listas.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  disabled={l.id === t.lista_id}
                  onClick={() => {
                    ops.mover(t.id, l.id);
                    cerrar();
                  }}
                  className="block w-full rounded px-2 py-1 text-left hover:bg-stone-100 disabled:font-semibold disabled:text-stone-400"
                >
                  {l.nombre} {l.id === t.lista_id ? "(actual)" : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
