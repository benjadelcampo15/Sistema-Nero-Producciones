"use client";

import { useState, useTransition } from "react";
import { read, utils } from "xlsx";
import { importarMovimientosStock, importarProductos, type FilaExcel, type ResultadoImportacion } from "@/lib/stock/importar";
import { claveDeTitulo, plantilla } from "@/lib/plantillas";

const dos = (n: number) => String(n).padStart(2, "0");

/** Fecha de Excel (fecha real, "dd/mm/aaaa" o "aaaa-mm-dd") → "aaaa-mm-dd"; si no se entiende, se deja como vino. */
function fechaIso(v: unknown) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${dos(v.getMonth() + 1)}-${dos(v.getDate())}`;
  const t = String(v ?? "").trim();
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(t);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${dos(Number(m[2]))}-${dos(Number(m[1]))}`;
  return t;
}

/** Lee la hoja "Cargar acá" (o la primera) y arma las filas con las claves de la plantilla. */
async function leerExcel(archivo: File, idPlantilla: "stock-movimientos" | "stock-productos") {
  const p = plantilla(idPlantilla)!;
  const libro = read(await archivo.arrayBuffer(), { cellDates: true });
  const hoja = libro.Sheets["Cargar acá"] ?? libro.Sheets[libro.SheetNames[0]];
  const filas = utils.sheet_to_json<unknown[]>(hoja, { header: 1, blankrows: false, defval: "" });
  const iTitulos = filas.slice(0, 10).findIndex((f) => f.filter((c) => claveDeTitulo(p, String(c))).length >= 2);
  if (iTitulos < 0) throw new Error(`No se encontraron los títulos de la plantilla (${p.columnas.map((c) => c.titulo).join(", ")})`);
  const claves = filas[iTitulos].map((c) => claveDeTitulo(p, String(c)));
  return filas
    .slice(iTitulos + 1)
    .filter((f) => f.some((c) => String(c ?? "").trim()))
    .map((f) => {
      const fila: FilaExcel = {};
      claves.forEach((clave, i) => {
        if (!clave) return;
        const valor = f[i];
        fila[clave] = clave === "fecha" ? fechaIso(valor) : valor instanceof Date ? fechaIso(valor) : typeof valor === "number" ? valor : String(valor ?? "").trim() || null;
      });
      return fila;
    });
}

export function Importador({ tipo }: { tipo: "stock-movimientos" | "stock-productos" }) {
  const p = plantilla(tipo)!;
  const [filas, setFilas] = useState<FilaExcel[] | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const accion = tipo === "stock-movimientos" ? importarMovimientosStock : importarProductos;

  const elegir = (archivo: File) =>
    iniciar(async () => {
      setAviso(null);
      setResultado(null);
      try {
        const leidas = await leerExcel(archivo, tipo);
        setFilas(leidas);
        setNombreArchivo(archivo.name);
        setResultado(await accion(leidas, false));
      } catch (e) {
        setFilas(null);
        setAviso({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo leer el archivo" });
      }
    });

  const confirmar = () =>
    iniciar(async () => {
      if (!filas) return;
      const r = await accion(filas, true);
      setResultado(r);
      if (r.error) setAviso({ tipo: "error", texto: r.error });
      else {
        setAviso({ tipo: "ok", texto: `Listo: se importaron ${r.aplicadas} fila${r.aplicadas === 1 ? "" : "s"} de ${nombreArchivo}.` });
        setFilas(null);
      }
    });

  const errores = resultado?.resultados.filter((r) => !r.ok).length ?? 0;
  const correctas = (resultado?.resultados.length ?? 0) - errores;

  return (
    <section className="tarjeta space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{p.nombre}</h2>
          <p className="text-sm text-stone-600">{p.descripcion}</p>
        </div>
        <a href={`/plantillas/${p.id}`} className="boton-secundario">Descargar plantilla</a>
      </div>

      <label className="boton cursor-pointer">
        {pendiente ? "Revisando…" : "Elegir Excel"}
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="sr-only"
          disabled={pendiente}
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            e.target.value = "";
            if (archivo) elegir(archivo);
          }}
        />
      </label>

      {aviso && <p className={aviso.tipo === "error" ? "alerta-error" : "rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900"}>{aviso.texto}</p>}
      {resultado?.error && !aviso && <p className="alerta-error">{resultado.error}</p>}

      {resultado && resultado.resultados.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm">
            <span className="font-medium">{nombreArchivo}</span>: {correctas} fila{correctas === 1 ? "" : "s"} bien
            {errores > 0 && <span className="font-medium text-red-700"> · {errores} con errores (corregilas en el Excel y volvé a subirlo)</span>}
          </p>
          <div className="max-h-96 overflow-auto rounded-md border border-stone-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-2">Fila</th>
                  <th className="px-3 py-2">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {resultado.resultados.map((r) => (
                  <tr key={r.fila} className={r.ok ? "" : "bg-red-50"}>
                    <td className="px-3 py-1.5 font-mono text-xs text-stone-500">{r.fila}</td>
                    <td className={`px-3 py-1.5 ${r.ok ? "" : "font-medium text-red-800"}`}>{r.ok ? "✓ " : "✗ "}{r.mensaje}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filas && errores === 0 && (
            <button type="button" onClick={confirmar} disabled={pendiente} className="boton">
              {pendiente ? "Importando…" : `Confirmar e importar ${correctas} fila${correctas === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
