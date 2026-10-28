"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { confirmarSugerencias, conciliarLinea, crearDesdeLineas, deshacerLinea, ignorarLinea, borrarExtracto } from "@/lib/extractos/acciones";
import type { Conciliacion as DatosConciliacion, LineaConciliacion, MovimientoParaConciliar } from "@/lib/extractos/consultas";
import { EMPRESAS, NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { EtiquetaEmpresa } from "@/components/empresa";
import { useRouter } from "next/navigation";

type Categoria = { id: string; nombre: string; tipo: "ingreso" | "egreso" };
type Vista = "pendiente" | "conciliada" | "ignorada" | "sin_banco";

const ESTADO_MOV: Record<string, string> = { real: "real", pendiente: "pendiente", proyectado: "proyectado" };

export function Conciliacion({ c, categorias, editable }: { c: DatosConciliacion; categorias: Categoria[]; editable: boolean }) {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>("pendiente");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const correr = (accion: () => Promise<{ error?: string; ok?: string }>, alTerminar?: () => void) =>
    iniciar(async () => {
      const r = await accion();
      setMensaje(r.error ? { tipo: "error", texto: r.error } : r.ok ? { tipo: "ok", texto: r.ok } : null);
      if (!r.error) alTerminar?.();
    });

  const lineas = c.lineas.filter((l) => l.estado === vista);
  const sugerencias = c.lineas.filter((l) => l.estado === "pendiente" && l.sugerido).length;
  const seleccionadas = c.lineas.filter((l) => seleccion.has(l.id) && l.estado === "pendiente");
  const tipoSeleccion = seleccionadas.length && seleccionadas.every((l) => l.monto > 0) ? "ingreso" : seleccionadas.every((l) => l.monto < 0) ? "egreso" : null;
  const conteo = (v: Vista) => (v === "sin_banco" ? c.sinBanco.length : c.lineas.filter((l) => l.estado === v).length);

  const alternar = (id: string) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-1">
          {(
            [
              ["pendiente", "Pendientes"],
              ["conciliada", "Conciliados"],
              ["ignorada", "Ignorados"],
              ["sin_banco", "En Financiero y no en el banco"],
            ] as [Vista, string][]
          ).map(([v, nombre]) => (
            <button
              key={v}
              type="button"
              onClick={() => setVista(v)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${vista === v ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"}`}
            >
              {nombre} ({conteo(v)})
            </button>
          ))}
        </nav>
        {editable && sugerencias > 0 && (
          <button type="button" disabled={pendiente} onClick={() => correr(() => confirmarSugerencias(c.extracto.id))} className="boton ml-auto">
            Confirmar {sugerencias} coincidencia{sugerencias === 1 ? "" : "s"} sugerida{sugerencias === 1 ? "" : "s"}
          </button>
        )}
      </div>
      {mensaje && <p className={mensaje.tipo === "error" ? "alerta-error" : "rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900"}>{mensaje.texto}</p>}

      {vista === "pendiente" && editable && seleccionadas.length > 0 && (
        <CargaMasiva
          lineas={seleccionadas}
          tipo={tipoSeleccion}
          categorias={categorias}
          empresaInicial={c.cuenta.empresa}
          pendiente={pendiente}
          alCargar={(categoria_id, empresa) => correr(() => crearDesdeLineas({ lineas: seleccionadas.map((l) => l.id), categoria_id, empresa }), () => setSeleccion(new Set()))}
        />
      )}

      {vista === "sin_banco" ? (
        <SinBanco movimientos={c.sinBanco} cuenta={c.cuenta.nombre} />
      ) : (
        <section className="tarjeta divide-y divide-stone-100 p-0">
          {lineas.length === 0 && (
            <p className="p-6 text-center text-sm text-stone-500">
              {vista === "pendiente" ? "No quedan movimientos pendientes: el extracto está conciliado." : "No hay movimientos."}
            </p>
          )}
          {lineas.map((l) => (
            <Linea
              key={l.id}
              l={l}
              editable={editable}
              pendiente={pendiente}
              categorias={categorias}
              empresaInicial={c.cuenta.empresa}
              seleccionada={seleccion.has(l.id)}
              alSeleccionar={() => alternar(l.id)}
              correr={correr}
            />
          ))}
        </section>
      )}

      {editable && (
        <div className="pt-4">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => {
              if (!window.confirm("¿Borrar este extracto? Los movimientos de Financiero quedan; solo se pierde la conciliación.")) return;
              correr(() => borrarExtracto(c.extracto.id), () => router.push("/extractos"));
            }}
            className="text-sm text-red-700 underline"
          >
            Borrar extracto
          </button>
        </div>
      )}
    </div>
  );
}

function Movimiento({ m }: { m: MovimientoParaConciliar }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <EtiquetaEmpresa empresa={m.empresa} />
      <span className="font-medium">{m.descripcion}</span>
      <span className="text-xs text-stone-500">
        {m.fecha ? formatoFecha(m.fecha) : "sin fecha"} · {m.categoria}
        {m.contraparte ? ` · ${m.contraparte}` : ""} · {ESTADO_MOV[m.estado]}
      </span>
    </span>
  );
}

