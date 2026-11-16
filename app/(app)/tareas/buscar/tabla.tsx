"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { editarTarjeta, moverTarjeta } from "@/lib/tareas/acciones";
import { responsableTarjeta } from "@/lib/tareas/acciones-tarjeta";
import { borrarBusqueda, guardarBusqueda } from "@/lib/tareas/acciones-avanzadas";
import type { FilaBusqueda, FiltrosBusqueda } from "@/lib/tareas/consultas";
import { COLOR_VENCIMIENTO, colorEtiqueta, estadoVencimiento, type Usuario } from "@/lib/tareas/tipos";
import { Avatar } from "../comunes";

type Orden = "titulo" | "tablero" | "lista" | "responsable" | "vence" | "estado";

function Columna({ por, orden, setOrden, children }: { por: Orden; orden: { por: Orden; asc: boolean }; setOrden: (o: { por: Orden; asc: boolean }) => void; children: React.ReactNode }) {
  return (
    <th className="px-3 py-2">
      <button type="button" onClick={() => setOrden({ por, asc: orden.por === por ? !orden.asc : true })} className="font-semibold hover:underline">
        {children} {orden.por === por ? (orden.asc ? "▲" : "▼") : ""}
      </button>
    </th>
  );
}

const aLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10) : "");

export function TablaTareas({
  filas: iniciales,
  listas,
  tableros,
  busquedas,
  usuarios,
  filtros,
  yo,
}: {
  filas: FilaBusqueda[];
  listas: { id: string; tablero_id: string; nombre: string }[];
  tableros: { id: string; nombre: string }[];
  busquedas: { id: string; nombre: string; filtros: Record<string, string> }[];
  usuarios: Usuario[];
  filtros: FiltrosBusqueda;
  yo: string;
}) {
  const router = useRouter();
  const [filas, setFilas] = useState(iniciales);
  const [previas, setPrevias] = useState(iniciales);
  if (iniciales !== previas) {
    setPrevias(iniciales);
    setFilas(iniciales);
  }
  const [orden, setOrden] = useState<{ por: Orden; asc: boolean }>({ por: "vence", asc: true });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const nombre = (id: string) => usuarios.find((u) => u.id === id)?.nombre ?? "?";
  const href = (f: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries(f).filter((e): e is [string, string] => !!e[1]));
    return `/tareas/buscar${q.size ? `?${q}` : ""}`;
  };
  const activos = Object.values(filtros).filter(Boolean).length;

  const cambiar = (id: string, cambios: Partial<FilaBusqueda>, accion: () => Promise<{ error?: string }>) => {
    setFilas((l) => l.map((x) => (x.id === id ? { ...x, ...cambios } : x)));
    iniciar(async () => {
      const r = await accion();
      if (r.error) {
        setError(r.error);
        router.refresh();
      }
    });
  };

  const valor = (f: FilaBusqueda): string | number => {
    switch (orden.por) {
      case "titulo":
        return f.titulo.toLowerCase();
      case "tablero":
        return f.tablero.toLowerCase();
      case "lista":
        return f.lista.toLowerCase();
      case "responsable":
        return f.miembros.map(nombre).join(", ").toLowerCase() || "~";
      case "vence":
        return f.vence ?? "9999";
      case "estado":
        return f.completada ? 1 : 0;
    }
  };
  const ordenadas = [...filas].sort((a, b) => {
    const x = valor(a);
    const y = valor(b);
    return (x < y ? -1 : x > y ? 1 : 0) * (orden.asc ? 1 : -1);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/tareas" className="text-sm text-stone-500 hover:text-stone-900">← Tableros</Link>
          <h1 className="text-2xl font-semibold">Tabla y búsqueda de tareas</h1>
          <p className="text-sm text-stone-500">Todas las tarjetas de tus tableros. Lo que cambies acá se ve al instante en el tablero.</p>
        </div>
      </div>

      <form className="tarjeta grid grid-cols-2 gap-2 p-3 text-sm sm:grid-cols-4 xl:grid-cols-8" action="/tareas/buscar">
        <input name="q" defaultValue={filtros.q} placeholder="Nombre o descripción…" aria-label="Buscar" className="campo col-span-2" />
        <select name="tablero" defaultValue={filtros.tablero} aria-label="Tablero" className="campo">
          <option value="">Tablero: todos</option>
          {tableros.map((t) => (
            <option key={t.id} value={t.id}>{t.nombre}</option>
          ))}
        </select>
        <input name="lista" defaultValue={filtros.lista} placeholder="Lista" aria-label="Lista" className="campo" />
        <select name="responsable" defaultValue={filtros.responsable} aria-label="Responsable" className="campo">
          <option value="">Responsable: todos</option>
          <option value={yo}>Yo</option>
          <option value="sin">Sin responsable</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre}</option>
          ))}
        </select>
        <input name="etiqueta" defaultValue={filtros.etiqueta} placeholder="Etiqueta" aria-label="Etiqueta" className="campo" />
        <select name="estado" defaultValue={filtros.estado} aria-label="Estado" className="campo">
          <option value="">Estado: todos</option>
          <option value="pendientes">Pendientes</option>
          <option value="vencidas">Vencidas</option>
          <option value="completadas">Completadas</option>
          <option value="sin_fecha">Sin fecha</option>
        </select>
        <input type="date" name="desde" defaultValue={filtros.desde} aria-label="Vence desde" title="Vence desde" className="campo" />
        <input type="date" name="hasta" defaultValue={filtros.hasta} aria-label="Vence hasta" title="Vence hasta" className="campo" />
        <div className="col-span-2 flex gap-2 sm:col-span-4 xl:col-span-2">
          <button type="submit" className="boton flex-1 py-1.5 text-sm">Buscar</button>
          {activos > 0 && <Link href="/tareas/buscar" className="boton-secundario py-1.5 text-sm">Limpiar</Link>}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-stone-500">Búsquedas guardadas:</span>
        {busquedas.length === 0 && <span className="text-stone-400">ninguna</span>}
        {busquedas.map((b) => (
          <span key={b.id} className="inline-flex items-center gap-1 rounded-full bg-stone-200 pl-3 pr-1">
            <Link href={href(b.filtros)} className="hover:underline">{b.nombre}</Link>
            <button type="button" onClick={() => iniciar(async () => void (await borrarBusqueda(b.id)))} aria-label={`Borrar ${b.nombre}`} className="px-1 text-stone-500 hover:text-red-700">×</button>
          </span>
        ))}
        {activos > 0 && (
          <button
            type="button"
            onClick={() => {
              const n = window.prompt("Nombre para esta búsqueda:");
              if (n?.trim()) iniciar(async () => setError((await guardarBusqueda(n, filtros as Record<string, string>)).error ?? null));
            }}
            className="underline"
          >
            ☆ Guardar esta búsqueda
          </button>
        )}
      </div>

      {error && <p className="alerta-error">{error}</p>}
      <p className="text-sm text-stone-500">{filas.length} tarjeta{filas.length === 1 ? "" : "s"}{filas.length === 500 ? " (se muestran las primeras 500: afiná la búsqueda)" : ""}</p>

      {filas.length === 0 ? (
        <p className="tarjeta text-center text-sm text-stone-500">No hay tarjetas con estos filtros.</p>
      ) : (
        <div className="tarjeta overflow-x-auto p-0">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <Columna orden={orden} setOrden={setOrden} por="titulo">Nombre de tarea</Columna>
                <Columna orden={orden} setOrden={setOrden} por="tablero">Tablero</Columna>
                <Columna orden={orden} setOrden={setOrden} por="lista">Lista</Columna>
                <Columna orden={orden} setOrden={setOrden} por="responsable">Responsable</Columna>
                <Columna orden={orden} setOrden={setOrden} por="vence">Fecha</Columna>
                <th className="px-3 py-2">Etiquetas</th>
                <Columna orden={orden} setOrden={setOrden} por="estado">Estado</Columna>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {ordenadas.map((f) => {
                const estado = estadoVencimiento(f.vence, f.completada);
                return (
                  <tr key={f.id} className="align-top">
                    <td className="px-3 py-1.5">
                      <input
                        defaultValue={f.titulo}
                        onBlur={(e) => {
                          const t = e.target.value.trim();
                          if (t && t !== f.titulo) cambiar(f.id, { titulo: t }, () => editarTarjeta(f.id, { titulo: t }));
                        }}
                        aria-label="Nombre de la tarea"
                        className="w-full min-w-48 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none"
                      />
                      <Link href={`/tareas/${f.tablero_id}?tarjeta=${f.id}`} className="px-1 text-xs text-sky-700 hover:underline">Abrir tarjeta</Link>
                    </td>
                    <td className="px-3 py-1.5">
                      <Link href={`/tareas/${f.tablero_id}`} className="hover:underline">{f.tablero}</Link>
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={f.lista_id}
                        onChange={(e) => {
                          const l = listas.find((x) => x.id === e.target.value);
                          if (l) cambiar(f.id, { lista_id: l.id, lista: l.nombre }, () => moverTarjeta(f.id, l.id, Date.now() / 1000));
                        }}
                        aria-label="Lista"
                        className="campo w-auto py-0.5 text-sm"
                      >
                        {listas.filter((l) => l.tablero_id === f.tablero_id).map((l) => (
                          <option key={l.id} value={l.id}>{l.nombre}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {f.miembros.map((m) => (
                          <button
                            key={m}
                            type="button"
                            title={`${nombre(m)} (clic para quitar)`}
                            onClick={() => cambiar(f.id, { miembros: f.miembros.filter((x) => x !== m) }, () => responsableTarjeta(f.id, m, false))}
                          >
                            <Avatar usuario={{ id: m, nombre: nombre(m) }} tam={24} />
                          </button>
                        ))}
                        <select
                          value=""
                          onChange={(e) => {
                            const u = e.target.value;
                            if (u) cambiar(f.id, { miembros: [...f.miembros, u] }, () => responsableTarjeta(f.id, u, true));
                          }}
                          aria-label="Asignar"
                          className="w-8 rounded bg-transparent text-stone-500 hover:bg-stone-100"
                        >
                          <option value="">+</option>
                          {usuarios.filter((u) => !f.miembros.includes(u.id)).map((u) => (
                            <option key={u.id} value={u.id}>{u.nombre}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="date"
                        value={aLocal(f.vence)}
                        onChange={(e) => {
                          const d = e.target.value;
                          const vence = d ? `${d}T${f.vence ? new Date(new Date(f.vence).getTime() - 3 * 3600 * 1000).toISOString().slice(11, 16) : "18:00"}:00-03:00` : null;
                          cambiar(f.id, { vence }, () => editarTarjeta(f.id, { vence }));
                        }}
                        aria-label="Vencimiento"
                        className={`rounded px-1 py-0.5 text-sm ${estado && estado !== "normal" ? COLOR_VENCIMIENTO[estado] : "bg-stone-100"}`}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {f.etiquetas.map((e, i) => {
                          const c = colorEtiqueta(e.color);
                          return (
                            <span key={i} className="rounded px-1.5 text-[11px] font-semibold" style={{ background: c.fondo, color: c.texto }}>
                              {e.nombre || c.nombre}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <label className="flex items-center gap-1.5 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={f.completada}
                          disabled={pendiente}
                          onChange={(e) => cambiar(f.id, { completada: e.target.checked }, () => editarTarjeta(f.id, { completada: e.target.checked }))}
                          className="h-4 w-4"
                        />
                        {f.completada ? "Completada" : estado === "vencida" ? "Vencida" : "Pendiente"}
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
