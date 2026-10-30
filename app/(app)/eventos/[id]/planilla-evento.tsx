"use client";

import { useEffect, useState, useTransition } from "react";
import { armarPlanillaDesdeMovimientos, guardarPlanillaEvento } from "@/lib/eventos/acciones";
import {
  TIPOS_FACTURA,
  calcularPlanilla,
  diferenciaGasto,
  iibbIngreso,
  totalGasto,
  type Entrada,
  type Gasto,
  type Ingreso,
  type Planilla,
} from "@/lib/eventos/planilla";
import { formatoPesos } from "@/lib/formato";
import { CampoMonto } from "@/components/campo-monto";

/** Color de cada sector de gastos (fuerte para títulos y franja, suave para el fondo). */
const COLOR_SECTOR: Record<string, { fuerte: string; suave: string }> = {
  "Artística": { fuerte: "#7c3aed", suave: "#f5f3ff" },
  "Técnica": { fuerte: "#0369a1", suave: "#f0f9ff" },
  "Infraestructura": { fuerte: "#b45309", suave: "#fffbeb" },
  "Contenido y activaciones": { fuerte: "#be185d", suave: "#fdf2f8" },
  "Recursos humanos": { fuerte: "#047857", suave: "#ecfdf5" },
  "Mercadería": { fuerte: "#c2410c", suave: "#fff7ed" },
  "Gastronomía": { fuerte: "#0f766e", suave: "#f0fdfa" },
  "Seguros y aranceles": { fuerte: "#4338ca", suave: "#eef2ff" },
};
const colorSector = (nombre: string) => COLOR_SECTOR[nombre] ?? { fuerte: "#57534e", suave: "#f5f5f4" };

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
const r2 = (n: number) => Math.round(n * 100) / 100;
const celdaTexto =
  "w-full min-w-28 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none disabled:hover:border-transparent";

