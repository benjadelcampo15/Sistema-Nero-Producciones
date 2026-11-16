"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { evolucionTablero } from "@/lib/tareas/acciones-avanzadas";
import { colorEtiqueta, estadoVencimiento, type Etiqueta, type Lista, type Tarjeta, type Usuario } from "@/lib/tareas/tipos";
import { Avatar } from "../comunes";
import type { Operaciones } from "./tablero";

const DIA = 86400000;
const ZONA_MS = 3 * 3600 * 1000;
/** Fecha (AAAA-MM-DD) en hora de Buenos Aires. */
const diaDe = (iso: string) => new Date(new Date(iso).getTime() - ZONA_MS).toISOString().slice(0, 10);
const sumarDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / DIA);
const horaDe = (iso: string) => new Date(new Date(iso).getTime() - ZONA_MS).toISOString().slice(11, 16);
const hoyAR = () => new Date(Date.now() - ZONA_MS).toISOString().slice(0, 10);
/** ¿Vence dentro de las próximas 48 horas (y todavía no venció)? */
function venceEn48(iso: string) {
  const falta = new Date(iso).getTime() - Date.now();
  return falta >= 0 && falta <= 2 * DIA;
}
const COLOR_ESTADO = { vencida: "#c9372c", proxima: "#c25100", completada: "#1f845a", normal: "#0c66e4" } as const;

type Comunes = {
  tarjetas: Tarjeta[];
  listas: Lista[];
  etiquetas: Etiqueta[];
  usuarios: Usuario[];
  editable: boolean;
  abrir: (id: string) => void;
  ops: Operaciones;
};

// ─── Calendario ──────────────────────────────────────────────────────────

