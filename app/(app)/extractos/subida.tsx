"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { read, utils } from "xlsx";
import { importarExtracto, leerPdf } from "@/lib/extractos/acciones";
import {
  CAMPOS,
  NOMBRE_CAMPO,
  armarLineas,
  campoDeTitulo,
  controlarSaldos,
  esquemaFormato,
  filaDeTitulos,
  type Campo,
  type FormatoExtracto,
  type LineaLeida,
} from "@/lib/extractos/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";

type Cuenta = { id: string; nombre: string; banco: string | null; formato: unknown };
type Planilla = { filas: unknown[][]; iTitulos: number; titulos: string[] };
type LeidoPdf = { lineas: LineaLeida[]; salteadas: number; desde: string | null; hasta: string | null; saldoInicial: number | null; saldoFinal: number | null };

function decodificar(buffer: ArrayBuffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** Formato inicial: el que se usó la última vez en la cuenta (si coinciden los títulos) o el que se adivina por los títulos. */
function formatoInicial(titulos: string[], guardado: unknown): FormatoExtracto {
  const g = esquemaFormato.safeParse(guardado);
  if (g.success && Object.values(g.data.columnas).every((t) => !t || titulos.includes(t)) && g.data.columnas.fecha) return g.data;
  const columnas: FormatoExtracto["columnas"] = {};
  for (const t of titulos) {
    const campo = campoDeTitulo(t);
    if (campo && !columnas[campo]) columnas[campo] = t;
  }
  // Con débito y crédito separados no hace falta el importe.
  if (columnas.debito || columnas.credito) delete columnas.importe;
  return { columnas, invertir: false };
}

export function SubidaExtracto({ cuentas }: { cuentas: Cuenta[] }) {
  const router = useRouter();
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? "");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [planilla, setPlanilla] = useState<Planilla | null>(null);
  const [formato, setFormato] = useState<FormatoExtracto | null>(null);
  const [pdf, setPdf] = useState<LeidoPdf | null>(null);
  const [actualizarSaldo, setActualizarSaldo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cuenta = cuentas.find((c) => c.id === cuentaId);

  const limpiar = () => {
    setPlanilla(null);
    setFormato(null);
    setPdf(null);
    setError(null);
  };

  const elegir = (f: File) =>
    iniciar(async () => {
      limpiar();
      setArchivo(f);
      try {
        if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
          const datos = new FormData();
          datos.set("archivo", f);
          const r = await leerPdf(datos);
          if (r.error || !r.leido) setError(r.error ?? "No se pudo leer el PDF");
          else setPdf(r.leido);
          return;
        }
        const buffer = await f.arrayBuffer();
        // CSV: se lee como texto sin interpretar ("1.234,56" la librería lo tomaría en formato inglés);
        // los números los lee leerNumero. Muchos bancos lo bajan en Windows-1252.
        const libro = /\.(csv|txt)$/i.test(f.name)
          ? read(decodificar(buffer), { type: "string", raw: true })
          : read(buffer, { cellDates: true });
        // La primera hoja que tenga la fila de títulos.
        for (const nombre of libro.SheetNames) {
          const filas = utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], { header: 1, blankrows: false, defval: "", raw: true });
          const iTitulos = filaDeTitulos(filas);
          if (iTitulos >= 0) {
            const titulos = filas[iTitulos].map((c) => String(c ?? "").trim());
            setPlanilla({ filas, iTitulos, titulos });
            setFormato(formatoInicial(titulos, cuenta?.formato));
            return;
          }
        }
        setError("No se encontró la fila de títulos (Fecha, Débito/Crédito o Importe…). Probá con el PDF o revisá el archivo.");
      } catch {
        setError("No se pudo leer el archivo");
      }
    });

  const armado = planilla && formato ? armarLineas(planilla.filas, planilla.iTitulos, formato) : pdf ? { lineas: pdf.lineas, salteadas: pdf.salteadas } : null;
  const lineas = armado?.lineas ?? [];
  const control = controlarSaldos(lineas);
  // Orden cronológico para el período y los saldos de punta.
  const cronologicas = control.verificable && control.descendente ? [...lineas].reverse() : lineas;
  const fechas = lineas.map((l) => l.fecha).sort();
  const desde = pdf?.desde ?? fechas[0] ?? null;
  const hasta = pdf?.hasta ?? fechas.at(-1) ?? null;
  const ultima = [...cronologicas].reverse().find((l) => l.saldo !== null);
  const primera = cronologicas.find((l) => l.saldo !== null);
  const saldoFinal = pdf?.saldoFinal ?? ultima?.saldo ?? null;
  const saldoInicial = pdf?.saldoInicial ?? (primera ? Math.round(((primera.saldo as number) - primera.monto) * 100) / 100 : null);
  const creditos = lineas.filter((l) => l.monto > 0).reduce((s, l) => s + l.monto, 0);
  const debitos = lineas.filter((l) => l.monto < 0).reduce((s, l) => s - l.monto, 0);
  const cierra =
    saldoInicial !== null && saldoFinal !== null ? Math.abs(saldoInicial + creditos - debitos - saldoFinal) < 0.05 : null;

  const importar = () =>
    iniciar(async () => {
      if (!archivo || !desde || !hasta) return;
      const datos = new FormData();
      datos.set("archivo", archivo);
      datos.set(
        "datos",
        JSON.stringify({
          cuenta_id: cuentaId,
          origen: pdf ? "pdf" : "planilla",
          desde,
          hasta,
          saldo_inicial: saldoInicial,
          saldo_final: saldoFinal,
          actualizar_saldo: actualizarSaldo && saldoFinal !== null,
          formato: pdf ? null : formato,
          lineas: cronologicas,
        }),
      );
      const r = await importarExtracto(datos);
      if (r.error || !r.id) setError(r.error ?? "No se pudo importar");
      else router.push(`/extractos/${r.id}`);
    });

  const cambiarColumna = (campo: Campo, titulo: string) =>
    setFormato((f) => {
      if (!f) return f;
      const columnas = { ...f.columnas, [campo]: titulo || undefined };
      if (!titulo) delete columnas[campo];
      return { ...f, columnas };
    });

  return (
    <section className="tarjeta space-y-4">
      <h2 className="font-semibold">Subir extracto</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="cuenta" className="etiqueta">Cuenta</label>
          <select id="cuenta" value={cuentaId} onChange={(e) => { setCuentaId(e.target.value); limpiar(); setArchivo(null); }} className="campo">
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}{c.banco && c.banco !== c.nombre ? ` · ${c.banco}` : ""}</option>
            ))}
          </select>
        </div>
        <label className="boton cursor-pointer">
          {pendiente && !lineas.length ? "Leyendo…" : "Elegir archivo"}
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.pdf"
            className="sr-only"
            disabled={pendiente}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) elegir(f);
            }}
          />
        </label>
        <p className="text-xs text-stone-500">Excel o CSV del home banking (lo más confiable) o PDF (lo lee la IA). Hasta 10 MB.</p>
      </div>
      {archivo && <p className="text-sm text-stone-600">Archivo: <span className="font-medium">{archivo.name}</span></p>}
      {error && <p className="alerta-error">{error}</p>}

      {planilla && formato && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Qué columna es cada dato</p>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
            {CAMPOS.map((campo) => (
              <div key={campo}>
                <label className="etiqueta text-xs">{NOMBRE_CAMPO[campo]}</label>
                <select value={formato.columnas[campo] ?? ""} onChange={(e) => cambiarColumna(campo, e.target.value)} className="campo text-sm">
                  <option value="">—</option>
                  {planilla.titulos.filter(Boolean).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {formato.columnas.importe && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={formato.invertir} onChange={(e) => setFormato({ ...formato, invertir: e.target.checked })} />
              Los débitos vienen en positivo (invertir el signo del importe)
            </label>
          )}
          <p className="text-xs text-stone-500">Se recuerda para la próxima vez que subas un extracto de esta cuenta.</p>
        </div>
      )}

      {armado && (
        <div className="space-y-3">
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Dato titulo="Período" valor={desde && hasta ? `${formatoFecha(desde)} al ${formatoFecha(hasta)}` : "—"} />
            <Dato titulo={`Movimientos${armado.salteadas ? ` (${armado.salteadas} filas salteadas)` : ""}`} valor={String(lineas.length)} />
            <Dato titulo="Créditos / débitos" valor={`${formatoPesos(creditos)} / ${formatoPesos(debitos)}`} />
            <Dato titulo="Saldo inicial → final" valor={`${saldoInicial === null ? "—" : formatoPesos(saldoInicial)} → ${saldoFinal === null ? "—" : formatoPesos(saldoFinal)}`} />
          </div>
          {control.verificable && control.errores > 0 && (
            <p className="alerta-error">
              En {control.errores} movimiento{control.errores === 1 ? "" : "s"} el saldo no coincide con el anterior más el importe: revisá las columnas (débito, crédito, signo).
            </p>
          )}
          {cierra === false && (
            <p className="alerta-error">El saldo inicial más créditos menos débitos no da el saldo final: puede faltar algún movimiento.</p>
          )}
          {cierra === true && (!control.verificable || control.errores === 0) && (
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">El extracto cierra: saldo inicial + créditos − débitos = saldo final.</p>
          )}

          <div className="max-h-80 overflow-auto rounded-md border border-stone-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Concepto</th>
                  <th className="px-3 py-2 text-right">Importe</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {lineas.slice(0, 200).map((l, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-3 py-1 font-mono text-stone-600">{formatoFecha(l.fecha)}</td>
                    <td className="px-3 py-1">{l.concepto}{l.referencia && <span className="ml-1 text-xs text-stone-500">({l.referencia})</span>}</td>
                    <td className={`whitespace-nowrap px-3 py-1 text-right font-mono ${l.monto > 0 ? "text-green-700" : "text-red-700"}`}>{formatoPesos(l.monto)}</td>
                    <td className="whitespace-nowrap px-3 py-1 text-right font-mono text-stone-600">{l.saldo === null ? "" : formatoPesos(l.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lineas.length > 200 && <p className="text-xs text-stone-500">Se muestran los primeros 200 de {lineas.length}.</p>}

          {saldoFinal !== null && hasta && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={actualizarSaldo} onChange={(e) => setActualizarSaldo(e.target.checked)} />
              Cargar en Saldos bancarios el saldo de {cuenta?.nombre} al {formatoFecha(hasta)}: {formatoPesos(saldoFinal)}
            </label>
          )}
          <button type="button" onClick={importar} disabled={pendiente || !lineas.length || !desde} className="boton">
            {pendiente ? "Importando…" : `Importar ${lineas.length} movimientos y conciliar`}
          </button>
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
