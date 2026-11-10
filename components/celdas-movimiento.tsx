"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { editarCampoMovimiento } from "@/lib/financiero/acciones";
import type { Categoria, EventoResumido, Transaccion } from "@/lib/financiero/tipos";

/**
 * Celdas de la lista de movimientos que se editan en el lugar (como una
 * planilla): fecha, categoría y evento. Se guardan solas al elegir; mientras
 * guardan no se pueden volver a tocar y, si falla, vuelve el valor anterior.
 */

type Guardado = "ok" | { error: string } | null;

function useGuardar(id: string, campo: "fecha" | "categoria_id" | "evento_id") {
  const [pendiente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<Guardado>(null);
  useEffect(() => {
    if (!resultado) return;
    const t = setTimeout(() => setResultado(null), resultado === "ok" ? 1500 : 5000);
    return () => clearTimeout(t);
  }, [resultado]);
  const guardar = (valor: string | null, optimista: () => void) =>
    iniciar(async () => {
      optimista();
      const r = await editarCampoMovimiento(id, campo, valor);
      setResultado(r.error ? { error: r.error } : "ok");
    });
  return { pendiente, guardar, resultado };
}

/** "✓" discreto al guardar, o el error (el valor ya volvió al anterior). */
function Aviso({ resultado }: { resultado: Guardado }) {
  if (!resultado) return null;
  if (resultado === "ok") return <span className="ml-1 text-xs font-semibold text-green-700" role="status">✓</span>;
  return (
    <span className="ml-1 block text-[11px] text-red-700" role="alert">
      {resultado.error}
    </span>
  );
}

const editable = "rounded border border-dashed border-transparent hover:border-stone-300 focus:border-stone-500 focus:outline-none disabled:opacity-60";

export function CeldaFecha({ t }: { t: Pick<Transaccion, "id" | "fecha"> }) {
  const [fecha, setFecha] = useOptimistic(t.fecha);
  const { pendiente, guardar, resultado } = useGuardar(t.id, "fecha");
  // Lo que se está escribiendo: se guarda al salir del campo o tras un momento sin cambios
  // (escribiendo día y mes, cada número ya forma una fecha válida y no hay que guardar las intermedias).
  const [borrador, setBorrador] = useState<string | null | undefined>(undefined);
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);
  const confirmar = (valor: string | null | undefined) => {
    clearTimeout(espera.current);
    setBorrador(undefined);
    if (valor !== undefined && valor !== t.fecha) guardar(valor, () => setFecha(valor));
  };
  useEffect(() => () => clearTimeout(espera.current), []);
  return (
    <span className="inline-block">
      <input
        type="date"
        aria-label="Fecha"
        title="Cambiar la fecha"
        value={(borrador === undefined ? fecha : borrador) ?? ""}
        disabled={pendiente}
        onChange={(e) => {
          const nueva = e.target.value || null;
          setBorrador(nueva);
          clearTimeout(espera.current);
          espera.current = setTimeout(() => confirmar(nueva), 1200);
        }}
        onBlur={() => borrador !== undefined && confirmar(borrador)}
        className={`${editable} w-[8.5rem] bg-transparent px-1 py-0.5 text-sm ${fecha ? "text-stone-600" : "text-amber-700"}`}
      />
      {!fecha && <span className="block text-[11px] text-amber-700">Sin fecha</span>}
      <Aviso resultado={resultado} />
    </span>
  );
}

export function CeldaCategoria({ t, categorias }: { t: Pick<Transaccion, "id" | "tipo" | "categoria">; categorias: Categoria[] }) {
  const [categoria, setCategoria] = useOptimistic(t.categoria.id);
  const { pendiente, guardar, resultado } = useGuardar(t.id, "categoria_id");
  // Las del tipo del movimiento (las desactivadas no, salvo la que ya tiene).
  const opciones = categorias.filter((c) => c.tipo === t.tipo && (c.activa !== false || c.id === t.categoria.id));
  return (
    <span className="inline-block max-w-full">
      <select
        aria-label="Categoría"
        title="Cambiar la categoría"
        value={categoria}
        disabled={pendiente}
        onChange={(e) => {
          const nueva = e.target.value;
          guardar(nueva, () => setCategoria(nueva));
        }}
        className={`${editable} max-w-full cursor-pointer bg-transparent px-1 py-0.5 text-sm text-stone-600`}
      >
        {opciones.map((c) => (
          <option key={c.id} value={c.id}>{c.nombre}</option>
        ))}
      </select>
      <Aviso resultado={resultado} />
    </span>
  );
}

/** Evento: un botón que abre un buscador con los eventos de la misma empresa (o "Sin evento"). */
export function CeldaEvento({ t, eventos }: { t: Pick<Transaccion, "id" | "empresa" | "evento">; eventos: EventoResumido[] }) {
  const [evento, setEvento] = useOptimistic(t.evento);
  const { pendiente, guardar, resultado } = useGuardar(t.id, "evento_id");
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const caja = useRef<HTMLSpanElement>(null);

  // Se cierra al tocar afuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: PointerEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  const texto = busqueda.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const propios = eventos.filter((e) => !e.empresa || e.empresa === t.empresa);
  const visibles = propios.filter((e) => !texto || e.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(texto)).slice(0, 50);
  const elegir = (nuevo: { id: string; nombre: string } | null) => {
    setAbierto(false);
    setBusqueda("");
    if ((nuevo?.id ?? null) !== (t.evento?.id ?? null)) guardar(nuevo?.id ?? null, () => setEvento(nuevo));
  };

  return (
    <span ref={caja} className="relative inline-block max-w-full">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => setAbierto(!abierto)}
        title="Cambiar el evento"
        className={`${editable} max-w-full px-1 py-0.5 text-left text-sm ${evento ? "text-stone-900" : "text-stone-400"}`}
      >
        {evento ? evento.nombre : "— sin evento"}
      </button>
      <Aviso resultado={resultado} />
      {abierto && (
        <span className="absolute left-0 top-full z-30 mt-1 block w-64 max-w-[80vw] rounded-lg border border-stone-200 bg-white p-2 text-left shadow-lg">
          <input autoFocus type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar evento…" aria-label="Buscar evento" className="campo py-1 text-sm" />
          <span className="mt-1 block max-h-56 overflow-y-auto">
            <button type="button" onClick={() => elegir(null)} className="block w-full rounded px-2 py-1.5 text-left text-sm text-stone-500 hover:bg-stone-100">
              Sin evento
            </button>
            {visibles.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => elegir({ id: e.id, nombre: e.nombre })}
                className={`block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-stone-100 ${e.id === evento?.id ? "font-semibold" : ""}`}
              >
                {e.nombre}
              </button>
            ))}
            {!visibles.length && <span className="block px-2 py-1.5 text-sm text-stone-500">No hay eventos con ese nombre.</span>}
          </span>
        </span>
      )}
    </span>
  );
}