function Linea({
  l,
  editable,
  pendiente,
  categorias,
  empresaInicial,
  seleccionada,
  alSeleccionar,
  correr,
}: {
  l: LineaConciliacion;
  editable: boolean;
  pendiente: boolean;
  categorias: Categoria[];
  empresaInicial: Empresa;
  seleccionada: boolean;
  alSeleccionar: () => void;
  correr: (accion: () => Promise<{ error?: string; ok?: string }>, alTerminar?: () => void) => void;
}) {
  const [candidato, setCandidato] = useState(l.sugerido ?? l.candidatos[0]?.id ?? "");
  const [creando, setCreando] = useState(false);
  const tipo = l.monto > 0 ? "ingreso" : "egreso";
  const elegido = l.candidatos.find((m) => m.id === candidato);

  return (
    <div className="space-y-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {editable && l.estado === "pendiente" && (
          <input type="checkbox" checked={seleccionada} onChange={alSeleccionar} aria-label="Seleccionar para cargar en Financiero" />
        )}
        <span className="w-24 shrink-0 font-mono text-stone-600">{formatoFecha(l.fecha)}</span>
        <span className="min-w-48 flex-1">
          {l.concepto || <span className="text-stone-400">(sin concepto)</span>}
          {l.referencia && <span className="ml-1 text-xs text-stone-500">({l.referencia})</span>}
        </span>
        <span className={`w-36 text-right font-mono font-semibold ${l.monto > 0 ? "text-green-700" : "text-red-700"}`}>{formatoPesos(l.monto)}</span>
      </div>

      {l.estado === "conciliada" && (
        <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-28">
          <span className="text-xs font-semibold uppercase text-green-700">Conciliado con</span>
          {l.movimiento ? <Movimiento m={l.movimiento} /> : <span className="text-stone-500">un movimiento borrado</span>}
          {editable && (
            <button type="button" disabled={pendiente} onClick={() => correr(() => deshacerLinea(l.id))} className="ml-auto text-xs underline">
              Deshacer
            </button>
          )}
        </div>
      )}

      {l.estado === "ignorada" && (
        <div className="flex flex-wrap items-center gap-2 sm:pl-28">
          <span className="text-xs text-stone-500">Ignorado{l.nota ? `: ${l.nota}` : ""}</span>
          {editable && (
            <button type="button" disabled={pendiente} onClick={() => correr(() => deshacerLinea(l.id))} className="ml-auto text-xs underline">
              Volver a pendiente
            </button>
          )}
        </div>
      )}

      {l.estado === "pendiente" && editable && (
        <div className="space-y-2 sm:pl-28">
          {l.candidatos.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-semibold uppercase ${l.sugerido && candidato === l.sugerido ? "text-green-700" : "text-stone-500"}`}>
                {l.sugerido && candidato === l.sugerido ? "Coincide con" : "Mismo importe"}
              </span>
              {l.candidatos.length === 1 && elegido ? (
                <Movimiento m={elegido} />
              ) : (
                <select value={candidato} onChange={(e) => setCandidato(e.target.value)} aria-label="Movimiento de Financiero" className="campo w-auto max-w-full text-sm">
                  {l.candidatos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {NOMBRE_EMPRESA[m.empresa]} · {m.fecha ? formatoFecha(m.fecha) : "sin fecha"} · {m.descripcion} ({m.estado})
                    </option>
                  ))}
                </select>
              )}
              <button type="button" disabled={pendiente || !candidato} onClick={() => correr(() => conciliarLinea(l.id, candidato))} className="boton text-sm">
                Conciliar
              </button>
              {elegido && elegido.estado !== "real" && <span className="text-xs text-stone-500">pasa a real con fecha {formatoFecha(l.fecha)}</span>}
            </div>
          ) : (
            <p className="text-xs text-stone-500">No hay movimientos en Financiero con este importe.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setCreando((v) => !v)} className="text-xs font-medium underline">
              {creando ? "Cancelar" : "Cargar en Financiero"}
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => {
                const nota = window.prompt("¿Por qué no va a Financiero? (p. ej. transferencia entre cuentas propias)", "");
                if (nota !== null) correr(() => ignorarLinea(l.id, nota));
              }}
              className="text-xs text-stone-600 underline"
            >
              Ignorar
            </button>
          </div>
          {creando && (
            <FormularioCrear
              tipo={tipo}
              categorias={categorias}
              empresaInicial={empresaInicial}
              descripcionInicial={l.concepto}
              pendiente={pendiente}
              alCrear={(categoria_id, empresa, descripcion) => correr(() => crearDesdeLineas({ lineas: [l.id], categoria_id, empresa, descripcion }), () => setCreando(false))}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FormularioCrear({
  tipo,
  categorias,
  empresaInicial,
  descripcionInicial,
  pendiente,
  alCrear,
}: {
  tipo: "ingreso" | "egreso";
  categorias: Categoria[];
  empresaInicial: Empresa;
  descripcionInicial: string;
  pendiente: boolean;
  alCrear: (categoria: string, empresa: Empresa, descripcion: string) => void;
}) {
  const [categoria, setCategoria] = useState("");
  const [empresa, setEmpresa] = useState<Empresa>(empresaInicial);
  const [descripcion, setDescripcion] = useState(descripcionInicial);
  return (
    <div className="grid gap-2 rounded-md bg-stone-50 p-3 sm:grid-cols-[1fr_12rem_8rem_auto]">
      <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={200} aria-label="Descripción" className="campo text-sm" />
      <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría" className="campo text-sm">
        <option value="">Categoría de {tipo === "ingreso" ? "ingreso" : "egreso"}…</option>
        {categorias.filter((c) => c.tipo === tipo).map((c) => (
          <option key={c.id} value={c.id}>{c.nombre}</option>
        ))}
      </select>
      <select value={empresa} onChange={(e) => setEmpresa(e.target.value as Empresa)} aria-label="Empresa" className="campo text-sm">
        {EMPRESAS.map((e) => (
          <option key={e} value={e}>{NOMBRE_EMPRESA[e]}</option>
        ))}
      </select>
      <button type="button" disabled={pendiente || !categoria} onClick={() => alCrear(categoria, empresa, descripcion)} className="boton text-sm">
        Cargar como real
      </button>
    </div>
  );
}

function CargaMasiva({
  lineas,
  tipo,
  categorias,
  empresaInicial,
  pendiente,
  alCargar,
}: {
  lineas: LineaConciliacion[];
  tipo: "ingreso" | "egreso" | null;
  categorias: Categoria[];
  empresaInicial: Empresa;
  pendiente: boolean;
  alCargar: (categoria: string, empresa: Empresa) => void;
}) {
  const [categoria, setCategoria] = useState("");
  const [empresa, setEmpresa] = useState<Empresa>(empresaInicial);
  const total = lineas.reduce((s, l) => s + l.monto, 0);
  return (
    <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-stone-300 bg-white p-3 text-sm shadow">
      <span className="font-medium">
        {lineas.length} seleccionada{lineas.length === 1 ? "" : "s"} · {formatoPesos(total)}
      </span>
      {tipo === null ? (
        <span className="text-red-700">Elegí solo créditos o solo débitos para cargarlos juntos.</span>
      ) : (
        <>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría" className="campo w-auto text-sm">
            <option value="">Categoría…</option>
            {categorias.filter((c) => c.tipo === tipo).map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value as Empresa)} aria-label="Empresa" className="campo w-auto text-sm">
            {EMPRESAS.map((e) => (
              <option key={e} value={e}>{NOMBRE_EMPRESA[e]}</option>
            ))}
          </select>
          <button type="button" disabled={pendiente || !categoria} onClick={() => alCargar(categoria, empresa)} className="boton text-sm">
            Cargar en Financiero como reales
          </button>
        </>
      )}
    </div>
  );
}

function SinBanco({ movimientos, cuenta }: { movimientos: MovimientoParaConciliar[]; cuenta: string }) {
  return (
    <section className="tarjeta space-y-2 p-0">
      <p className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs text-stone-600">
        Movimientos reales de Financiero con fecha en el período, por un medio que pasa por {cuenta} (transferencia, tarjeta, cheque…), que no
        aparecen en ningún extracto. Pueden haber pasado por otra cuenta, o estar marcados como pagados sin haberse pagado.
      </p>
      {movimientos.length === 0 && <p className="p-6 text-center text-sm text-stone-500">Nada para revisar.</p>}
      <div className="divide-y divide-stone-100">
        {movimientos.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
            <span className="w-24 font-mono text-stone-600">{m.fecha ? formatoFecha(m.fecha) : ""}</span>
            <span className="flex-1">
              <Movimiento m={m} />
            </span>
            <span className={`w-36 text-right font-mono ${m.tipo === "ingreso" ? "text-green-700" : "text-red-700"}`}>
              {formatoPesos(m.tipo === "ingreso" ? m.monto : -m.monto)}
            </span>
            <Link href={`/financiero/${m.id}/editar?volver_a=${encodeURIComponent("/financiero")}`} className="text-xs underline">
              Editar
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
