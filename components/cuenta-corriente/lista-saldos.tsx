"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import type { TipoCuenta } from "@/lib/cuentas/tipos";
import { NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";
import { formatoPesos, sumar } from "@/lib/formato";
import { FormularioCargo } from "./formulario-pago";

type Ficha = { id: string; nombre: string; documento: string; saldo: number };

/**
 * Cuentas corrientes (proveedores o clientes) de una empresa: cada una con su
 * saldo y "+ Movimiento"; al entrar se ven sus movimientos y se editan.
 */
export function ListaSaldos({
  tipo,
  empresa,
  cuentas,
  sinCuenta,
  ruta,
  texto,
  categorias,
  categoriaDefecto,
  editable,
}: {
  tipo: TipoCuenta;
  empresa: Empresa;
  /** Los que ya tienen movimientos con esta empresa. */
  cuentas: Ficha[];
  /** Los que todavía no: se les puede abrir la cuenta con su primer movimiento. */
  sinCuenta: Ficha[];
  /** Esta página: la cuenta de cada uno es "<ruta>/<id>". */
  ruta: string;
  /** "Le debemos" o "Nos deben". */
  texto: string;
  categorias: { id: string; nombre: string }[];
  categoriaDefecto: string;
  editable: boolean;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [elegida, setElegida] = useState("");
  const ordenadas = [...cuentas].sort((a, b) => b.saldo - a.saldo || a.nombre.localeCompare(b.nombre, "es"));
  const total = sumar(cuentas.map((f) => f.saldo));
  const formulario = { tipo, empresa, categorias, categoriaDefecto };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editable && sinCuenta.length > 0 ? (
          <button type="button" onClick={() => setNueva(!nueva)} className="boton-secundario">+ Nueva cuenta</button>
        ) : (
          <span />
        )}
        <p className="text-sm">
          {texto} en total: <span className="font-mono text-lg font-semibold">{formatoPesos(total)}</span>
        </p>
      </div>

      {nueva && (
        <div className="space-y-3">
          <div className="tarjeta">
            <label htmlFor="nueva_cuenta" className="etiqueta">¿De quién es la cuenta?</label>
            <select id="nueva_cuenta" value={elegida} onChange={(e) => setElegida(e.target.value)} className="campo max-w-md">
              <option value="">Elegí…</option>
              {sinCuenta.map((f) => (
                <option key={f.id} value={f.id}>{f.nombre}</option>
              ))}
            </select>
          </div>
          {elegida && (
            <FormularioCargo
              key={elegida}
              {...formulario}
              id={elegida}
              alTerminar={() => {
                setNueva(false);
                setElegida("");
              }}
            />
          )}
        </div>
      )}

      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">CUIT / DNI</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              {editable && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {ordenadas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-stone-500">No hay cuentas corrientes con {NOMBRE_EMPRESA[empresa]}.</td>
              </tr>
            )}
            {ordenadas.map((f) => (
              <Fragment key={f.id}>
                <tr className="hover:bg-stone-50">
                  <td className="px-4 py-2">
                    <Link href={`${ruta}/${f.id}?empresa=${empresa}`} className="font-medium underline decoration-stone-300 hover:decoration-stone-900">{f.nombre}</Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-stone-600">{f.documento}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-mono font-semibold">{formatoPesos(f.saldo)}</td>
                  {editable && (
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <button type="button" onClick={() => setAbierta(abierta === f.id ? null : f.id)} className="text-xs font-medium underline">+ Movimiento</button>
                    </td>
                  )}
                </tr>
                {abierta === f.id && (
                  <tr>
                    <td colSpan={4} className="bg-stone-50 p-3">
                      <FormularioCargo {...formulario} id={f.id} alTerminar={() => setAbierta(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
