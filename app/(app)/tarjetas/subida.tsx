"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importarResumen, leerResumen } from "@/lib/tarjetas/acciones";
import { controlar, formatoDolares, type LineaTarjeta } from "@/lib/tarjetas/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { Controles } from "./controles";

type Leido = Awaited<ReturnType<typeof leerResumen>>["leido"] & {};

const TIPO = { consumo: "Consumo", cargo: "Impuesto/cargo", pago: "Pago/crédito" } as const;

function numero(texto: string) {
  const limpio = texto.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(limpio);
  return limpio && Number.isFinite(n) && n > 0 ? n : null;
}

export function SubidaResumen({ tarjetas, cotizacion }: { tarjetas: string[]; cotizacion: number | null }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [leido, setLeido] = useState<Leido | null>(null);
  const [tarjeta, setTarjeta] = useState(tarjetas[0] ?? "");
  const [cierre, setCierre] = useState("");
  const [vencimiento, setVencimiento] = useState("");
  const [cotizacionTexto, setCotizacionTexto] = useState(cotizacion ? String(cotizacion).replace(".", ",") : "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const elegir = (f: File) =>
    iniciar(async () => {
      setLeido(null);
      setError(null);
      setArchivo(f);
      const datos = new FormData();
      datos.set("archivo", f);
      const r = await leerResumen(datos);
      if (r.error || !r.leido) {
        setError(r.error ?? "No se pudo leer el PDF");
        return;
      }
      setLeido(r.leido);
      // El nombre que ya se usa manda (así los repetidos se detectan entre resúmenes de la misma tarjeta).
      const parecida = tarjetas.find((t) => t.toLowerCase() === r.leido.tarjeta.toLowerCase());
      if (parecida) setTarjeta(parecida);
      else if (!tarjetas.length) setTarjeta(r.leido.tarjeta || "Tarjeta");
      setCierre(r.leido.fecha_cierre ?? "");
      setVencimiento(r.leido.vencimiento ?? "");
    });

  const lineas: LineaTarjeta[] = leido?.lineas ?? [];
  const cotizacionUsd = numero(cotizacionTexto);
  const controles = leido ? controlar(lineas, leido) : [];
  const suma = (tipo: LineaTarjeta["tipo"], campo: "pesos" | "dolares") => lineas.filter((l) => l.tipo === tipo).reduce((s, l) => s + l[campo], 0);
  const hayDolares = lineas.some((l) => l.dolares);

  const importar = () =>
    iniciar(async () => {
      if (!archivo || !leido) return;
      setError(null);
      const datos = new FormData();
      datos.set("archivo", archivo);
      datos.set(
        "datos",
        JSON.stringify({
          tarjeta: tarjeta.trim(),
          fecha_cierre: cierre,
          vencimiento: vencimiento || null,
          cotizacion_usd: cotizacionUsd,
          saldo_anterior_ars: leido.saldo_anterior_ars,
          saldo_anterior_usd: leido.saldo_anterior_usd,
          saldo_actual_ars: leido.saldo_actual_ars,
          saldo_actual_usd: leido.saldo_actual_usd,
          total_consumos_ars: leido.total_consumos_ars,
          total_consumos_usd: leido.total_consumos_usd,
          lineas,
        }),
      );
      const r = await importarResumen(datos);
      if (r.error || !r.id) setError(r.error ?? "No se pudo importar");
      else router.push(`/tarjetas/${r.id}${r.repetidas ? `?repetidas=${r.repetidas}` : ""}`);
    });

  return (
    <section className="tarjeta space-y-4">
      <h2 className="font-semibold">Subir resumen</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="boton cursor-pointer">
          {pendiente && !leido ? "Leyendo el PDF…" : "Elegir PDF del resumen"}
          <input
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            disabled={pendiente}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) elegir(f);
            }}
          />
        </label>
        <p className="text-xs text-stone-500">PDF del banco, digital o escaneado (lo lee la IA; puede tardar un minuto). Hasta 10 MB.</p>
      </div>
      {archivo && <p className="text-sm text-stone-600">Archivo: <span className="font-medium">{archivo.name}</span></p>}
      {error && <p className="alerta-error">{error}</p>}

      {leido && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="tarjeta" className="etiqueta">Tarjeta</label>
              <input id="tarjeta" list="tarjetas-usadas" value={tarjeta} onChange={(e) => setTarjeta(e.target.value)} className="campo" maxLength={60} />
              <datalist id="tarjetas-usadas">
                {tarjetas.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              {leido.tarjeta && leido.tarjeta !== tarjeta && <p className="mt-1 text-xs text-stone-500">En el PDF dice: {leido.tarjeta}</p>}
            </div>
            <div>
              <label htmlFor="cierre" className="etiqueta">Fecha de cierre</label>
              <input id="cierre" type="date" value={cierre} onChange={(e) => setCierre(e.target.value)} className="campo" />
            </div>
            <div>
              <label htmlFor="vencimiento" className="etiqueta">Vencimiento</label>
              <input id="vencimiento" type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} className="campo" />
            </div>
            <div>
              <label htmlFor="cotizacion" className="etiqueta">Cotización del dólar {hayDolares ? "" : "(no hay dólares)"}</label>
              <input id="cotizacion" inputMode="decimal" placeholder="Ej: 1550" value={cotizacionTexto} onChange={(e) => setCotizacionTexto(e.target.value)} className="campo" />
              {cotizacionTexto && !cotizacionUsd && <p className="mt-1 text-xs text-red-700">Cotización inválida</p>}
            </div>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Dato titulo={`Renglones${leido.salteadas ? ` (${leido.salteadas} salteados)` : ""}`} valor={String(lineas.length)} />
            <Dato titulo="Consumos" valor={`${formatoPesos(suma("consumo", "pesos"))} · ${formatoDolares(suma("consumo", "dolares"))}`} />
            <Dato titulo="Impuestos y cargos" valor={`${formatoPesos(suma("cargo", "pesos"))}${suma("cargo", "dolares") ? ` · ${formatoDolares(suma("cargo", "dolares"))}` : ""}`} />
            <Dato titulo="Saldo actual (PDF)" valor={`${leido.saldo_actual_ars === null ? "—" : formatoPesos(leido.saldo_actual_ars)} · ${leido.saldo_actual_usd === null ? "—" : formatoDolares(leido.saldo_actual_usd)}`} />
          </div>

          <Controles controles={controles} />

          <div className="max-h-96 overflow-auto rounded-md border border-stone-200">
            <table className="tabla-movil w-full text-sm">
              <thead className="sticky top-0 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Descripción</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2 text-right">Pesos</th>
                  <th className="px-3 py-2 text-right">Dólares</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {lineas.map((l, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-3 py-1 font-mono text-stone-600">{l.fecha ? formatoFecha(l.fecha) : "—"}</td>
                    <td className="px-3 py-1">
                      {l.descripcion}
                      {l.cuotas && <span className="ml-1 text-xs text-stone-500">(cuota {l.cuota}/{l.cuotas})</span>}
                    </td>
                    <td className="px-3 py-1 text-xs text-stone-600">{TIPO[l.tipo]}</td>
                    <td className="whitespace-nowrap px-3 py-1 text-right font-mono">{l.pesos ? formatoPesos(l.pesos) : ""}</td>
                    <td className="whitespace-nowrap px-3 py-1 text-right font-mono">{l.dolares ? formatoDolares(l.dolares) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" onClick={importar} disabled={pendiente || !lineas.length || !cierre || !tarjeta.trim() || (!!cotizacionTexto && !cotizacionUsd)} className="boton">
            {pendiente ? "Importando…" : `Importar ${lineas.length} renglones`}
          </button>
          <p className="text-xs text-stone-500">Después de importar se asigna cada consumo a una empresa. Nada pasa a Financiero hasta que lo confirmes.</p>
        </div>
      )}
    </section>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-md bg-stone-50 px-3 py-2">
      <p className="text-xs text-stone-500">{titulo}</p>
      <p className="font-mono font-medium">{valor}</p>
    </div>
  );
}
