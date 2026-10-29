"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registrarSalida } from "@/lib/stock/acciones";
import { costoDeSalida, formatoCantidad, r3, type Deposito, type FilaStock } from "@/lib/stock/tipos";
import type { EventoResumido } from "@/lib/financiero/tipos";
import { formatoFecha, formatoPesos, hoy, parsearMonto, sumar } from "@/lib/formato";

type Paso = "barra" | "contar" | "revisar";
type Filtro = "todos" | "faltan" | "contados";
type Borrador = { deposito: string; evento: string; fecha: string; valores: Record<string, string> };

const CLAVE = "planix:conteo-barra";

function leerBorrador(): Borrador | null {
  try {
    const b = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as Borrador | null;
    return b && typeof b.deposito === "string" && b.valores ? b : null;
  } catch {
    return null;
  }
}
function guardarBorrador(b: Borrador | null) {
  try {
    if (b) localStorage.setItem(CLAVE, JSON.stringify(b));
    else localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento (modo privado): el conteo funciona igual, solo no se recupera.
  }
}

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** "2", "2,5", "2.5" → número; vacío → null; mal escrito → NaN. */
function leer(texto: string) {
  const t = texto.trim();
  if (!t) return null;
  const v = /^\d+(\.\d{1,3})?$/.test(t) ? Number(t) : parsearMonto(t);
  return v === null || !Number.isFinite(v) ? NaN : v;
}
const aTexto = (n: number) => String(r3(n)).replace(".", ",");

