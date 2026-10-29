"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarSalida } from "@/lib/stock/acciones";
import { costoDeSalida, formatoCantidad, r3, type Deposito, type FilaStock, type ModoSalida } from "@/lib/stock/tipos";
import type { EventoResumido } from "@/lib/financiero/tipos";
import { formatoFecha, formatoPesos, hoy, parsearMonto, sumar } from "@/lib/formato";

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

/**
 * Salida de varios productos de un depósito. Pensada para el conteo de la barra
 * al final del evento: se carga lo que quedó y sale la diferencia con lo que había.
 */
export function FormularioSalida({ stock, depositos, eventos }: { stock: FilaStock[]; depositos: Deposito[]; eventos: EventoResumido[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deposito, setDeposito] = useState(depositos.length === 1 ? depositos[0].id : "");
  const [fecha, setFecha] = useState(hoy());
  const [evento, setEvento] = useState("");
  const [modo, setModo] = useState<ModoSalida>("conteo");
  const [motivo, setMotivo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const tabla = useRef<HTMLTableSectionElement>(null);

  // Productos con stock en el depósito elegido.
  const disponibles = useMemo(
    () => (deposito ? stock.filter((f) => (f.porDeposito[deposito] ?? 0) > 0).sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre, "es")) : []),
    [stock, deposito],
  );

  const filas = disponibles.map((f) => {
    const hay = r3(f.porDeposito[deposito] ?? 0);
    const valor = leerCantidad(valores[f.producto.id] ?? "");
    const sale = valor === null || Number.isNaN(valor) ? null : modo === "conteo" ? r3(hay - valor) : valor;
    const costo = costoDeSalida(f, deposito);
    const problema =
      valor !== null && Number.isNaN(valor)
        ? "Cantidad mal escrita"
        : sale !== null && sale < 0
          ? "Contaste más de lo que había: usá un ajuste"
          : sale !== null && sale > hay
            ? `Hay ${formatoCantidad(hay)}`
            : null;
    return { f, hay, valor, sale, costo, problema };
  });
  const cargadas = filas.filter((x) => x.sale !== null && !x.problema && x.sale > 0);
  const costoTotal = sumar(cargadas.map((x) => (x.costo ?? 0) * (x.sale ?? 0)));
  const sinCosto = cargadas.filter((x) => x.costo === null).length;
  const conProblema = filas.filter((x) => x.problema);

  const termino = normalizar(busqueda.trim());
  const visibles = termino ? filas.filter((x) => normalizar(`${x.f.producto.nombre} ${x.f.producto.codigo ?? ""}`).includes(termino)) : filas;

  /** Enter pasa al siguiente producto (o vuelve al buscador en el último). */
  function siguiente(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const campos = [...(tabla.current?.querySelectorAll<HTMLInputElement>("input[data-cantidad]") ?? [])];
    const i = campos.indexOf(e.currentTarget);
    if (campos[i + 1]) campos[i + 1].focus();
    else document.getElementById("buscar-producto")?.focus();
  }

  function registrar() {
    setError(null);
    if (!deposito) return setError("Elegí el depósito");
    if (conProblema.length) return setError(`Revisá ${conProblema.length === 1 ? "el producto marcado" : `los ${conProblema.length} productos marcados`} en rojo`);
    if (!cargadas.length) return setError(modo === "conteo" ? "Cargá lo que quedó de al menos un producto" : "Cargá al menos un producto");
    const lineas = filas.filter((x) => x.valor !== null).map((x) => ({ producto_id: x.f.producto.id, valor: x.valor as number }));
    iniciar(async () => {
      const r = await registrarSalida({ deposito_id: deposito, fecha, evento_id: evento, modo, motivo, lineas });
      if (r.error) return setError(r.error);
      router.push(`/stock/salidas/${r.id}`);
    });
  }

  return (
    <div className="tarjeta space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="salida_deposito" className="etiqueta">Depósito / barra</label>
          <select id="salida_deposito" value={deposito} onChange={(e) => setDeposito(e.target.value)} className="campo">
            <option value="" disabled>Elegí…</option>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="salida_fecha" className="etiqueta">Fecha</label>
          <input id="salida_fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo" />
        </div>
        <div>
          <label htmlFor="salida_evento" className="etiqueta">
            Evento <span className="font-normal text-stone-400">(opcional)</span>
          </label>
          <select id="salida_evento" value={evento} onChange={(e) => setEvento(e.target.value)} className="campo">
            <option value="">Ninguno</option>
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre} · {formatoFecha(e.fecha)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="salida_motivo" className="etiqueta">
            Motivo <span className="font-normal text-stone-400">(opcional)</span>
          </label>
          <input id="salida_motivo" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Consumo de barra, rotura…" className="campo" />
        </div>
      </div>

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Cómo se carga</legend>
        {(
          [
            ["conteo", "Conteo final (cargo lo que quedó)"],
            ["cantidad", "Cantidad que salió"],
          ] as const
        ).map(([m, texto]) => (
          <label
            key={m}
            className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium ${modo === m ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-600"}`}
          >
            <input type="radio" name="modo_salida" value={m} checked={modo === m} onChange={() => setModo(m)} className="sr-only" />
            {texto}
          </label>
        ))}
      </fieldset>

      {!deposito ? (
        <p className="text-sm text-stone-500">Elegí el depósito para ver sus productos.</p>
      ) : disponibles.length === 0 ? (
        <p className="text-sm text-stone-500">Este depósito no tiene stock.</p>
      ) : (
        <>
          <input
            id="buscar-producto"
            type="search"
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              tabla.current?.querySelector<HTMLInputElement>("input[data-cantidad]")?.focus();
            }}
            placeholder="Buscar producto por nombre o código… (Enter para ir al primero)"
            className="campo"
          />
          <div className="max-h-[60vh] overflow-auto rounded-md border border-stone-200">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Había</th>
                  <th className="w-36 px-3 py-2 text-right">{modo === "conteo" ? "Quedó" : "Salió"}</th>
                  {modo === "conteo" && <th className="px-3 py-2 text-right">Salió</th>}
                  <th className="px-3 py-2 text-right">Costo unit.</th>
                  <th className="px-3 py-2 text-right">Costo</th>
                </tr>
              </thead>
              <tbody ref={tabla} className="divide-y divide-stone-100">
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-stone-500">Ningún producto con “{busqueda}” en este depósito.</td>
                  </tr>
                )}
                {visibles.map((x) => (
                  <tr key={x.f.producto.id} className={x.problema ? "bg-red-50" : x.sale ? "bg-green-50/50" : ""}>
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{x.f.producto.nombre}</span>
                      {x.f.producto.codigo && <span className="ml-1 font-mono text-xs text-stone-400">{x.f.producto.codigo}</span>}
                      {x.problema && <p className="text-xs text-red-700">{x.problema}</p>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-stone-600">
                      {formatoCantidad(x.hay)} <span className="text-xs text-stone-400">{x.f.producto.unidad}</span>
                    </td>
                    <td className="px-3 py-1">
                      <input
                        data-cantidad
                        aria-label={`${modo === "conteo" ? "Quedó" : "Salió"} de ${x.f.producto.nombre}`}
                        inputMode="decimal"
                        value={valores[x.f.producto.id] ?? ""}
                        onChange={(e) => setValores((v) => ({ ...v, [x.f.producto.id]: e.target.value }))}
                        onKeyDown={siguiente}
                        className="campo py-1 text-right font-mono"
                      />
                    </td>
                    {modo === "conteo" && (
                      <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono font-medium text-red-700">
                        {x.sale !== null && !x.problema && x.sale > 0 ? `−${formatoCantidad(x.sale)}` : ""}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-stone-600">{x.costo !== null ? formatoPesos(x.costo) : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">
                      {x.sale && !x.problema && x.sale > 0 ? (x.costo !== null ? formatoPesos(x.costo * x.sale) : "sin costo") : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {modo === "conteo" && <p className="text-xs text-stone-500">Los productos que dejes vacíos no se cuentan: no sale nada de ellos.</p>}
        </>
      )}

      {error && <p className="alerta-error">{error}</p>}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-stone-200 pt-4">
        <p className="text-sm">
          <span className="font-semibold">{cargadas.length}</span> {cargadas.length === 1 ? "producto sale" : "productos salen"} · costo{" "}
          <span className="font-mono font-semibold">{formatoPesos(costoTotal)}</span>
          {sinCosto > 0 && <span className="text-xs text-amber-700"> ({sinCosto} sin costo cargado)</span>}
        </p>
        <button type="button" onClick={registrar} disabled={pendiente} className="boton ml-auto">
          {pendiente ? "Registrando…" : "Registrar salida"}
        </button>
      </div>
    </div>
  );
}
