"use client";

import { createContext, use, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Categoria, EventoResumido } from "@/lib/financiero/tipos";
import type { Periodo } from "@/lib/formato";

export type ValoresFiltros = {
  empresa: string;
  desde: string;
  hasta: string;
  tipo: string;
  estado: string;
  categoria: string;
  evento: string;
  q: string;
};

type Contexto = { pendiente: boolean; aplicar: (valores: ValoresFiltros) => void };
const ContextoFiltros = createContext<Contexto | null>(null);

function useFiltros() {
  const contexto = use(ContextoFiltros);
  if (!contexto) throw new Error("Falta <ProveedorFiltros>");
  return contexto;
}

/**
 * Cambia los filtros en la URL sin recargar la página: Next solo vuelve a pedir
 * los datos del servidor y reemplaza el contenido. Mientras tanto, `pendiente`
 * atenúa los resultados.
 */
export function ProveedorFiltros({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ruta = usePathname();
  const [pendiente, iniciar] = useTransition();

  const aplicar = (valores: ValoresFiltros) => {
    const consulta = new URLSearchParams(Object.entries(valores).filter(([, v]) => v !== "")).toString();
    iniciar(() => router.replace(consulta ? `${ruta}?${consulta}` : ruta, { scroll: false }));
  };

  return <ContextoFiltros value={{ pendiente, aplicar }}>{children}</ContextoFiltros>;
}

export function ZonaResultados({ children }: { children: React.ReactNode }) {
  const { pendiente } = useFiltros();
  return (
    <div aria-busy={pendiente} className={`space-y-6 transition-opacity duration-150 ${pendiente ? "opacity-50" : ""}`}>
      {children}
    </div>
  );
}

const esFecha = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export function Filtros({
  iniciales,
  categorias,
  eventos,
  periodos,
}: {
  iniciales: ValoresFiltros;
  categorias: Categoria[];
  eventos: EventoResumido[];
  periodos: Periodo[];
}) {
  const { aplicar, pendiente } = useFiltros();
  const [valores, setValores] = useState(iniciales);
  const [escribiendo, setEscribiendo] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Si la URL cambia desde afuera (atrás/adelante del navegador), se sincronizan
  // los campos; la búsqueda se respeta mientras el usuario está escribiendo.
  const clave = JSON.stringify(iniciales);
  const [claveAnterior, setClaveAnterior] = useState(clave);
  if (clave !== claveAnterior) {
    setClaveAnterior(clave);
    setValores((v) => ({ ...iniciales, q: escribiendo ? v.q : iniciales.q }));
  }

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const cambiar = (campo: keyof ValoresFiltros, valor: string) => {
    clearTimeout(temporizador.current);
    setEscribiendo(false);
    const nuevos = { ...valores, [campo]: valor };
    // Al cambiar el tipo, se descarta una categoría del otro tipo.
    if (campo === "tipo" && valor && categorias.find((c) => c.id === nuevos.categoria)?.tipo !== valor) {
      nuevos.categoria = "";
    }
    setValores(nuevos);
    // Una fecha a medio escribir no se aplica hasta que esté completa.
    if ((campo === "desde" || campo === "hasta") && !esFecha(valor)) return;
    aplicar(nuevos);
  };

  const buscar = (q: string) => {
    const nuevos = { ...valores, q };
    setValores(nuevos);
    setEscribiendo(true);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      setEscribiendo(false);
      aplicar(nuevos);
    }, 400);
  };

  const elegirPeriodo = (p: Periodo) => {
    clearTimeout(temporizador.current);
    setEscribiendo(false);
    const nuevos = { ...valores, desde: p.desde, hasta: p.hasta };
    setValores(nuevos);
    aplicar(nuevos);
  };

  const periodoActivo = periodos.find((p) => p.desde === valores.desde && p.hasta === valores.hasta);
  const hayFiltrosExtra = valores.tipo || valores.estado || valores.categoria || valores.evento || valores.q;

  return (
    <div className="tarjeta space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {periodos.map((p) => (
          <button
            key={p.nombre}
            type="button"
            onClick={() => elegirPeriodo(p)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              periodoActivo?.nombre === p.nombre
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
            }`}
          >
            {p.nombre}
          </button>
        ))}
        {hayFiltrosExtra && (
          <button
            type="button"
            onClick={() => {
              clearTimeout(temporizador.current);
              setEscribiendo(false);
              const nuevos = { ...valores, tipo: "", estado: "", categoria: "", evento: "", q: "" };
              setValores(nuevos);
              aplicar(nuevos);
            }}
            className="text-xs text-stone-500 underline hover:text-stone-900"
          >
            Quitar filtros
          </button>
        )}
        {pendiente && <span className="ml-auto text-xs text-stone-500">Actualizando…</span>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        <div>
          <label htmlFor="desde" className="etiqueta">Desde</label>
          <input id="desde" type="date" value={valores.desde} onChange={(e) => cambiar("desde", e.target.value)} className="campo" />
        </div>
        <div>
          <label htmlFor="hasta" className="etiqueta">Hasta</label>
          <input id="hasta" type="date" value={valores.hasta} onChange={(e) => cambiar("hasta", e.target.value)} className="campo" />
        </div>
        <div>
          <label htmlFor="tipo" className="etiqueta">Tipo</label>
          <select id="tipo" value={valores.tipo} onChange={(e) => cambiar("tipo", e.target.value)} className="campo">
            <option value="">Todos</option>
            <option value="ingreso">Ingresos</option>
            <option value="egreso">Egresos</option>
          </select>
        </div>
        <div>
          <label htmlFor="estado" className="etiqueta">Estado</label>
          <select id="estado" value={valores.estado} onChange={(e) => cambiar("estado", e.target.value)} className="campo">
            <option value="">Todos</option>
            <option value="real">Real</option>
            <option value="pendiente">Pendiente</option>
            <option value="proyectado">Proyectado</option>
          </select>
        </div>
        <div>
          <label htmlFor="categoria" className="etiqueta">Categoría</label>
          <select id="categoria" value={valores.categoria} onChange={(e) => cambiar("categoria", e.target.value)} className="campo">
            <option value="">Todas</option>
            {categorias
              .filter((c) => !valores.tipo || c.tipo === valores.tipo)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {!valores.tipo && ` (${c.tipo === "ingreso" ? "ing." : "egr."})`}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor="evento" className="etiqueta">Evento</label>
          <select id="evento" value={valores.evento} onChange={(e) => cambiar("evento", e.target.value)} className="campo">
            <option value="">Todos</option>
            <option value="sin">Sin evento</option>
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="q" className="etiqueta">Buscar</label>
          <input
            id="q"
            type="search"
            value={valores.q}
            onChange={(e) => buscar(e.target.value)}
            placeholder="Descripción o proveedor"
            className="campo"
          />
        </div>
      </div>
    </div>
  );
}
