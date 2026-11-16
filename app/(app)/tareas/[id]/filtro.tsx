"use client";

import { useState } from "react";
import { colorEtiqueta, estadoVencimiento, type Etiqueta, type Lista, type Tarjeta, type Usuario } from "@/lib/tareas/tipos";
import { Avatar, Menu } from "../comunes";

export type Filtro = {
  texto: string;
  miembros: string[]; // "yo", "sin" o ids
  etiquetas: string[]; // "sin" o ids
  fechas: ("vencidas" | "proximas" | "sin" | "completadas" | "pendientes")[];
  listas: string[];
};
export const filtroVacio: Filtro = { texto: "", miembros: [], etiquetas: [], fechas: [], listas: [] };

/** ¿La tarjeta pasa el filtro? (dentro de cada grupo alcanza con una opción; entre grupos, todas). */
export function coincide(t: Tarjeta, f: Filtro, yo: string, listaId: string) {
  const q = f.texto.trim().toLowerCase();
  if (q && !`${t.titulo} ${t.descripcion ?? ""}`.toLowerCase().includes(q)) return false;
  if (f.listas.length && !f.listas.includes(listaId)) return false;
  if (f.miembros.length) {
    const ok = f.miembros.some((m) => (m === "sin" ? t.miembros.length === 0 : t.miembros.includes(m === "yo" ? yo : m)));
    if (!ok) return false;
  }
  if (f.etiquetas.length) {
    const ok = f.etiquetas.some((e) => (e === "sin" ? t.etiquetas.length === 0 : t.etiquetas.includes(e)));
    if (!ok) return false;
  }
  if (f.fechas.length) {
    const estado = estadoVencimiento(t.vence, t.completada);
    const ok = f.fechas.some((x) =>
      x === "vencidas"
        ? estado === "vencida"
        : x === "proximas"
          ? estado === "proxima"
          : x === "sin"
            ? !t.vence
            : x === "completadas"
              ? t.completada
              : !t.completada,
    );
    if (!ok) return false;
  }
  return true;
}

function Opcion({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-stone-100">
      <input type="checkbox" checked={activo} onChange={onClick} className="h-4 w-4" />
      {children}
    </label>
  );
}

export function FiltroTablero({
  filtro,
  setFiltro,
  etiquetas,
  usuarios,
  listas,
}: {
  filtro: Filtro;
  setFiltro: (f: Filtro) => void;
  etiquetas: Etiqueta[];
  usuarios: Usuario[];
  listas: Lista[];
}) {
  const [abierto, setAbierto] = useState(false);
  const activos = filtro.miembros.length + filtro.etiquetas.length + filtro.fechas.length + filtro.listas.length + (filtro.texto.trim() ? 1 : 0);
  const alternar = <K extends "miembros" | "etiquetas" | "fechas" | "listas">(grupo: K, valor: Filtro[K][number]) => {
    const actual = filtro[grupo] as string[];
    const nuevo = actual.includes(valor as string) ? actual.filter((x) => x !== valor) : [...actual, valor as string];
    const siguiente = { ...filtro, [grupo]: nuevo };
    setFiltro(siguiente.texto || siguiente.miembros.length || siguiente.etiquetas.length || siguiente.fechas.length || siguiente.listas.length ? siguiente : filtroVacio);
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className={`rounded px-2 py-1 text-sm hover:bg-white/20 ${activos ? "bg-white text-stone-900 hover:bg-white" : ""}`}
        aria-expanded={abierto}
      >
        ⚲ Filtros{activos ? ` (${activos})` : ""}
      </button>
      <Menu abierto={abierto} cerrar={() => setAbierto(false)} className="right-0 top-full max-h-[75vh] w-80 overflow-y-auto">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Filtrar tarjetas</p>
            {activos > 0 && (
              <button type="button" onClick={() => setFiltro(filtroVacio)} className="text-xs underline">
                Borrar filtros
              </button>
            )}
          </div>
          <input
            autoFocus
            value={filtro.texto}
            onChange={(e) => setFiltro(e.target.value || activos > (filtro.texto ? 1 : 0) ? { ...filtro, texto: e.target.value } : filtroVacio)}
            placeholder="Palabra clave (título o descripción)…"
            aria-label="Palabra clave"
            className="campo py-1 text-sm"
          />
          <div>
            <p className="mb-1 text-xs font-semibold text-stone-500">Miembros</p>
            <Opcion activo={filtro.miembros.includes("sin")} onClick={() => alternar("miembros", "sin")}>
              Sin miembros
            </Opcion>
            <Opcion activo={filtro.miembros.includes("yo")} onClick={() => alternar("miembros", "yo")}>
              Tarjetas asignadas a mí
            </Opcion>
            {usuarios.map((u) => (
              <Opcion key={u.id} activo={filtro.miembros.includes(u.id)} onClick={() => alternar("miembros", u.id)}>
                <Avatar usuario={u} tam={22} /> {u.nombre}
              </Opcion>
            ))}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-stone-500">Vencimiento</p>
            {(
              [
                ["vencidas", "Vencidas"],
                ["proximas", "Vencen en las próximas 24 h"],
                ["sin", "Sin fecha"],
                ["completadas", "Completadas"],
                ["pendientes", "Sin completar"],
              ] as const
            ).map(([v, n]) => (
              <Opcion key={v} activo={filtro.fechas.includes(v)} onClick={() => alternar("fechas", v)}>
                {n}
              </Opcion>
            ))}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-stone-500">Etiquetas</p>
            <Opcion activo={filtro.etiquetas.includes("sin")} onClick={() => alternar("etiquetas", "sin")}>
              Sin etiquetas
            </Opcion>
            {etiquetas.map((e) => {
              const c = colorEtiqueta(e.color);
              return (
                <Opcion key={e.id} activo={filtro.etiquetas.includes(e.id)} onClick={() => alternar("etiquetas", e.id)}>
                  <span className="h-6 flex-1 truncate rounded px-2 text-xs font-semibold leading-6" style={{ background: c.fondo, color: c.texto }}>
                    {e.nombre}
                  </span>
                </Opcion>
              );
            })}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-stone-500">Listas</p>
            {listas.map((l) => (
              <Opcion key={l.id} activo={filtro.listas.includes(l.id)} onClick={() => alternar("listas", l.id)}>
                {l.nombre}
              </Opcion>
            ))}
          </div>
        </div>
      </Menu>
    </div>
  );
}
