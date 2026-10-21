"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { subirFactura, type ResultadoSubida } from "@/lib/facturas/acciones";
import { TAMANO_MAXIMO, TIPOS_ARCHIVO } from "@/lib/facturas/tipos";

type Item = { nombre: string; estado: "esperando" | "leyendo" | "listo" | "error"; resultado?: ResultadoSubida };

export function SubidaFacturas() {
  const [items, setItems] = useState<Item[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const ocupado = items.some((i) => i.estado === "esperando" || i.estado === "leyendo");

  async function procesar(archivos: File[]) {
    if (!archivos.length || ocupado) return;
    const nuevos: Item[] = archivos.map((a) => ({ nombre: a.name, estado: "esperando" }));
    setItems(nuevos);

    // De a uno: cada lectura con IA tarda unos segundos y así no se supera el límite de tamaño.
    for (const [i, archivo] of archivos.entries()) {
      const actualizar = (cambio: Partial<Item>) =>
        setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...cambio } : it)));

      if (archivo.size > TAMANO_MAXIMO) {
        actualizar({ estado: "error", resultado: { nombre: archivo.name, error: "Supera los 10 MB" } });
        continue;
      }
      actualizar({ estado: "leyendo" });
      const datos = new FormData();
      datos.append("archivo", archivo);
      try {
        const resultado = await subirFactura(datos);
        actualizar({ estado: resultado.error ? "error" : "listo", resultado });
      } catch {
        actualizar({ estado: "error", resultado: { nombre: archivo.name, error: "Error de conexión" } });
      }
    }
    if (entrada.current) entrada.current.value = "";
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          procesar([...e.dataTransfer.files]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
          arrastrando ? "border-stone-900 bg-stone-100" : "border-stone-300 bg-white hover:border-stone-500"
        } ${ocupado ? "pointer-events-none opacity-60" : ""}`}
      >
        <span className="font-medium">Arrastrá facturas acá o hacé clic para elegirlas</span>
        <span className="text-sm text-stone-500">PDF o foto (JPG, PNG, WEBP) · hasta 10 MB cada una</span>
        <input
          ref={entrada}
          type="file"
          multiple
          accept={TIPOS_ARCHIVO.join(",")}
          className="sr-only"
          disabled={ocupado}
          onChange={(e) => procesar([...(e.target.files ?? [])])}
        />
      </label>

      {items.length > 0 && (
        <ul className="tarjeta divide-y divide-stone-100 p-0 text-sm">
          {items.map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="truncate">{it.nombre}</span>
              <span className="shrink-0">
                {it.estado === "esperando" && <span className="text-stone-400">En espera</span>}
                {it.estado === "leyendo" && <span className="text-sky-700">Leyendo con IA…</span>}
                {it.estado === "listo" && it.resultado?.id && (
                  <Link href={`/facturas/${it.resultado.id}`} className="font-medium text-green-700 underline">
                    Revisar →
                  </Link>
                )}
                {it.estado === "error" && <span className="text-red-700">{it.resultado?.error ?? "Error"}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
