"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registrarEntrada } from "@/lib/stock/acciones";
import { formatoCantidad, r3, type Deposito, type FilaStock } from "@/lib/stock/tipos";
import { formatoPesos, hoy, parsearMonto, sumar } from "@/lib/formato";

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Cantidades: "1.5", "1,5" o "1.000". */
function leerCantidad(texto: string) {
  const t = texto.trim();
  if (!t) return null;
  const v = /^\d+(\.\d{1,3})?$/.test(t) ? Number(t) : parsearMonto(t);
  return v === null || !Number.isFinite(v) ? NaN : v;
}

function leerCosto(texto: string) {
  const t = texto.trim();
  if (!t) return null;
  const v = parsearMonto(t);
  return v === null || !Number.isFinite(v) ? NaN : v;
}

/**
 * Entrada de varios productos a un depósito (ej.: llega la mercadería de un
 * proveedor): se carga la cantidad y el costo de cada producto que entra.
 */
export function FormularioEntrada({ stock, depositos, productoInicial }: { stock: FilaStock[]; depositos: Deposito[]; productoInicial?: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deposito, setDeposito] = useState(depositos.length === 1 ? depositos[0].id : "");
  const [fecha, setFecha] = useState(hoy());
  const [motivo, setMotivo] = useState("");
  const [busqueda, setBusqueda] = useState(() => stock.find((f) => f.producto.id === productoInicial)?.producto.nombre ?? "");
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [costos, setCostos] = useState<Record<string, string>>({});
  const [soloCargados, setSoloCargados] = useState(false);
  // Última entrada registrada: se avisa arriba y el formulario queda vacío para otra.
  const [registrada, setRegistrada] = useState<{ id: string; productos: number; costo: number } | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const arriba = useRef<HTMLDivElement>(null);

  const ordenados = useMemo(() => [...stock].sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre, "es")), [stock]);

  const filas = ordenados.map((f) => {
    const id = f.producto.id;
    const hay = deposito ? r3(f.porDeposito[deposito] ?? 0) : null;
    const cantidad = leerCantidad(cantidades[id] ?? "");
    const costo = leerCosto(costos[id] ?? "");
    const costoActual = deposito ? (f.costoPorDeposito[deposito] ?? f.costoPromedio) : f.costoPromedio;
    const problema =
      cantidad !== null && Number.isNaN(cantidad)
        ? "Cantidad mal escrita"
        : cantidad !== null && cantidad <= 0
          ? "La cantidad tiene que ser mayor a cero"
          : costo !== null && Number.isNaN(costo)
            ? "Costo mal escrito"
            : costo !== null && costo < 0
              ? "El costo no puede ser negativo"
              : cantidad === null && costo !== null
                ? "Falta la cantidad"
                : null;
    return { f, hay, cantidad, costo, costoActual, problema };
  });
  const cargadas = filas.filter((x) => x.cantidad !== null && !x.problema);
  const costoTotal = sumar(cargadas.map((x) => (x.costo ?? 0) * (x.cantidad ?? 0)));
  const sinCosto = cargadas.filter((x) => x.costo === null).length;
  const conProblema = filas.filter((x) => x.problema);

  const termino = normalizar(busqueda.trim());
  const visibles = filas.filter(
    (x) =>
      (!soloCargados || x.cantidad !== null || x.problema) &&
      (!termino || normalizar(`${x.f.producto.nombre} ${x.f.producto.codigo ?? ""}`).includes(termino)),
  );

  /** Enter pasa de la cantidad al costo, y del costo al siguiente producto (o vuelve al buscador en el último). */
  function siguiente(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const campos = [...(lista.current?.querySelectorAll<HTMLInputElement>("input[data-campo]") ?? [])];
    const i = campos.indexOf(e.currentTarget);
    if (campos[i + 1]) campos[i + 1].focus();
    else document.getElementById("buscar-producto-entrada")?.focus();
  }

  function registrar() {
    setError(null);
    if (!deposito) return setError("Elegí el depósito");
    if (conProblema.length) return setError(`Revisá ${conProblema.length === 1 ? "el producto marcado" : `los ${conProblema.length} productos marcados`} en rojo`);
    if (!cargadas.length) return setError("Cargá la cantidad de al menos un producto");
    const lineas = cargadas.map((x) => ({ producto_id: x.f.producto.id, cantidad: x.cantidad as number, costo_unitario: x.costo }));
    iniciar(async () => {
      const r = await registrarEntrada({ deposito_id: deposito, fecha, motivo, lineas });
      if (r.error || !r.id) return setError(r.error ?? "No se pudo registrar la entrada");
      setRegistrada({ id: r.id, productos: cargadas.length, costo: costoTotal });
      setCantidades({});
      setCostos({});
      setMotivo("");
      setBusqueda("");
      setSoloCargados(false);
      setFecha(hoy());
      router.refresh();
      arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div ref={arriba} className="tarjeta scroll-mt-4 space-y-4">
      {registrada && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          <p>
            <span className="font-semibold">Entrada registrada</span> · {registrada.productos} {registrada.productos === 1 ? "producto" : "productos"} ·{" "}
            <span className="font-mono">{formatoPesos(registrada.costo)}</span> ·{" "}
            <Link href={`/stock/entradas/${registrada.id}`} className="font-medium underline">ver detalle</Link>
          </p>
          <button type="button" onClick={() => setRegistrada(null)} aria-label="Cerrar aviso" className="px-1 text-green-800 hover:text-green-950">×</button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="entrada_deposito" className="etiqueta">Depósito</label>
          <select id="entrada_deposito" value={deposito} onChange={(e) => setDeposito(e.target.value)} className="campo">
            <option value="" disabled>Elegí…</option>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="entrada_fecha" className="etiqueta">Fecha</label>
          <input id="entrada_fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="entrada_motivo" className="etiqueta">
            Motivo <span className="font-normal text-stone-400">(opcional)</span>
          </label>
          <input id="entrada_motivo" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Compra a proveedor, devolución…" className="campo" />
        </div>
      </div>

      {!deposito ? (
        <p className="text-sm text-stone-500">Elegí el depósito para cargar los productos que entran.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="buscar-producto-entrada"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                lista.current?.querySelector<HTMLInputElement>("input[data-campo]")?.focus();
              }}
              placeholder="Buscar producto por nombre o código… (Enter para ir al primero)"
              className="campo min-w-0 flex-1"
            />
            <label className="flex shrink-0 items-center gap-2 text-sm text-stone-600">
              <input type="checkbox" checked={soloCargados} onChange={(e) => setSoloCargados(e.target.checked)} />
              Ver solo los cargados ({cargadas.length})
            </label>
          </div>

          <div ref={lista} className="max-h-[60vh] overflow-auto rounded-md border border-stone-200">
            <div className="sticky top-0 z-10 hidden grid-cols-[1fr_6rem_8rem_9rem_8rem] gap-3 border-b border-stone-200 bg-stone-50 px-3 py-2 text-xs uppercase tracking-wide text-stone-500 md:grid">
              <span>Producto</span>
              <span className="text-right">Hay</span>
              <span className="text-right">Entra</span>
              <span className="text-right">Costo unit. ($)</span>
              <span className="text-right">Costo</span>
            </div>
            {visibles.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-stone-500">
                {soloCargados && !termino ? "Todavía no cargaste ningún producto." : `Ningún producto con “${busqueda}”.`}
              </p>
            )}
            <ul className="divide-y divide-stone-100">
              {visibles.map((x) => {
                const id = x.f.producto.id;
                return (
                  <li
                    key={id}
                    className={`grid grid-cols-2 items-center gap-x-3 gap-y-1.5 px-3 py-2 md:grid-cols-[1fr_6rem_8rem_9rem_8rem] md:py-1.5 ${
                      x.problema ? "bg-red-50" : x.cantidad !== null ? "bg-green-50/50" : ""
                    }`}
                  >
                    <div className="col-span-2 min-w-0 md:col-span-1">
                      <span className="font-medium">{x.f.producto.nombre}</span>
                      {x.f.producto.codigo && <span className="ml-1 font-mono text-xs text-stone-400">{x.f.producto.codigo}</span>}
                      <span className="ml-2 text-xs text-stone-500 md:hidden">
                        hay {formatoCantidad(x.hay ?? 0)} {x.f.producto.unidad}
                      </span>
                      {x.problema && <p className="text-xs text-red-700">{x.problema}</p>}
                    </div>
                    <span className="hidden whitespace-nowrap text-right font-mono text-sm text-stone-600 md:block">
                      {formatoCantidad(x.hay ?? 0)} <span className="text-xs text-stone-400">{x.f.producto.unidad}</span>
                    </span>
                    <label className="block">
                      <span className="text-xs text-stone-500 md:sr-only">Entra ({x.f.producto.unidad})</span>
                      <input
                        data-campo
                        aria-label={`Cantidad que entra de ${x.f.producto.nombre}`}
                        inputMode="decimal"
                        value={cantidades[id] ?? ""}
                        onChange={(e) => setCantidades((v) => ({ ...v, [id]: e.target.value }))}
                        onKeyDown={siguiente}
                        className="campo py-1 text-right font-mono"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-stone-500 md:sr-only">Costo unit. ($)</span>
                      <input
                        data-campo
                        aria-label={`Costo unitario de ${x.f.producto.nombre}`}
                        inputMode="decimal"
                        value={costos[id] ?? ""}
                        onChange={(e) => setCostos((v) => ({ ...v, [id]: e.target.value }))}
                        onKeyDown={siguiente}
                        placeholder={x.costoActual !== null ? formatoPesos(x.costoActual) : ""}
                        title={x.costoActual !== null ? `Costo promedio actual: ${formatoPesos(x.costoActual)}` : undefined}
                        className="campo py-1 text-right font-mono"
                      />
                    </label>
                    <span className="col-span-2 whitespace-nowrap text-right font-mono text-sm md:col-span-1">
                      {x.cantidad !== null && !x.problema ? (x.costo !== null ? formatoPesos(x.costo * x.cantidad) : <span className="text-amber-700">sin costo</span>) : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="text-xs text-stone-500">
            Los productos que dejes vacíos no entran. El costo es opcional: en gris ves el costo promedio actual, de referencia.
          </p>
        </>
      )}

      {error && <p className="alerta-error">{error}</p>}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-stone-200 pt-4">
        <p className="text-sm">
          <span className="font-semibold">{cargadas.length}</span> {cargadas.length === 1 ? "producto entra" : "productos entran"} · costo{" "}
          <span className="font-mono font-semibold">{formatoPesos(costoTotal)}</span>
          {sinCosto > 0 && <span className="text-xs text-amber-700"> ({sinCosto} sin costo cargado)</span>}
        </p>
        <button type="button" onClick={registrar} disabled={pendiente} className="boton ml-auto">
          {pendiente ? "Registrando…" : "Registrar entrada"}
        </button>
      </div>
    </div>
  );
}