/** Conteo de la barra al final del evento, pensado para el celular. */
export function ConteoCliente({ stock, depositos, eventos }: { stock: FilaStock[]; depositos: Deposito[]; eventos: EventoResumido[] }) {
  // Si quedó un conteo sin terminar en este celular, se retoma.
  const [inicial] = useState(() => {
    const b = leerBorrador();
    return b && depositos.some((d) => d.id === b.deposito) ? b : null;
  });
  const [recuperado, setRecuperado] = useState(Boolean(inicial && Object.keys(inicial.valores).length));
  const [paso, setPaso] = useState<Paso>(inicial ? "contar" : "barra");
  const [deposito, setDeposito] = useState(inicial?.deposito ?? "");
  const [evento, setEvento] = useState(inicial?.evento ?? "");
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoy());
  const [valores, setValores] = useState<Record<string, string>>(inicial?.valores ?? {});
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  // Al elegir un filtro se congela la lista: así un producto no desaparece mientras se escribe.
  const [congelados, setCongelados] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ id: string; costo: number; productos: number } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const lista = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!deposito) return;
    guardarBorrador({ deposito, evento, fecha, valores });
  }, [paso, deposito, evento, fecha, valores]);

  const nombreBarra = depositos.find((d) => d.id === deposito)?.nombre ?? "";
  const filas = stock
    .filter((f) => (f.porDeposito[deposito] ?? 0) > 0)
    .sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre, "es"))
    .map((f) => {
      const hay = r3(f.porDeposito[deposito] ?? 0);
      const quedo = leer(valores[f.producto.id] ?? "");
      const mal = quedo !== null && (Number.isNaN(quedo) || quedo < 0 || quedo > hay);
      const sale = quedo === null || mal ? null : r3(hay - quedo);
      return { f, hay, quedo, sale, mal, costo: costoDeSalida(f, deposito) };
    });
  const contados = filas.filter((x) => x.quedo !== null && !x.mal);
  const salen = contados.filter((x) => (x.sale ?? 0) > 0);
  const costoTotal = sumar(salen.map((x) => (x.costo ?? 0) * (x.sale ?? 0)));
  const sinCosto = salen.filter((x) => x.costo === null).length;
  const conError = filas.filter((x) => x.mal);

  const termino = normalizar(busqueda.trim());
  const visibles = filas
    .filter((x) => filtro === "todos" || congelados?.has(x.f.producto.id))
    .filter((x) => !termino || normalizar(`${x.f.producto.nombre} ${x.f.producto.codigo ?? ""}`).includes(termino));

  function elegirFiltro(f: Filtro) {
    setFiltro(f);
    setCongelados(
      f === "todos" ? null : new Set(filas.filter((x) => (f === "faltan" ? x.quedo === null || x.mal : x.quedo !== null && !x.mal)).map((x) => x.f.producto.id)),
    );
  }

  const cambiar = (id: string, texto: string) => setValores((v) => ({ ...v, [id]: texto }));
  /** Suma o resta 1 a lo que quedó (si está vacío, arranca de lo que había). */
  function paso1(id: string, hay: number, delta: number) {
    const actual = leer(valores[id] ?? "");
    const base = actual === null || Number.isNaN(actual) ? hay : actual;
    cambiar(id, aTexto(Math.min(hay, Math.max(0, base + delta))));
  }

  function siguiente(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const campos = [...(lista.current?.querySelectorAll<HTMLInputElement>("input[data-quedo]") ?? [])];
    const i = campos.indexOf(e.currentTarget);
    if (campos[i + 1]) {
      campos[i + 1].focus();
      campos[i + 1].scrollIntoView({ block: "center", behavior: "smooth" });
    } else e.currentTarget.blur();
  }

  function empezarDeCero() {
    if (Object.keys(valores).length && !window.confirm("¿Borrar lo que llevás contado y empezar de cero?")) return;
    setValores({});
    setRecuperado(false);
    setCongelados(null);
    setFiltro("todos");
    setPaso("barra");
    guardarBorrador(null);
  }

  function registrar() {
    setError(null);
    iniciar(async () => {
      const r = await registrarSalida({
        deposito_id: deposito,
        fecha,
        evento_id: evento,
        modo: "conteo",
        motivo: "Conteo de barra",
        lineas: contados.map((x) => ({ producto_id: x.f.producto.id, valor: x.quedo as number })),
      });
      if (r.error || !r.id) return setError(r.error ?? "No se pudo registrar");
      // Queda registrada y todo vuelve a cero, listo para otra salida.
      setResultado({ id: r.id, costo: costoTotal, productos: salen.length });
      guardarBorrador(null);
      setValores({});
      setDeposito("");
      setEvento("");
      setFecha(hoy());
      setBusqueda("");
      setFiltro("todos");
      setCongelados(null);
      setRecuperado(false);
      setPaso("barra");
      router.refresh();
      window.scrollTo({ top: 0 });
    });
  }

  // ─── 1. Elegir la barra ─────────────────────────────────────────────────────
  if (paso === "barra") {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        {resultado && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-900">
            <div>
              <p className="font-semibold">✓ Salida registrada</p>
              <p className="text-sm">
                {resultado.productos} {resultado.productos === 1 ? "producto" : "productos"} · <span className="font-mono">{formatoPesos(resultado.costo)}</span> ·{" "}
                <Link href={`/stock/salidas/${resultado.id}`} className="font-medium underline">ver detalle</Link>
              </p>
            </div>
            <button type="button" onClick={() => setResultado(null)} aria-label="Cerrar aviso" className="px-1 text-xl leading-none">×</button>
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold">Salida por conteo</h1>
          <p className="text-sm text-stone-500">Contá lo que quedó al final del evento: lo que falta es lo que salió.</p>
        </div>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">¿Qué barra contás?</h2>
          <div className="grid gap-2">
            {depositos.map((d) => {
              const productos = stock.filter((f) => (f.porDeposito[d.id] ?? 0) > 0).length;
              return (
                <button
                  key={d.id}
                  type="button"
                  disabled={!productos}
                  onClick={() => {
                    setDeposito(d.id);
                    setPaso("contar");
                    window.scrollTo({ top: 0 });
                  }}
                  className="flex min-h-16 items-center justify-between rounded-xl border border-stone-200 bg-white px-4 text-left shadow-sm active:bg-stone-100 disabled:opacity-50"
                >
                  <span className="text-lg font-semibold">{d.nombre}</span>
                  <span className="text-sm text-stone-500">{productos ? `${productos} productos` : "Sin stock"}</span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
          <div>
            <label htmlFor="conteo_evento" className="etiqueta">Evento <span className="font-normal text-stone-400">(opcional)</span></label>
            <select id="conteo_evento" value={evento} onChange={(e) => setEvento(e.target.value)} className="campo h-12 text-base">
              <option value="">Ninguno</option>
              {eventos.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre} · {formatoFecha(e.fecha)}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="conteo_fecha" className="etiqueta">Fecha</label>
            <input id="conteo_fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo h-12 text-base" />
          </div>
        </section>
      </div>
    );
  }

  // ─── 3. Revisar ─────────────────────────────────────────────────────────────
  if (paso === "revisar") {
    const sinConsumo = contados.length - salen.length;
    return (
      <div className="mx-auto max-w-lg space-y-4 pb-36">
        <div>
          <button type="button" onClick={() => setPaso("contar")} className="text-sm text-stone-500">← Volver a contar</button>
          <h1 className="mt-1 text-2xl font-semibold">Revisá antes de confirmar</h1>
          <p className="text-sm text-stone-500">{nombreBarra} · {formatoFecha(fecha)}{evento && ` · ${eventos.find((e) => e.id === evento)?.nombre ?? ""}`}</p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-500">Costo de lo que salió</p>
          <p className="font-mono text-3xl font-semibold">{formatoPesos(costoTotal)}</p>
          <p className="text-xs text-stone-500">
            {salen.length} productos salen
            {sinConsumo > 0 && ` · ${sinConsumo} sin consumo`}
            {filas.length - contados.length > 0 && ` · ${filas.length - contados.length} sin contar (no se tocan)`}
          </p>
          {sinCosto > 0 && <p className="mt-1 text-xs text-amber-700">{sinCosto} productos no tienen costo cargado y no suman.</p>}
        </div>

        {salen.length === 0 ? (
          <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">Lo contado coincide con lo que había: no salió nada.</p>
        ) : (
          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
            {salen.map((x) => (
              <li key={x.f.producto.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{x.f.producto.nombre}</p>
                  <p className="text-xs text-stone-500">Había {formatoCantidad(x.hay)} · quedó {formatoCantidad(x.quedo as number)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono font-semibold text-red-700">−{formatoCantidad(x.sale as number)}</p>
                  <p className="font-mono text-xs text-stone-500">{x.costo !== null ? formatoPesos(x.costo * (x.sale as number)) : "sin costo"}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="alerta-error">{error}</p>}
        <BarraInferior>
          <button type="button" onClick={registrar} disabled={pendiente || salen.length === 0} className="boton h-14 w-full text-base">
            {pendiente ? "Registrando…" : `Confirmar y registrar${salen.length ? ` (${salen.length})` : ""}`}
          </button>
        </BarraInferior>
      </div>
    );
  }

  // ─── 2. Contar ──────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg pb-36">
      <div className="sticky top-0 z-20 -mx-4 space-y-2 border-b border-stone-200 bg-stone-100/95 px-4 pb-3 pt-2 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-stone-500">Salida por conteo</p>
            <p className="truncate text-lg font-semibold">{nombreBarra}</p>
          </div>
          <button type="button" onClick={empezarDeCero} className="shrink-0 rounded-lg px-2 py-1 text-sm text-stone-500 active:bg-stone-200">
            Cambiar barra
          </button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-200" aria-hidden>
          <div className="h-full rounded-full bg-stone-900 transition-all" style={{ width: `${filas.length ? (contados.length / filas.length) * 100 : 0}%` }} />
        </div>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto…"
          aria-label="Buscar producto"
          enterKeyHint="search"
          className="campo h-11 text-base"
        />
        <div className="flex gap-2 overflow-x-auto">
          {(
            [
              ["todos", `Todos (${filas.length})`],
              ["faltan", `Faltan (${filas.length - contados.length})`],
              ["contados", `Contados (${contados.length})`],
            ] as const
          ).map(([f, texto]) => (
            <button
              key={f}
              type="button"
              onClick={() => elegirFiltro(f)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${filtro === f ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700"}`}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>

      {recuperado && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <span>Seguís con el conteo que habías empezado.</span>
          <button type="button" onClick={() => setRecuperado(false)} className="font-medium">OK</button>
        </div>
      )}

      <div ref={lista} className="mt-3 space-y-2">
        {visibles.length === 0 && (
          <p className="py-10 text-center text-sm text-stone-500">{termino ? `Nada coincide con “${busqueda}”.` : filtro === "faltan" ? "¡Ya contaste todo!" : "No hay productos."}</p>
        )}
        {visibles.map((x) => {
          const id = x.f.producto.id;
          return (
            <div key={id} className={`rounded-xl border bg-white p-3 shadow-sm ${x.mal ? "border-red-300" : x.quedo !== null ? "border-green-300" : "border-stone-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold leading-tight">{x.f.producto.nombre}</p>
                  <p className="text-sm text-stone-500">
                    Había <span className="font-mono font-medium text-stone-700">{formatoCantidad(x.hay)}</span> {x.f.producto.unidad}
                  </p>
                </div>
                {x.sale !== null && (
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold ${x.sale > 0 ? "bg-red-100 text-red-800" : "bg-stone-100 text-stone-600"}`}>
                    {x.sale > 0 ? `Salen ${formatoCantidad(x.sale)}` : "Sin consumo"}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" aria-label={`Restar uno a ${x.f.producto.nombre}`} onClick={() => paso1(id, x.hay, -1)} className="h-12 w-12 shrink-0 rounded-lg border border-stone-300 bg-stone-50 text-2xl font-medium active:bg-stone-200">
                  −
                </button>
                <input
                  data-quedo
                  inputMode="decimal"
                  enterKeyHint="next"
                  aria-label={`Quedó de ${x.f.producto.nombre}`}
                  placeholder="¿Cuánto quedó?"
                  value={valores[id] ?? ""}
                  onChange={(e) => cambiar(id, e.target.value)}
                  onKeyDown={siguiente}
                  className={`h-12 min-w-0 flex-1 rounded-lg border px-3 text-center font-mono text-xl outline-none placeholder:font-sans placeholder:text-base focus:ring-2 focus:ring-stone-900/20 ${x.mal ? "border-red-400 bg-red-50" : "border-stone-300"}`}
                />
                <button type="button" aria-label={`Sumar uno a ${x.f.producto.nombre}`} onClick={() => paso1(id, x.hay, 1)} className="h-12 w-12 shrink-0 rounded-lg border border-stone-300 bg-stone-50 text-2xl font-medium active:bg-stone-200">
                  +
                </button>
              </div>
              <div className="mt-2 flex gap-2 text-sm">
                <button type="button" onClick={() => cambiar(id, aTexto(x.hay))} className="rounded-lg border border-stone-200 px-3 py-1.5 text-stone-600 active:bg-stone-100">Quedó todo</button>
                <button type="button" onClick={() => cambiar(id, "0")} className="rounded-lg border border-stone-200 px-3 py-1.5 text-stone-600 active:bg-stone-100">No quedó nada</button>
                {valores[id] && (
                  <button type="button" onClick={() =>
                      setValores((v) => {
                        const resto = { ...v };
                        delete resto[id];
                        return resto;
                      })
                    } className="ml-auto px-2 py-1.5 text-stone-400 active:text-stone-700">Borrar</button>
                )}
              </div>
              {x.mal && <p className="mt-1 text-sm text-red-700">{Number.isNaN(x.quedo) ? "Número mal escrito" : `No puede quedar más de lo que había (${formatoCantidad(x.hay)})`}</p>}
            </div>
          );
        })}
      </div>

      <BarraInferior>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-stone-500">{contados.length} de {filas.length} contados · {salen.length} salen</p>
            <p className="font-mono text-lg font-semibold">{formatoPesos(costoTotal)}</p>
          </div>
          <button
            type="button"
            disabled={!contados.length}
            onClick={() => {
              if (conError.length) return elegirFiltro("faltan");
              setPaso("revisar");
              window.scrollTo({ top: 0 });
            }}
            className="boton h-12 shrink-0 px-6 text-base"
          >
            {conError.length ? `Corregir (${conError.length})` : "Revisar"}
          </button>
        </div>
      </BarraInferior>
    </div>
  );
}

/** Barra fija abajo de la pantalla (respeta la barra del celular y el menú lateral en la compu). */
function BarraInferior({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 px-4 pt-3 backdrop-blur md:left-60" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto max-w-lg">{children}</div>
    </div>
  );
}