export function PlanillaEvento({ eventoId, inicial, editable, enFinanciero = false }: { eventoId: string; inicial: Planilla; editable: boolean; enFinanciero?: boolean }) {
  const [p, setP] = useState<Planilla>(inicial);
  const [sinGuardar, setSinGuardar] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [soloPorPagar, setSoloPorPagar] = useState(false);
  const [guardando, iniciar] = useTransition();
  const c = calcularPlanilla(p);

  const cambiar = (cambio: (p: Planilla) => Planilla) => {
    setP(cambio);
    setSinGuardar(true);
    setMensaje(null);
  };

  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar]);

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarPlanillaEvento(eventoId, p);
      if (r.planilla) setP(r.planilla);
      if (r.error) setMensaje({ tipo: "error", texto: r.error });
      else {
        setSinGuardar(false);
        setMensaje({ tipo: "ok", texto: enFinanciero ? "Planilla guardada y pasada a Financiero" : "Planilla guardada" });
      }
    });

  const armarDesdeMovimientos = () => {
    if ((p.ingresos.length || p.gastos.length) && !window.confirm("Se reemplazan los ingresos y gastos de la planilla por los movimientos del evento en Financiero (las entradas y notas quedan). ¿Seguir?")) return;
    iniciar(async () => {
      const r = await armarPlanillaDesdeMovimientos(eventoId, p);
      if (r.error || !r.planilla) setMensaje({ tipo: "error", texto: r.error ?? "No se pudo armar" });
      else {
        cambiar(() => r.planilla!);
        setMensaje({ tipo: "ok", texto: "Armada desde los movimientos. Revisala y guardá." });
      }
    });
  };

  // ─── Ingresos ───
  const editarIngreso = (i: number, cambio: Partial<Ingreso>) =>
    cambiar((p) => ({
      ...p,
      ingresos: p.ingresos.map((ing, j) => {
        if (j !== i) return ing;
        const nuevo = { ...ing, ...cambio };
        // Al cambiar el neto o la factura se recalcula el IVA (21%); el bruto sigue a neto + IVA.
        if ("neto" in cambio || "factura" in cambio) nuevo.iva = nuevo.factura ? r2(nuevo.neto * 0.21) : 0;
        if ("neto" in cambio || "factura" in cambio || "iva" in cambio) nuevo.bruto = r2(nuevo.neto + nuevo.iva);
        return nuevo;
      }),
    }));

  // ─── Gastos ───
  const editarGasto = (indice: number, cambio: Partial<Gasto>) =>
    cambiar((p) => ({
      ...p,
      gastos: p.gastos.map((g, j) => {
        if (j !== indice) return g;
        const nuevo = { ...g, ...cambio };
        // El IVA crédito sale del tipo de factura (se puede corregir a mano).
        if ("neto" in cambio || "tipo_factura" in cambio) {
          const tipo = TIPOS_FACTURA.find((t) => t.id === nuevo.tipo_factura);
          nuevo.iva = r2((nuevo.neto * (tipo?.iva ?? 0)) / 100);
        }
        return nuevo;
      }),
    }));
  const agregarGasto = (sector: string) =>
    cambiar((p) => ({ ...p, gastos: [...p.gastos, { sector, detalle: "", neto: 0, tipo_factura: "", iva: 0, urgente: false, sena: 0, datos_bancarios: "" }] }));

  return (
    <div className="space-y-6">
      {editable && (
        <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 bg-stone-100/90 px-1 py-2 backdrop-blur print:hidden">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soloPorPagar} onChange={(e) => setSoloPorPagar(e.target.checked)} />
            Ver solo lo que falta pagar
          </label>
          {mensaje && <p className={`text-sm ${mensaje.tipo === "error" ? "text-red-700" : "text-green-700"}`}>{mensaje.texto}</p>}
          {enFinanciero ? (
            <p className="ml-auto text-xs text-stone-500">Los ingresos y gastos se pasan solos a Financiero al guardar.</p>
          ) : (
            <button type="button" onClick={armarDesdeMovimientos} disabled={guardando} className="boton-secundario ml-auto">Armar desde movimientos</button>
          )}
          <button type="button" onClick={() => window.print()} className="boton-secundario">Imprimir</button>
          <button type="button" onClick={guardar} disabled={guardando || !sinGuardar} className="boton">
            {guardando ? "Guardando…" : sinGuardar ? "Guardar planilla" : "Guardada"}
          </button>
        </div>
      )}

      {/* Resumen del evento */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Cifra titulo="Total ingresos" valor={c.ingresos.bruto} color="text-green-700" />
        <Cifra titulo="Total gastos" valor={c.gastos.total} color="text-red-700" />
        <Cifra titulo="IVA a pagar" valor={c.ivaAPagar} nota={`Débito ${formatoPesos(c.ingresos.iva)} − crédito ${formatoPesos(c.gastos.iva)}`} />
        <div className="tarjeta p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">IIBB</p>
          <p className="mt-1 font-mono text-lg font-semibold">{formatoPesos(c.iibb)}</p>
          <label className="mt-1 flex items-center gap-1 text-xs text-stone-500">
            Alícuota
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={p.alicuota_iibb}
              disabled={!editable}
              onChange={(e) => cambiar((p) => ({ ...p, alicuota_iibb: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }))}
              className="w-14 rounded border border-stone-200 px-1 text-right"
            />
            % s/ neto facturado
          </label>
        </div>
        <Cifra titulo="Rentabilidad real" valor={c.rentabilidad} nota={`${pct(c.margen)} sobre ingresos`} destacado />
        <Cifra titulo="Falta pagar" valor={c.gastos.diferencia} color="text-amber-700" nota={`Pagado (señas): ${formatoPesos(c.gastos.sena)}`} />
      </section>

      {/* Ingresos */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Ingresos</h2>
        <div className="tarjeta max-h-[45vh] overflow-auto overscroll-contain p-0 print:max-h-none print:overflow-visible">
          <table className="w-full min-w-[900px] text-sm">
            <thead className={`sticky top-0 z-10 border-b shadow-sm border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500 print:static`}>
              <tr>
                <th className="px-2 py-2">Detalle</th>
                <th className="px-2 py-2 text-right">Neto</th>
                <th className="px-2 py-2 text-right">IVA débito</th>
                <th className="px-2 py-2 text-right">Bruto</th>
                <th className="px-2 py-2 text-right">IIBB</th>
                <th className="px-2 py-2 text-center">Factura</th>
                <th className="px-2 py-2 text-center">Cobrado</th>
                {editable && <th className="w-6" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {p.ingresos.map((ing, i) => (
                <tr key={i}>
                  <td className="px-1 py-0.5"><input value={ing.detalle} disabled={!editable} maxLength={200} aria-label="Detalle del ingreso" onChange={(e) => editarIngreso(i, { detalle: e.target.value })} className={`${celdaTexto} min-w-52`} /></td>
                  <td className="px-1 py-0.5"><CampoMonto valor={ing.neto} disabled={!editable} etiqueta="Neto" alCambiar={(neto) => editarIngreso(i, { neto })} /></td>
                  <td className="px-1 py-0.5"><CampoMonto valor={ing.iva} disabled={!editable} etiqueta="IVA débito" alCambiar={(iva) => editarIngreso(i, { iva })} /></td>
                  <td className="px-1 py-0.5"><CampoMonto valor={ing.bruto} disabled={!editable} etiqueta="Bruto" alCambiar={(bruto) => editarIngreso(i, { bruto })} className="font-semibold" /></td>
                  <td className="px-2 py-0.5 text-right font-mono text-stone-600">{formatoPesos(iibbIngreso(ing, p.alicuota_iibb))}</td>
                  <td className="px-2 py-0.5 text-center"><input type="checkbox" checked={ing.factura} disabled={!editable} aria-label="Factura" onChange={(e) => editarIngreso(i, { factura: e.target.checked })} /></td>
                  <td className="px-2 py-0.5 text-center"><input type="checkbox" checked={ing.pagado} disabled={!editable} aria-label="Cobrado" onChange={(e) => editarIngreso(i, { pagado: e.target.checked })} /></td>
                  {editable && (
                    <td><button type="button" onClick={() => cambiar((p) => ({ ...p, ingresos: p.ingresos.filter((_, j) => j !== i) }))} className="px-1 text-stone-400 hover:text-red-700" aria-label="Quitar ingreso">×</button></td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 border-t-2 border-stone-200 bg-stone-50 font-semibold shadow-[0_-1px_0_#e7e5e4] print:static">
              <tr>
                <td className="px-2 py-2">
                  {editable ? (
                    <button type="button" onClick={() => cambiar((p) => ({ ...p, ingresos: [...p.ingresos, { detalle: "", neto: 0, iva: 0, bruto: 0, factura: false, pagado: false }] }))} className="text-xs font-normal text-stone-600 hover:text-stone-900">
                      + Agregar ingreso
                    </button>
                  ) : "Total"}
                </td>
                <td className="px-2 py-2 text-right font-mono">{formatoPesos(c.ingresos.neto)}</td>
                <td className="px-2 py-2 text-right font-mono">{formatoPesos(c.ingresos.iva)}</td>
                <td className="px-2 py-2 text-right font-mono text-green-700">{formatoPesos(c.ingresos.bruto)}</td>
                <td className="px-2 py-2 text-right font-mono">{formatoPesos(c.ingresos.iibb)}</td>
                <td colSpan={editable ? 3 : 2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Gastos por sector */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Gastos por sector</h2>
        <div className="tarjeta max-h-[70vh] overflow-auto overscroll-contain p-0 print:max-h-none print:overflow-visible">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className={`sticky top-0 z-10 border-b shadow-sm border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500 print:static`}>
              <tr>
                <th className="px-2 py-2">Detalle</th>
                <th className="px-2 py-2 text-right">Neto</th>
                <th className="px-2 py-2">Factura</th>
                <th className="px-2 py-2 text-right">IVA crédito</th>
                <th className="px-2 py-2 text-right">Total</th>
                <th className="px-2 py-2 text-center">Urgente</th>
                <th className="px-2 py-2 text-right">Seña / pagado</th>
                <th className="px-2 py-2 text-right">Diferencia</th>
                <th className="px-2 py-2">Datos bancarios</th>
                {editable && <th className="w-6" />}
              </tr>
            </thead>
            {c.sectores.map((s) => {
              const filas = p.gastos.map((g, indice) => ({ g, indice })).filter(({ g }) => (g.sector || "Otros") === s.nombre && (!soloPorPagar || diferenciaGasto(g) > 0));
              if (soloPorPagar && !filas.length) return null;
              const color = colorSector(s.nombre);
              // Franja de color a la izquierda de todas las filas del sector.
              const franja = { boxShadow: `inset 4px 0 0 ${color.fuerte}`, printColorAdjust: "exact" as const };
              return (
                <tbody key={s.nombre} className="divide-y divide-stone-100 border-t-8 border-white first:border-t-0">
                  <tr style={{ background: color.fuerte, printColorAdjust: "exact" }}>
                    <th colSpan={editable ? 10 : 9} className="px-3 py-2 text-left text-sm font-bold uppercase tracking-wide text-white">
                      {s.nombre}
                      <span className="ml-3 text-xs font-normal normal-case opacity-80">
                        {s.gastos.length} gasto{s.gastos.length === 1 ? "" : "s"} · {formatoPesos(s.totales.total)}
                      </span>
                    </th>
                  </tr>
                  {filas.map(({ g, indice }) => (
                    <tr key={indice} className={g.urgente && diferenciaGasto(g) > 0 ? "bg-red-50/60" : ""} style={franja}>
                      <td className="px-1 py-0.5"><input value={g.detalle} disabled={!editable} maxLength={200} aria-label="Detalle del gasto" onChange={(e) => editarGasto(indice, { detalle: e.target.value })} className={`${celdaTexto} min-w-52`} /></td>
                      <td className="px-1 py-0.5"><CampoMonto valor={g.neto} disabled={!editable} etiqueta="Neto" alCambiar={(neto) => editarGasto(indice, { neto })} /></td>
                      <td className="px-1 py-0.5">
                        <select value={g.tipo_factura} disabled={!editable} aria-label="Tipo de factura" onChange={(e) => editarGasto(indice, { tipo_factura: e.target.value })} className="rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-stone-200">
                          {TIPOS_FACTURA.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-0.5"><CampoMonto valor={g.iva} disabled={!editable} etiqueta="IVA crédito" alCambiar={(iva) => editarGasto(indice, { iva })} /></td>
                      <td className="px-2 py-0.5 text-right font-mono font-semibold">{formatoPesos(totalGasto(g))}</td>
                      <td className="px-2 py-0.5 text-center"><input type="checkbox" checked={g.urgente} disabled={!editable} aria-label="Urgente" onChange={(e) => editarGasto(indice, { urgente: e.target.checked })} /></td>
                      <td className="px-1 py-0.5"><CampoMonto valor={g.sena} disabled={!editable} etiqueta="Seña o pagado" alCambiar={(sena) => editarGasto(indice, { sena })} /></td>
                      <td className={`px-2 py-0.5 text-right font-mono ${diferenciaGasto(g) > 0 ? "font-semibold text-amber-700" : "text-stone-400"}`}>{formatoPesos(diferenciaGasto(g))}</td>
                      <td className="px-1 py-0.5"><input value={g.datos_bancarios} disabled={!editable} maxLength={300} placeholder="Alias / CBU" aria-label="Datos bancarios" onChange={(e) => editarGasto(indice, { datos_bancarios: e.target.value })} className={`${celdaTexto} font-mono text-xs`} /></td>
                      {editable && (
                        <td><button type="button" onClick={() => cambiar((p) => ({ ...p, gastos: p.gastos.filter((_, j) => j !== indice) }))} className="px-1 text-stone-400 hover:text-red-700" aria-label="Quitar gasto">×</button></td>
                      )}
                    </tr>
                  ))}
                  <tr className="font-semibold" style={{ ...franja, background: color.suave, color: color.fuerte }}>
                    <td className="px-2 py-1.5">
                      {editable && !soloPorPagar ? (
                        <button type="button" onClick={() => agregarGasto(s.nombre === "Otros" ? "" : s.nombre)} className="text-xs font-normal text-stone-600 hover:text-stone-900">+ Agregar gasto</button>
                      ) : (
                        <span className="text-xs uppercase text-stone-500">Total {s.nombre}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatoPesos(s.totales.neto)}</td>
                    <td />
                    <td className="px-2 py-1.5 text-right font-mono">{formatoPesos(s.totales.iva)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatoPesos(s.totales.total)}</td>
                    <td />
                    <td className="px-2 py-1.5 text-right font-mono">{formatoPesos(s.totales.sena)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-amber-700">{formatoPesos(s.totales.diferencia)}</td>
                    <td colSpan={editable ? 2 : 1} />
                  </tr>
                </tbody>
              );
            })}
            <tfoot className="sticky bottom-0 z-10 bg-stone-900 font-semibold text-white print:static">
              <tr>
                <td className="px-2 py-2 uppercase">Total gastos</td>
                <td className="px-2 py-2 text-right font-mono">{formatoPesos(c.gastos.neto)}</td>
                <td />
                <td className="px-2 py-2 text-right font-mono">{formatoPesos(c.gastos.iva)}</td>
                <td className="px-2 py-2 text-right font-mono">{formatoPesos(c.gastos.total)}</td>
                <td />
                <td className="px-2 py-2 text-right font-mono">{formatoPesos(c.gastos.sena)}</td>
                <td className="px-2 py-2 text-right font-mono">{formatoPesos(c.gastos.diferencia)}</td>
                <td colSpan={editable ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <Entradas p={p} c={c.entradas} editable={editable} alCambiar={(entradas) => cambiar((p) => ({ ...p, entradas }))} />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Notas</h2>
        <textarea value={p.notas ?? ""} disabled={!editable} rows={3} maxLength={4000} aria-label="Notas de la planilla" onChange={(e) => cambiar((p) => ({ ...p, notas: e.target.value }))} className="campo" />
      </section>
    </div>
  );
}

function Cifra({ titulo, valor, color, nota, destacado }: { titulo: string; valor: number; color?: string; nota?: string; destacado?: boolean }) {
  return (
    <div className={`tarjeta p-4 ${destacado ? "border-stone-900" : ""}`}>
      <p className="text-xs uppercase tracking-wide text-stone-500">{titulo}</p>
      <p className={`mt-1 font-mono text-lg font-semibold ${valor < 0 ? "text-red-700" : (color ?? "")}`}>{formatoPesos(valor)}</p>
      {nota && <p className="text-xs text-stone-500">{nota}</p>}
    </div>
  );
}

function Entradas({
  p,
  c,
  editable,
  alCambiar,
}: {
  p: Planilla;
  c: ReturnType<typeof calcularPlanilla>["entradas"];
  editable: boolean;
  alCambiar: (e: Entrada[]) => void;
}) {
  const editar = (i: number, cambio: Partial<Entrada>) => alCambiar(p.entradas.map((e, j) => (j === i ? { ...e, ...cambio } : e)));
  const cantidad = (v: string) => Math.max(0, Math.round(Number(v.replace(/\./g, "")) || 0));
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Entradas</h2>
      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-2 py-2">Tipo de entrada</th>
              <th className="px-2 py-2 text-right">Valor</th>
              <th className="px-2 py-2 text-right">Vendidas</th>
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-2 py-2 text-right">Proyección</th>
              <th className="px-2 py-2 text-right">Total proyectado</th>
              {editable && <th className="w-6" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {p.entradas.map((e, i) => (
              <tr key={i}>
                <td className="px-1 py-0.5"><input value={e.detalle} disabled={!editable} maxLength={120} aria-label="Tipo de entrada" onChange={(ev) => editar(i, { detalle: ev.target.value })} className={celdaTexto} /></td>
                <td className="px-1 py-0.5"><CampoMonto valor={e.valor} disabled={!editable} etiqueta="Valor" alCambiar={(valor) => editar(i, { valor })} /></td>
                <td className="px-1 py-0.5"><input inputMode="numeric" value={e.cantidad || ""} disabled={!editable} aria-label="Vendidas" onChange={(ev) => editar(i, { cantidad: cantidad(ev.target.value) })} className={`${celdaTexto} min-w-16 text-right font-mono`} /></td>
                <td className="px-2 py-0.5 text-right font-mono font-semibold">{formatoPesos(e.valor * e.cantidad)}</td>
                <td className="px-1 py-0.5"><input inputMode="numeric" value={e.proyectada || ""} disabled={!editable} aria-label="Proyección" onChange={(ev) => editar(i, { proyectada: cantidad(ev.target.value) })} className={`${celdaTexto} min-w-16 text-right font-mono`} /></td>
                <td className="px-2 py-0.5 text-right font-mono text-stone-600">{formatoPesos(e.valor * e.proyectada)}</td>
                {editable && <td><button type="button" onClick={() => alCambiar(p.entradas.filter((_, j) => j !== i))} className="px-1 text-stone-400 hover:text-red-700" aria-label="Quitar entrada">×</button></td>}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-200 bg-stone-50 font-semibold">
            <tr>
              <td className="px-2 py-2">
                {editable ? (
                  <button type="button" onClick={() => alCambiar([...p.entradas, { detalle: "", valor: 0, cantidad: 0, proyectada: 0 }])} className="text-xs font-normal text-stone-600 hover:text-stone-900">+ Agregar tipo de entrada</button>
                ) : "Total"}
              </td>
              <td />
              <td className="px-2 py-2 text-right font-mono">{c.cantidad}</td>
              <td className="px-2 py-2 text-right font-mono text-green-700">{formatoPesos(c.total)}</td>
              <td className="px-2 py-2 text-right font-mono">{c.cantidadProyectada}</td>
              <td className="px-2 py-2 text-right font-mono">{formatoPesos(c.totalProyectado)}</td>
              {editable && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