/** Calendario mensual o semanal: las tarjetas en su día de vencimiento; se arrastran para cambiar la fecha. */
export function VistaCalendario({ tarjetas, listas, etiquetas, editable, abrir, ops }: Comunes) {
  const [modo, setModo] = useState<"mes" | "semana">("mes");
  const [ancla, setAncla] = useState(hoyAR);
  const [sobre, setSobre] = useState<string | null>(null);
  const hoy = hoyAR();
  const conFecha = tarjetas.filter((t) => t.vence || t.inicio);
  const sinFecha = tarjetas.length - conFecha.length;
  const porDia = useMemo(() => {
    const m = new Map<string, Tarjeta[]>();
    for (const t of conFecha) {
      const d = t.vence ? diaDe(t.vence) : t.inicio!;
      m.set(d, [...(m.get(d) ?? []), t]);
    }
    return m;
  }, [conFecha]);

  // Días a mostrar: semanas completas de lunes a domingo.
  const inicioMes = `${ancla.slice(0, 7)}-01`;
  const base = modo === "mes" ? inicioMes : ancla;
  const dow = (new Date(`${base}T12:00:00Z`).getUTCDay() + 6) % 7;
  const primero = sumarDias(base, -dow);
  const cantidad = modo === "mes" ? Math.ceil((dow + new Date(Date.UTC(Number(ancla.slice(0, 4)), Number(ancla.slice(5, 7)), 0)).getUTCDate()) / 7) * 7 : 7;
  const dias = Array.from({ length: cantidad }, (_, i) => sumarDias(primero, i));
  const titulo =
    modo === "mes"
      ? (() => {
          const t = new Date(`${inicioMes}T12:00:00Z`).toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
          return t.charAt(0).toUpperCase() + t.slice(1);
        })()
      : `${new Date(`${dias[0]}T12:00:00Z`).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "UTC" })} – ${new Date(`${dias[6]}T12:00:00Z`).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
  const mover = (n: number) => {
    if (modo === "semana") return setAncla(sumarDias(ancla, n * 7));
    const d = new Date(`${inicioMes}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setAncla(d.toISOString().slice(0, 10));
  };
  const soltar = (dia: string, id: string) => {
    setSobre(null);
    const t = tarjetas.find((x) => x.id === id);
    if (!t || !editable) return;
    if (t.vence) {
      if (diaDe(t.vence) === dia) return;
      const nuevaInicio = t.inicio ? sumarDias(t.inicio, diasEntre(diaDe(t.vence), dia)) : null;
      void ops.editar(id, { vence: `${dia}T${horaDe(t.vence)}:00-03:00`, inicio: nuevaInicio });
    } else void ops.editar(id, { inicio: dia });
  };

  return (
    <div className="mx-3 mb-6 flex-1 rounded-xl bg-white/95 p-3 shadow md:mx-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setAncla(hoyAR())} className="boton-secundario py-1 text-sm">Hoy</button>
        <button type="button" onClick={() => mover(-1)} aria-label="Anterior" className="rounded px-2 py-1 hover:bg-stone-100">‹</button>
        <button type="button" onClick={() => mover(1)} aria-label="Siguiente" className="rounded px-2 py-1 hover:bg-stone-100">›</button>
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <div className="ml-auto flex rounded-lg bg-stone-100 p-0.5 text-sm">
          {(["mes", "semana"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setModo(m)} className={`rounded-md px-3 py-1 ${modo === m ? "bg-white font-medium shadow-sm" : ""}`}>
              {m === "mes" ? "Mes" : "Semana"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 border-l border-t border-stone-200 text-xs">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <div key={d} className="border-b border-r border-stone-200 bg-stone-50 px-2 py-1 font-semibold text-stone-500">{d}</div>
        ))}
        {dias.map((dia) => {
          const propias = porDia.get(dia) ?? [];
          const fuera = modo === "mes" && dia.slice(0, 7) !== ancla.slice(0, 7);
          return (
            <div
              key={dia}
              onDragOver={(e) => {
                if (!editable) return;
                e.preventDefault();
                setSobre(dia);
              }}
              onDragLeave={() => setSobre((s) => (s === dia ? null : s))}
              onDrop={(e) => soltar(dia, e.dataTransfer.getData("text/tarjeta"))}
              className={`border-b border-r border-stone-200 p-1 ${modo === "mes" ? "min-h-24" : "min-h-72"} ${fuera ? "bg-stone-50 text-stone-400" : ""} ${sobre === dia ? "bg-sky-50 ring-2 ring-inset ring-sky-500" : ""}`}
            >
              <p className={`mb-1 text-right text-[11px] ${dia === hoy ? "font-bold text-sky-700" : ""}`}>
                {dia === hoy ? "Hoy " : ""}
                {Number(dia.slice(8))}
              </p>
              <div className="space-y-1">
                {propias.map((t) => {
                  const estado = estadoVencimiento(t.vence, t.completada) ?? "normal";
                  const primera = etiquetas.find((e) => t.etiquetas.includes(e.id));
                  return (
                    <button
                      key={t.id}
                      type="button"
                      draggable={editable}
                      onDragStart={(e) => e.dataTransfer.setData("text/tarjeta", t.id)}
                      onClick={() => abrir(t.id)}
                      title={`${t.titulo} · ${listas.find((l) => l.id === t.lista_id)?.nombre ?? ""}`}
                      className="block w-full truncate rounded border-l-4 bg-stone-100 px-1.5 py-0.5 text-left text-[11px] text-stone-800 hover:bg-stone-200"
                      style={{ borderLeftColor: COLOR_ESTADO[estado] }}
                    >
                      {primera && <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colorEtiqueta(primera.color).fondo }} />}
                      {t.completada && "✓ "}
                      {t.vence && <span className="text-stone-500">{horaDe(t.vence) === "23:59" ? "" : `${horaDe(t.vence)} `}</span>}
                      {t.titulo}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 flex flex-wrap gap-3 text-xs text-stone-600">
        <span><span className="mr-1 inline-block h-2 w-3 rounded" style={{ background: COLOR_ESTADO.normal }} />Pendiente</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded" style={{ background: COLOR_ESTADO.proxima }} />Vence en 24 h</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded" style={{ background: COLOR_ESTADO.vencida }} />Vencida</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded" style={{ background: COLOR_ESTADO.completada }} />Completada</span>
        {sinFecha > 0 && <span>· {sinFecha} tarjeta{sinFecha === 1 ? "" : "s"} sin fecha (en la vista Tablero)</span>}
        {editable && <span>· Arrastrá una tarjeta a otro día para cambiar su fecha.</span>}
      </p>
    </div>
  );
}

// ─── Cronograma ──────────────────────────────────────────────────────────

type Barra = { t: Tarjeta; desde: string; hasta: string; carril: number; superpuesta: boolean };

/**
 * Cronograma: cada tarea es una barra de su inicio a su vencimiento. Se arrastra
 * para mover las fechas y se estira por los bordes para cambiar la duración.
 */
export function VistaCronograma({ tarjetas, listas, usuarios, editable, abrir, ops }: Comunes) {
  const [agrupar, setAgrupar] = useState<"responsable" | "lista">("responsable");
  const [desde, setDesde] = useState(() => sumarDias(hoyAR(), -7));
  const [ancho, setAncho] = useState(36);
  const [arrastre, setArrastre] = useState<{ id: string; modo: "mover" | "inicio" | "fin"; x: number; delta: number } | null>(null);
  const dias = 42;
  const hoy = hoyAR();
  const conFechas = tarjetas.filter((t) => t.vence || t.inicio);

  const rango = (t: Tarjeta) => {
    const fin = t.vence ? diaDe(t.vence) : t.inicio!;
    const ini = t.inicio && t.inicio <= fin ? t.inicio : fin;
    if (arrastre?.id !== t.id) return { ini, fin };
    const d = arrastre.delta;
    if (arrastre.modo === "mover") return { ini: sumarDias(ini, d), fin: sumarDias(fin, d) };
    if (arrastre.modo === "inicio") return { ini: sumarDias(ini, Math.min(d, diasEntre(ini, fin))), fin };
    return { ini, fin: sumarDias(fin, Math.max(d, -diasEntre(ini, fin))) };
  };

  // Filas: por responsable (una tarea con dos responsables aparece en las dos) o por lista.
  const grupos: { clave: string; nombre: string; usuario?: Usuario; barras: Barra[] }[] = useMemo(() => {
    const filas =
      agrupar === "lista"
        ? listas.map((l) => ({ clave: l.id, nombre: l.nombre, usuario: undefined as Usuario | undefined, tarjetas: conFechas.filter((t) => t.lista_id === l.id) }))
        : [
            ...usuarios.map((u) => ({ clave: u.id, nombre: u.nombre, usuario: u as Usuario | undefined, tarjetas: conFechas.filter((t) => t.miembros.includes(u.id)) })),
            { clave: "sin", nombre: "Sin responsable", usuario: undefined, tarjetas: conFechas.filter((t) => !t.miembros.length) },
          ];
    return filas
      .filter((f) => f.tarjetas.length)
      .map((f) => {
        // Carriles: las barras que se pisan van en renglones distintos y se marcan como superpuestas.
        const ordenadas = f.tarjetas.map((t) => ({ t, ...rango(t) })).sort((a, b) => a.ini.localeCompare(b.ini));
        const finCarril: string[] = [];
        const barras: Barra[] = ordenadas.map((b) => {
          let carril = finCarril.findIndex((fin) => fin < b.ini);
          if (carril < 0) carril = finCarril.length;
          finCarril[carril] = b.fin;
          return { t: b.t, desde: b.ini, hasta: b.fin, carril, superpuesta: false };
        });
        for (const b of barras) b.superpuesta = barras.some((o) => o !== b && o.desde <= b.hasta && b.desde <= o.hasta);
        return { clave: f.clave, nombre: f.nombre, usuario: f.usuario, barras };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rango depende del arrastre en curso
  }, [agrupar, conFechas, listas, usuarios, arrastre]);

  const empezar = (e: React.PointerEvent, id: string, modo: "mover" | "inicio" | "fin") => {
    if (!editable) return;
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Sin captura igual se puede arrastrar (los movimientos llegan al contenedor).
    }
    setArrastre({ id, modo, x: e.clientX, delta: 0 });
  };
  const mover = (e: React.PointerEvent) => {
    if (!arrastre) return;
    const delta = Math.round((e.clientX - arrastre.x) / ancho);
    if (delta !== arrastre.delta) setArrastre({ ...arrastre, delta });
  };
  const soltar = () => {
    if (!arrastre) return;
    const t = tarjetas.find((x) => x.id === arrastre.id);
    const { ini, fin } = t ? rango(t) : { ini: "", fin: "" };
    const huboCambio = arrastre.delta !== 0;
    setArrastre(null);
    if (!t) return;
    if (!huboCambio) return abrir(t.id);
    const vence = t.vence ? `${fin}T${horaDe(t.vence)}:00-03:00` : `${fin}T18:00:00-03:00`;
    void ops.editar(t.id, { inicio: ini === fin && !t.inicio ? null : ini, vence });
  };

  const columnas = Array.from({ length: dias }, (_, i) => sumarDias(desde, i));
  const ALTO = 30;
  return (
    <div className="mx-3 mb-6 flex-1 overflow-hidden rounded-xl bg-white/95 shadow md:mx-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 p-3 text-sm">
        <button type="button" onClick={() => setDesde(sumarDias(hoyAR(), -7))} className="boton-secundario py-1 text-sm">Hoy</button>
        <button type="button" onClick={() => setDesde(sumarDias(desde, -14))} aria-label="Antes" className="rounded px-2 py-1 hover:bg-stone-100">‹</button>
        <button type="button" onClick={() => setDesde(sumarDias(desde, 14))} aria-label="Después" className="rounded px-2 py-1 hover:bg-stone-100">›</button>
        <label className="flex items-center gap-1">
          Agrupar por
          <select value={agrupar} onChange={(e) => setAgrupar(e.target.value as "responsable" | "lista")} className="campo w-auto py-1 text-sm">
            <option value="responsable">Responsable</option>
            <option value="lista">Lista</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          Zoom
          <input type="range" min={18} max={64} value={ancho} onChange={(e) => setAncho(Number(e.target.value))} aria-label="Zoom" />
        </label>
        <span className="ml-auto text-xs text-stone-500">{tarjetas.length - conFechas.length} sin fechas no aparecen</span>
      </div>
      <div className="overflow-x-auto" onPointerMove={mover} onPointerUp={soltar} onPointerCancel={() => setArrastre(null)}>
        <div style={{ width: 180 + dias * ancho }}>
          <div className="sticky top-0 z-10 flex border-b border-stone-200 bg-stone-50 text-[10px] text-stone-500">
            <div className="w-[180px] shrink-0 px-2 py-1 font-semibold">{agrupar === "lista" ? "Lista" : "Responsable"}</div>
            {columnas.map((d) => (
              <div key={d} style={{ width: ancho }} className={`shrink-0 border-l border-stone-100 py-1 text-center ${d === hoy ? "bg-sky-100 font-bold text-sky-800" : ""}`}>
                {ancho >= 28 || Number(d.slice(8)) % 2 === 1 ? Number(d.slice(8)) : ""}
                {d.slice(8) === "01" && <span className="block">{new Date(`${d}T12:00:00Z`).toLocaleDateString("es-AR", { month: "short", timeZone: "UTC" })}</span>}
              </div>
            ))}
          </div>
          {grupos.length === 0 && <p className="p-6 text-center text-sm text-stone-500">No hay tarjetas con fechas. Poneles inicio y vencimiento para verlas acá.</p>}
          {grupos.map((g) => {
            const carriles = Math.max(1, ...g.barras.map((b) => b.carril + 1));
            return (
              <div key={g.clave} className="flex border-b border-stone-100">
                <div className="flex w-[180px] shrink-0 items-start gap-2 px-2 py-2 text-sm">
                  {g.usuario && <Avatar usuario={g.usuario} tam={22} />}
                  <span className="truncate font-medium">{g.nombre}</span>
                </div>
                <div className="relative" style={{ width: dias * ancho, height: carriles * ALTO + 8 }}>
                  {columnas.map((d, i) => (
                    <div key={d} className={`absolute top-0 h-full border-l border-stone-100 ${d === hoy ? "bg-sky-50" : ""}`} style={{ left: i * ancho, width: ancho }} />
                  ))}
                  {g.barras.map((b) => {
                    const izq = diasEntre(desde, b.desde);
                    const largo = diasEntre(b.desde, b.hasta) + 1;
                    if (izq + largo < 0 || izq > dias) return null;
                    const estado = estadoVencimiento(b.t.vence, b.t.completada) ?? "normal";
                    return (
                      <div
                        key={b.t.id}
                        title={`${b.t.titulo}${b.superpuesta ? " · se superpone con otra tarea" : ""}`}
                        onPointerDown={(e) => empezar(e, b.t.id, "mover")}
                        className={`absolute flex touch-none select-none items-center overflow-hidden rounded-md px-2 text-[11px] font-medium text-white shadow-sm ${editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${b.superpuesta ? "ring-2 ring-amber-400 ring-offset-1" : ""}`}
                        style={{ left: izq * ancho + 2, width: Math.max(largo * ancho - 4, 14), top: b.carril * ALTO + 4, height: ALTO - 6, background: COLOR_ESTADO[estado] }}
                        onClick={() => !editable && abrir(b.t.id)}
                      >
                        {editable && <span onPointerDown={(e) => empezar(e, b.t.id, "inicio")} className="absolute left-0 top-0 h-full w-2 cursor-ew-resize" aria-hidden />}
                        <span className="truncate">{b.t.completada ? "✓ " : ""}{b.t.titulo}</span>
                        {editable && <span onPointerDown={(e) => empezar(e, b.t.id, "fin")} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize" aria-hidden />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="flex flex-wrap gap-3 border-t border-stone-200 px-3 py-2 text-xs text-stone-600">
        <span><span className="mr-1 inline-block h-2 w-3 rounded" style={{ background: COLOR_ESTADO.normal }} />Pendiente</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded" style={{ background: COLOR_ESTADO.vencida }} />Vencida</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded" style={{ background: COLOR_ESTADO.completada }} />Completada</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded ring-2 ring-amber-400" />Superpuesta con otra del mismo grupo</span>
        {editable && <span>· Arrastrá la barra para mover las fechas; estirá los bordes para cambiar la duración; tocala para abrirla.</span>}
      </p>
    </div>
  );
}

// ─── Panel (estadísticas) ────────────────────────────────────────────────

const TERMINADA = /termin|finaliz|hech|listo|done|complet/i;
const EN_PROCESO = /proceso|curso|haciendo|doing|revisi|progreso/i;

/** Panel del tablero: solo lee y cuenta (no modifica tarjetas). */
export function VistaPanel({ tarjetas, listas, usuarios, tableroId }: Comunes & { tableroId: string }) {
  const [periodo, setPeriodo] = useState(30);
  const [evolucion, setEvolucion] = useState<{ dia: string; completadas: number; creadas: number }[] | null>(null);
  const pedido = useRef(0);
  useEffect(() => {
    const n = ++pedido.current;
    void evolucionTablero(tableroId, sumarDias(hoyAR(), -periodo + 1)).then((e) => n === pedido.current && setEvolucion(e));
  }, [tableroId, periodo]);

  const estado = (t: Tarjeta) => {
    const lista = listas.find((l) => l.id === t.lista_id)?.nombre ?? "";
    if (t.completada || TERMINADA.test(lista)) return "terminada";
    if (EN_PROCESO.test(lista)) return "proceso";
    return "pendiente";
  };
  const abiertas = tarjetas.filter((t) => estado(t) !== "terminada");
  const vencidas = abiertas.filter((t) => estadoVencimiento(t.vence, false) === "vencida");
  const proximas = abiertas.filter((t) => t.vence && venceEn48(t.vence));
  const tiles = [
    ["Total de tarjetas", tarjetas.length],
    ["Pendientes", tarjetas.filter((t) => estado(t) === "pendiente").length],
    ["En proceso", tarjetas.filter((t) => estado(t) === "proceso").length],
    ["Terminadas", tarjetas.filter((t) => estado(t) === "terminada").length],
    ["Vencidas", vencidas.length],
    ["Vencen en 48 h", proximas.length],
  ] as const;
  const porResponsable = [
    ...usuarios.map((u) => ({ nombre: u.nombre, n: abiertas.filter((t) => t.miembros.includes(u.id)).length })),
    { nombre: "Sin responsable", n: abiertas.filter((t) => !t.miembros.length).length },
  ]
    .filter((x) => x.n)
    .sort((a, b) => b.n - a.n);
  const porLista = listas.map((l) => ({ nombre: l.nombre, n: tarjetas.filter((t) => t.lista_id === l.id).length }));
  const dias = Array.from({ length: periodo }, (_, i) => sumarDias(hoyAR(), -periodo + 1 + i));
  const serie = dias.map((d) => evolucion?.find((e) => e.dia === d)?.completadas ?? 0);
  const totalCompletadas = serie.reduce((s, n) => s + n, 0);

  return (
    <div className="mx-3 mb-6 flex-1 space-y-4 rounded-xl bg-white/95 p-4 shadow md:mx-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([n, v]) => (
          <div key={n} className={`rounded-lg border p-3 ${n === "Vencidas" && v ? "border-red-200 bg-red-50" : "border-stone-200"}`}>
            <p className="text-xs text-stone-500">{n}</p>
            <p className={`text-2xl font-semibold ${n === "Vencidas" && v ? "text-red-700" : ""}`}>{v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Barras titulo="Tareas abiertas por responsable" filas={porResponsable} />
        <Barras titulo="Tarjetas por lista" filas={porLista} />
      </div>
      <section className="rounded-lg border border-stone-200 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">Tareas completadas por día</h3>
          <span className="text-sm text-stone-500">{totalCompletadas} en el período</span>
          <select value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))} className="campo ml-auto w-auto py-1 text-sm" aria-label="Período">
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
        </div>
        {!evolucion ? (
          <div className="esqueleto h-32 rounded" />
        ) : (
          <div className="flex h-36 items-end gap-0.5 border-b border-stone-300">
            {serie.map((n, i) => {
              const max = Math.max(1, ...serie);
              return (
                <div key={dias[i]} className="group relative flex h-full flex-1 items-end" title={`${dias[i].split("-").reverse().join("/")}: ${n} completada${n === 1 ? "" : "s"}`}>
                  <div className="w-full rounded-t-[3px] bg-sky-600 group-hover:bg-sky-800" style={{ height: `${(n / max) * 100}%`, minHeight: n ? 3 : 0 }} />
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-1 flex justify-between text-[10px] text-stone-500">
          <span>{dias[0].split("-").reverse().slice(0, 2).join("/")}</span>
          <span>Hoy</span>
        </div>
      </section>
      <p className="text-xs text-stone-500">
        “En proceso” son las tarjetas en listas como “En proceso” o “En revisión”; “Terminadas”, las completadas o en listas como “Terminado”. Las estadísticas solo leen: no cambian ninguna tarea.
      </p>
    </div>
  );
}

function Barras({ titulo, filas }: { titulo: string; filas: { nombre: string; n: number }[] }) {
  const max = Math.max(1, ...filas.map((f) => f.n));
  return (
    <section className="rounded-lg border border-stone-200 p-3">
      <h3 className="mb-2 font-semibold">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="text-sm text-stone-500">Sin datos.</p>
      ) : (
        <ul className="space-y-1.5">
          {filas.map((f) => (
            <li key={f.nombre} className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-2 text-sm" title={`${f.nombre}: ${f.n}`}>
              <span className="truncate text-stone-700">{f.nombre}</span>
              <span className="h-3 rounded-r-[4px] bg-sky-600" style={{ width: `${(f.n / max) * 100}%`, minWidth: f.n ? 4 : 0 }} />
              <span className="text-right font-mono text-stone-800">{f.n}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
