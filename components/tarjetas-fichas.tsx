"use client";

import { useState } from "react";
import Link from "next/link";
import { formatoFecha, formatoPesos } from "@/lib/formato";

/** Una ficha (cliente o proveedor) resumida en una tarjeta. */
export type Ficha = {
  id: string;
  nombre: string;
  documento: string;
  condicion: string;
  activo: boolean;
  contacto: string | null;
  mes: { cantidad: number; total: number };
  total: number;
  cantidad: number;
  ultima: string | null;
  /** Saldo pendiente de la cuenta corriente con la empresa elegida. */
  saldo?: number;
};

const COLORES = ["bg-sky-100 text-sky-800", "bg-amber-100 text-amber-800", "bg-violet-100 text-violet-800", "bg-emerald-100 text-emerald-800", "bg-rose-100 text-rose-800", "bg-stone-200 text-stone-700"];

/** "Simionato Anabel" → "SA"; el color sale del nombre, así cada uno tiene siempre el mismo. */
function iniciales(nombre: string) {
  const palabras = nombre.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return ((palabras[0]?.[0] ?? "") + (palabras[1]?.[0] ?? palabras[0]?.[1] ?? "")).toUpperCase();
}
const color = (nombre: string) => COLORES[[...nombre].reduce((t, c) => t + c.charCodeAt(0), 0) % COLORES.length];

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

type Rutas = {
  /** Ficha: se le agrega "/<id>". */
  ficha: string;
  /** Se agrega al link de la ficha (ej. "?empresa=ruta"). */
  consulta?: string;
  /** Botón principal; "{id}" se reemplaza por el id. */
  accion?: { texto: string; href: string };
  agregar?: { texto: string; href: string };
  /** "Le debemos" o "Nos debe": se muestra si hay saldo. */
  saldo?: string;
};

/** Grilla de tarjetas compactas con buscador (por nombre o CUIT), como Clientes y Proveedores. */
export function TarjetasFichas({ fichas: clientes, mes, editable, rutas }: { fichas: Ficha[]; mes: string; editable: boolean; rutas: Rutas }) {
  const [busqueda, setBusqueda] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const termino = normalizar(busqueda.trim());
  const soloNumeros = busqueda.replace(/\D/g, "");
  const inactivos = clientes.filter((c) => !c.activo).length;
  const visibles = clientes.filter(
    (c) =>
      (verInactivos || c.activo) &&
      (!termino || normalizar(c.nombre).includes(termino) || (soloNumeros.length >= 3 && c.documento.replace(/\D/g, "").includes(soloNumeros))),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o CUIT…" aria-label="Buscar" className="campo max-w-xs" />
        {inactivos > 0 && (
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
            Ver desactivados ({inactivos})
          </label>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {visibles.map((c) => (
          <div key={c.id} className={`tarjeta flex flex-col gap-3 p-4 ${c.activo ? "" : "opacity-60"}`}>
            <div className="flex items-start gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${color(c.nombre)}`}>{iniciales(c.nombre)}</span>
              <div className="min-w-0">
                <p className="truncate font-semibold leading-tight" title={c.nombre}>{c.nombre}</p>
                <p className="font-mono text-xs text-stone-500">{c.documento}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.condicion && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-700">{c.condicion}</span>}
                  {!c.activo && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-800">Desactivado</span>}
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-stone-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Facturado en {mes}</p>
              <p className="font-mono text-lg font-semibold">{formatoPesos(c.mes.total)}</p>
              <p className="text-xs text-stone-500">
                {c.mes.cantidad ? `${c.mes.cantidad} ${c.mes.cantidad === 1 ? "comprobante" : "comprobantes"}` : "Sin facturas este mes"}
                {c.ultima && ` · última ${formatoFecha(c.ultima)}`}
              </p>
            </div>

            {rutas.saldo && (c.saldo ?? 0) > 0 && (
              <Link href={`${rutas.ficha}/${c.id}${rutas.consulta ?? ""}#cuenta`} className="-mt-1 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100">
                <span>{rutas.saldo}</span>
                <span className="font-mono font-semibold">{formatoPesos(c.saldo ?? 0)}</span>
              </Link>
            )}

            <div className="flex gap-2">
              <Link href={`${rutas.ficha}/${c.id}${rutas.consulta ?? ""}`} className="boton-secundario flex-1 py-1.5 text-center text-sm">Ver ficha</Link>
              {editable && c.activo && rutas.accion && (
                <Link href={rutas.accion.href.replace("{id}", c.id)} className="boton flex-1 py-1.5 text-center text-sm">{rutas.accion.texto}</Link>
              )}
            </div>
          </div>
        ))}

        {editable && !termino && rutas.agregar && (
          <Link
            href={rutas.agregar.href}
            className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-300 text-stone-500 hover:border-stone-500 hover:text-stone-800"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="text-sm font-medium">{rutas.agregar.texto}</span>
          </Link>
        )}
      </div>
      {visibles.length === 0 && termino && <p className="text-sm text-stone-500">Nada coincide con “{busqueda}”.</p>}
    </div>
  );
}
