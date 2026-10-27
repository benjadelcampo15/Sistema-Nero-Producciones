"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { calcularMesRuta, type Calculado, type EventoRuta, type MesRuta } from "@/lib/objetivos/ruta";
import { cambiarActivoPersonaRuta, cerrarMesRuta, crearPersonaRuta, guardarMesRuta, reabrirMesRuta } from "@/lib/objetivos/ruta-acciones";
import { MESES } from "@/lib/objetivos/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { CampoMonto } from "@/components/campo-monto";

type Persona = { id: string; nombre: string; activo: boolean };
type TipoPersona = "cliente" | "colaborador";

const pct = (n: number) => `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)}%`;
const nuevoId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));

export function EditorRuta({
  anio,
  mes,
  inicial,
  copiadoDe,
  guardado,
  cerrado,
  clientes: clientesIniciales,
  colaboradores: colaboradoresIniciales,
  eventos,
  acumuladoAnterior,
  editable: puedeEditar,
}: {
  anio: number;
  mes: number;
  inicial: MesRuta;
  copiadoDe: string | null;
  guardado: boolean;
  cerrado: boolean;
  clientes: Persona[];
  colaboradores: Persona[];
  eventos: EventoRuta[];
  acumuladoAnterior: number;
  editable: boolean;
}) {
  const [datos, setDatos] = useState<MesRuta>(inicial);
  const [clientes, setClientes] = useState(clientesIniciales);
  const [colaboradores, setColaboradores] = useState(colaboradoresIniciales);
  const [sinGuardar, setSinGuardar] = useState(!guardado);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const editable = puedeEditar && !cerrado;

  const nombres = { clientes: new Map(clientes.map((c) => [c.id, c.nombre])), colaboradores: new Map(colaboradores.map((c) => [c.id, c.nombre])) };
  const c = calcularMesRuta(datos, nombres, eventos);

  const cambiar = (cambio: (d: MesRuta) => MesRuta) => {
    setDatos(cambio);
    setSinGuardar(true);
    setMensaje(null);
  };

  useEffect(() => {
    if (!sinGuardar || !editable) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar, editable]);

  const correr = (accion: () => Promise<{ error?: string }>, ok: string, alTerminar?: () => void) =>
    iniciar(async () => {
      const r = await accion();
      if (r.error) setMensaje({ tipo: "error", texto: r.error });
      else {
        alTerminar?.();
        setMensaje({ tipo: "ok", texto: ok });
      }
    });

  const guardar = () => correr(() => guardarMesRuta(anio, mes, datos), "Guardado", () => setSinGuardar(false));
  const cerrar = () => {
    if (sinGuardar) return setMensaje({ tipo: "error", texto: "Guardá los cambios antes de cerrar el mes" });
    if (!window.confirm("¿Cerrar el mes? Ya no se edita y la rentabilidad variable queda con los balances de los eventos de hoy.")) return;
    correr(() => cerrarMesRuta(anio, mes), "Mes cerrado");
  };

  const crearPersona = async (tipo: TipoPersona, nombre: string) => {
    const r = await crearPersonaRuta(tipo, nombre);
    if (r.error || !r.persona) {
      setMensaje({ tipo: "error", texto: r.error ?? "No se pudo crear" });
      return null;
    }
    const persona = r.persona;
    const set = tipo === "cliente" ? setClientes : setColaboradores;
    set((l) => [...l.filter((p) => p.id !== persona.id), persona].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    return persona;
  };
  const cambiarActivo = (tipo: TipoPersona, p: Persona) =>
    correr(
      () => cambiarActivoPersonaRuta(tipo, p.id, !p.activo),
      p.activo ? `${p.nombre}: de baja para los meses nuevos` : `${p.nombre}: de alta otra vez`,
      () => (tipo === "cliente" ? setClientes : setColaboradores)((l) => l.map((x) => (x.id === p.id ? { ...x, activo: !x.activo } : x))),
    );

  const totalMes = Math.round((c.rentabilidad.valor + c.variable.valor) * 100) / 100;

  return (
    <div className="space-y-4">
      {copiadoDe && !guardado && (
        <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Mes nuevo: se copiaron los clientes, porcentajes, gastos fijos y repartos de {MESES[Number(copiadoDe.slice(5)) - 1]} {copiadoDe.slice(0, 4)}. Revisalos y guardá.
        </p>
      )}
      {cerrado && (
        <p className="rounded-md border border-stone-300 bg-stone-100 px-3 py-2 text-sm text-stone-700">
          Mes cerrado: no se edita y la rentabilidad variable usa los balances de los eventos al momento del cierre.
        </p>
      )}

      {puedeEditar && (
        <div className="flex flex-wrap items-center gap-2">
          {mensaje && <p className={`text-sm ${mensaje.tipo === "error" ? "text-red-700" : "text-green-700"}`}>{mensaje.texto}</p>}
          <div className="ml-auto flex gap-2">
            {cerrado ? (
              <button type="button" onClick={() => correr(() => reabrirMesRuta(anio, mes), "Mes reabierto")} disabled={pendiente} className="boton-secundario">
                Reabrir mes
              </button>
            ) : (
              <>
                {guardado && (
                  <button type="button" onClick={cerrar} disabled={pendiente} className="boton-secundario">
                    Cerrar mes
                  </button>
                )}
                <button type="button" onClick={guardar} disabled={pendiente || !sinGuardar} className="boton">
                  {pendiente ? "Guardando…" : sinGuardar ? "Guardar" : "Guardado"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Cifra titulo="Fees netos" c={c.totalFees.neto} />
        <Cifra titulo="Rentabilidad mensual" c={c.rentabilidad} />
        <Cifra titulo="Rentabilidad variable" c={c.variable} />
        <Cifra titulo="Caja estructura" c={c.cajaEstructura} />
        <Cifra
          titulo={`Acumulado del año (a ${MESES[mes - 1].toLowerCase()})`}
          c={{ valor: Math.round((acumuladoAnterior + totalMes) * 100) / 100, formula: `${formatoPesos(acumuladoAnterior)} meses anteriores + ${formatoPesos(totalMes)} de este mes (mensual + variable)` }}
        />
      </div>

      {(c.avisos.length > 0 || datos.observaciones.length > 0) && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <h2 className="font-semibold">Para revisar</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {c.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
            {datos.observaciones.map((o, i) => (
              <li key={`o${i}`}>
                {o}
                {editable && (
                  <button
                    type="button"
                    onClick={() => cambiar((d) => ({ ...d, observaciones: d.observaciones.filter((_, j) => j !== i) }))}
                    className="ml-2 text-xs text-amber-800 underline"
                  >
                    Marcar como revisada
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Fees */}
        <Seccion titulo="Fees mensuales" ayuda="Importe neto de cada cliente. IVA 21% y bruto para facturar; IB 4% del neto, como costo.">
          <table className="w-full text-sm">
            <thead className="text-xs text-stone-500">
              <tr>
                <th className="px-3 py-1 text-left font-medium">Cliente</th>
                <th className="px-3 py-1 text-right font-medium">Neto</th>
                <th className="px-3 py-1 text-right font-medium">IVA</th>
                <th className="px-3 py-1 text-right font-medium">Bruto</th>
                <th className="px-3 py-1 text-right font-medium">IB</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {c.fees.map((f, i) => (
                <tr key={f.cliente_id}>
                  <td className="px-3 py-1">{f.cliente}</td>
                  <td className="px-1 py-1">
                    <CampoMonto
                      valor={f.neto}
                      disabled={!editable}
                      etiqueta={`Neto de ${f.cliente}`}
                      alCambiar={(n) => cambiar((d) => ({ ...d, fees: d.fees.map((x, j) => (j === i ? { ...x, neto: n } : x)) }))}
                    />
                  </td>
                  <Celda valor={f.iva} formula={`${formatoPesos(f.neto)} × 21%`} />
                  <Celda valor={f.bruto} formula="Neto + IVA" />
                  <Celda valor={f.ib} formula={`${formatoPesos(f.neto)} × 4%`} />
                  {editable && <Quitar alQuitar={() => cambiar((d) => ({ ...d, fees: d.fees.filter((_, j) => j !== i) }))} />}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-stone-200 bg-stone-50 font-semibold">
              <tr>
                <td className="px-3 py-1.5">Total</td>
                <CeldaC c={c.totalFees.neto} />
                <CeldaC c={c.totalFees.iva} />
                <CeldaC c={c.totalFees.bruto} />
                <CeldaC c={c.totalFees.ib} />
                {editable && <td />}
              </tr>
            </tfoot>
          </table>
          {editable && (
            <AgregarPersona
              tipo="cliente"
              personas={clientes}
              enUso={new Set(datos.fees.map((f) => f.cliente_id))}
              crear={crearPersona}
              alElegir={(id) => cambiar((d) => ({ ...d, fees: [...d.fees, { cliente_id: id, neto: 0 }] }))}
            />
          )}
          {puedeEditar && <Personas tipo="cliente" personas={clientes} cambiarActivo={cambiarActivo} pendiente={pendiente} />}
        </Seccion>

        {/* Sueldos */}
        <Seccion titulo="Sueldos sobre fees" ayuda={`Total neto de fees del mes × porcentaje de cada colaborador. Los one shots asignados son aparte.`}>
          <table className="w-full text-sm">
            <thead className="text-xs text-stone-500">
              <tr>
                <th className="px-3 py-1 text-left font-medium">Colaborador</th>
                <th className="px-3 py-1 text-right font-medium">%</th>
                <th className="px-3 py-1 text-right font-medium">Sueldo</th>
                <th className="px-3 py-1 text-right font-medium">One shots</th>
                <th className="px-3 py-1 text-right font-medium">Total</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {c.porColaborador.map((p) => {
                const i = datos.porcentajes.findIndex((x) => x.colaborador_id === p.colaborador_id);
                const sueldo = c.sueldos.find((s) => s.colaborador_id === p.colaborador_id);
                return (
                  <tr key={p.colaborador_id}>
                    <td className="px-3 py-1">{p.colaborador}</td>
                    <td className="w-24 px-1 py-1">
                      {i >= 0 ? (
                        <CampoMonto
                          valor={datos.porcentajes[i].porcentaje}
                          disabled={!editable}
                          etiqueta={`Porcentaje de ${p.colaborador}`}
                          alCambiar={(n) => cambiar((d) => ({ ...d, porcentajes: d.porcentajes.map((x, j) => (j === i ? { ...x, porcentaje: Math.min(100, Math.max(0, n)) } : x)) }))}
                        />
                      ) : (
                        <span className="block text-right text-xs text-stone-400">sin %</span>
                      )}
                    </td>
                    {sueldo ? <CeldaC c={sueldo.sueldo} /> : <Celda valor={0} formula="Sin porcentaje este mes" />}
                    <Celda valor={p.oneShots} formula="Suma de sus asignaciones de one shots" />
                    <Celda valor={p.total} formula="Sueldo + one shots" negrita />
                    {editable && (
                      <td className="w-8">
                        {i >= 0 && (
                          <button
                            type="button"
                            onClick={() => cambiar((d) => ({ ...d, porcentajes: d.porcentajes.filter((_, j) => j !== i) }))}
                            className="px-2 text-stone-400 hover:text-red-700"
                            aria-label={`Quitar a ${p.colaborador}`}
                          >
                            ×
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-stone-200 bg-stone-50 font-semibold">
              <tr>
                <td className="px-3 py-1.5">Total</td>
                <td className="px-3 py-1.5 text-right font-mono">{pct(c.porcentajeSueldos)}</td>
                <CeldaC c={c.totalSueldos} />
                <CeldaC c={c.totalOneShots.asignado} />
                <Celda valor={Math.round((c.totalSueldos.valor + c.totalOneShots.asignado.valor) * 100) / 100} formula="Sueldos + one shots" />
                {editable && <td />}
              </tr>
            </tfoot>
          </table>
          {editable && (
            <AgregarPersona
              tipo="colaborador"
              personas={colaboradores}
              enUso={new Set(datos.porcentajes.map((p) => p.colaborador_id))}
              crear={crearPersona}
              alElegir={(id) => cambiar((d) => ({ ...d, porcentajes: [...d.porcentajes, { colaborador_id: id, porcentaje: 0 }] }))}
            />
          )}
          {puedeEditar && <Personas tipo="colaborador" personas={colaboradores} cambiarActivo={cambiarActivo} pendiente={pendiente} />}
        </Seccion>
      </div>

      {/* One shots */}
      <Seccion
        titulo="One shots"
        ayuda="Trabajos puntuales. IVA 21% y bruto para facturar; IB 4% del neto. Saldo para estructura = neto − IB − lo asignado a empleados (se suma a la rentabilidad mensual)."
      >
        {c.oneShots.length === 0 && <p className="px-3 py-2 text-sm text-stone-500">No hay one shots este mes.</p>}
        <div className="divide-y divide-stone-200">
          {c.oneShots.map((o, i) => {
            const editar = (cambio: Partial<MesRuta["one_shots"][number]>) =>
              cambiar((d) => ({ ...d, one_shots: d.one_shots.map((x, j) => (j === i ? { ...x, ...cambio } : x)) }));
            const libres = colaboradores.filter((p) => !o.asignaciones.some((a) => a.colaborador_id === p.id) && (p.activo || datos.porcentajes.some((x) => x.colaborador_id === p.id)));
            return (
              <div key={o.id} className="grid gap-3 p-3 lg:grid-cols-[1fr_1fr]">
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_9rem_auto]">
                    <input value={o.cliente} disabled={!editable} onChange={(e) => editar({ cliente: e.target.value })} placeholder="Cliente" aria-label="Cliente del one shot" className="campo" />
                    <input value={o.descripcion} disabled={!editable} onChange={(e) => editar({ descripcion: e.target.value })} placeholder="Descripción" aria-label="Descripción del one shot" className="campo" />
                    <div className="campo flex items-center p-0">
                      <CampoMonto valor={o.neto} disabled={!editable} etiqueta="Neto del one shot" alCambiar={(n) => editar({ neto: n })} />
                    </div>
                    {editable && (
                      <button type="button" onClick={() => cambiar((d) => ({ ...d, one_shots: d.one_shots.filter((_, j) => j !== i) }))} className="text-sm text-stone-500 hover:text-red-700">
                        Quitar
                      </button>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                    <Dato titulo="IVA (no es rentabilidad)" valor={o.iva} formula={`${formatoPesos(o.neto)} × 21%`} />
                    <Dato titulo="Bruto" valor={o.bruto} formula="Neto + IVA" />
                    <Dato titulo="IB" valor={o.ib} formula={`${formatoPesos(o.neto)} × 4%`} />
                    <Dato titulo="Empleados" valor={o.asignado} formula="Suma de las asignaciones" />
                    <Dato titulo="Estructura" valor={o.estructura.valor} formula={o.estructura.formula} negrita />
                  </dl>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Asignaciones a empleados</p>
                  {o.asignaciones.map((a, k) => (
                    <div key={a.colaborador_id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1">{nombres.colaboradores.get(a.colaborador_id) ?? "Colaborador borrado"}</span>
                      <div className="w-36">
                        <CampoMonto
                          valor={a.monto}
                          disabled={!editable}
                          etiqueta="Monto asignado"
                          alCambiar={(n) => editar({ asignaciones: o.asignaciones.map((x, j) => (j === k ? { ...x, monto: n } : x)) })}
                        />
                      </div>
                      {editable && (
                        <button type="button" onClick={() => editar({ asignaciones: o.asignaciones.filter((_, j) => j !== k) })} className="px-1 text-stone-400 hover:text-red-700" aria-label="Quitar asignación">
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {editable && libres.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => e.target.value && editar({ asignaciones: [...o.asignaciones, { colaborador_id: e.target.value, monto: 0 }] })}
                      aria-label="Asignar a un empleado"
                      className="campo mt-1 text-sm"
                    >
                      <option value="">+ Asignar a…</option>
                      {libres.map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {c.oneShots.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-stone-200 bg-stone-50 px-3 py-2 text-sm sm:grid-cols-5">
            <Dato titulo="Neto total" valor={c.totalOneShots.neto.valor} formula={c.totalOneShots.neto.formula} />
            <Dato titulo="IVA total" valor={c.totalOneShots.iva.valor} formula={c.totalOneShots.iva.formula} />
            <Dato titulo="IB total" valor={c.totalOneShots.ib.valor} formula={c.totalOneShots.ib.formula} />
            <Dato titulo="Empleados" valor={c.totalOneShots.asignado.valor} formula={c.totalOneShots.asignado.formula} />
            <Dato titulo="Estructura" valor={c.totalOneShots.estructura.valor} formula={c.totalOneShots.estructura.formula} negrita />
          </dl>
        )}
        {editable && (
          <div className="px-3 py-2">
            <button
              type="button"
              onClick={() => cambiar((d) => ({ ...d, one_shots: [...d.one_shots, { id: nuevoId(), cliente: "", descripcion: "", neto: 0, asignaciones: [] }] }))}
              className="text-sm font-medium underline"
            >
              + Agregar one shot
            </button>
          </div>
        )}
      </Seccion>

      <div className="grid gap-4 xl:grid-cols-3">
        <ListaGastos
          titulo="Gastos fijos"
          filas={datos.gastos_fijos}
          total={c.fijos}
          editable={editable}
          alCambiar={(gastos_fijos) => cambiar((d) => ({ ...d, gastos_fijos }))}
        />
        <ListaGastos
          titulo="Gastos variables"
          ayuda="Se descuentan una sola vez, en la rentabilidad mensual. Los gastos de un evento cargalos como movimiento del evento: ya entran en su balance."
          filas={datos.gastos_variables}
          total={c.variables}
          editable={editable}
          alCambiar={(gastos_variables) => cambiar((d) => ({ ...d, gastos_variables }))}
        />
        <Seccion titulo="Impuestos calculados" ayuda="Los calcula el sistema: no los cargues como gastos.">
          <dl className="space-y-1 px-3 py-2 text-sm">
            <Dato titulo="IVA de fees (se cobra y se paga, no es costo)" valor={c.impuestos.ivaFees.valor} formula={c.impuestos.ivaFees.formula} fila />
            <Dato titulo="IVA de one shots (ídem)" valor={c.impuestos.ivaOneShots.valor} formula={c.impuestos.ivaOneShots.formula} fila />
            <Dato titulo="Ingresos brutos de fees (costo)" valor={c.impuestos.ibFees.valor} formula={c.impuestos.ibFees.formula} fila />
            <Dato titulo="Ingresos brutos de one shots (costo, dentro del saldo de cada one shot)" valor={c.impuestos.ibOneShots.valor} formula={c.impuestos.ibOneShots.formula} fila />
          </dl>
        </Seccion>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Seccion titulo="Rentabilidad mensual" ayuda={c.rentabilidad.formula}>
          <dl className="space-y-1 px-3 py-2 text-sm">
            {c.lineasMensual.map((l) => (
              <div key={l.concepto} className="flex justify-between gap-2">
                <dt className="text-stone-600">{l.signo > 0 ? "+" : "−"} {l.concepto}</dt>
                <dd className="font-mono">{formatoPesos(l.valor)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-2 border-t border-stone-200 pt-1 font-semibold">
              <dt>Rentabilidad mensual</dt>
              <dd className={`font-mono ${c.rentabilidad.valor < 0 ? "text-red-700" : ""}`}>{formatoPesos(c.rentabilidad.valor)}</dd>
            </div>
          </dl>
        </Seccion>

        <Seccion
          titulo="Rentabilidad variable · eventos de Ruta"
          ayuda={`Resultado del balance de cada evento de Ruta con fecha en ${MESES[mes - 1].toLowerCase()} (ingresos − egresos de sus movimientos). ${cerrado ? "Balances al cierre del mes." : "Se actualiza sola mientras el mes está abierto."}`}
        >
          {eventos.length === 0 ? (
            <p className="px-3 py-2 text-sm text-stone-500">
              No hay eventos de Ruta este mes. Se cargan en <Link href="/eventos?empresa=ruta" className="underline">Eventos → Ruta</Link>.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-stone-500">
                <tr>
                  <th className="px-3 py-1 text-left font-medium">Evento</th>
                  <th className="px-3 py-1 text-right font-medium">Ingresos</th>
                  <th className="px-3 py-1 text-right font-medium">Egresos</th>
                  <th className="px-3 py-1 text-right font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {eventos.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-1">
                      <Link href={`/eventos/${e.id}`} className="underline decoration-stone-300 hover:decoration-stone-900">{e.nombre}</Link>
                      <span className="block text-xs text-stone-500">{formatoFecha(e.fecha)}</span>
                    </td>
                    <Celda valor={e.ingresos} formula="Ingresos del balance del evento" />
                    <Celda valor={e.egresos} formula="Egresos del balance del evento" />
                    <Celda valor={e.resultado} formula="Ingresos − egresos" negrita />
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-stone-200 bg-stone-50 font-semibold">
                <tr>
                  <td className="px-3 py-1.5" colSpan={3}>Rentabilidad variable</td>
                  <CeldaC c={c.variable} />
                </tr>
              </tfoot>
            </table>
          )}
        </Seccion>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Reparto r={c.repartoMensual} editable={editable} alCambiar={(distribucion_mensual) => cambiar((d) => ({ ...d, distribucion_mensual }))} filas={datos.distribucion_mensual} />
        <Reparto r={c.repartoVariable} editable={editable} alCambiar={(distribucion_variable) => cambiar((d) => ({ ...d, distribucion_variable }))} filas={datos.distribucion_variable} />
        <Seccion titulo="Caja estructura" ayuda={c.cajaEstructura.formula}>
          <dl className="space-y-1 px-3 py-2 text-sm">
            {[c.repartoMensual, c.repartoVariable].map((r) => (
              <Dato
                key={r.titulo}
                titulo={`Estructura · ${r.titulo.replace("Distribución de la ", "").toLowerCase()}`}
                valor={r.filas.filter((f) => /estructura/i.test(f.nombre)).reduce((s, f) => s + f.monto.valor, 0)}
                formula={r.filas.filter((f) => /estructura/i.test(f.nombre)).map((f) => f.monto.formula).join(" + ") || "No hay fila de estructura"}
                fila
              />
            ))}
            <div className="flex justify-between gap-2 border-t border-stone-200 pt-1 font-semibold">
              <dt>Total</dt>
              <dd className="font-mono">{formatoPesos(c.cajaEstructura.valor)}</dd>
            </div>
          </dl>
          <div className="border-t border-stone-100 px-3 py-2">
            <label htmlFor="notas-ruta" className="etiqueta">Notas</label>
            <textarea
              id="notas-ruta"
              value={datos.notas ?? ""}
              onChange={(e) => cambiar((d) => ({ ...d, notas: e.target.value }))}
              disabled={!editable}
              rows={3}
              maxLength={4000}
              className="campo"
            />
          </div>
        </Seccion>
      </div>
    </div>
  );
}

// ─── Piezas ──────────────────────────────────────────────────────────────

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="tarjeta overflow-x-auto p-0">
      <div className="border-b border-stone-200 bg-stone-50 px-3 py-2">
        <h2 className="font-semibold">{titulo}</h2>
        {ayuda && <p className="text-xs text-stone-500">{ayuda}</p>}
      </div>
      {children}
    </section>
  );
}

function Cifra({ titulo, c }: { titulo: string; c: Calculado }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{titulo}</p>
      <p className={`mt-1 font-mono text-lg font-semibold ${c.valor < 0 ? "text-red-700" : ""}`}>{formatoPesos(c.valor)}</p>
      <p className="mt-1 text-[11px] text-stone-500">{c.formula}</p>
    </div>
  );
}

/** Importe calculado: al pasar el mouse muestra de dónde sale. */
function Celda({ valor, formula, negrita }: { valor: number; formula: string; negrita?: boolean }) {
  return (
    <td title={formula} className={`cursor-help whitespace-nowrap px-3 py-1 text-right font-mono ${negrita ? "font-semibold" : ""} ${valor < 0 ? "text-red-700" : ""}`}>
      {formatoPesos(valor)}
    </td>
  );
}
const CeldaC = ({ c }: { c: Calculado }) => <Celda valor={c.valor} formula={c.formula} />;

function Dato({ titulo, valor, formula, negrita, fila }: { titulo: string; valor: number; formula: string; negrita?: boolean; fila?: boolean }) {
  return (
    <div className={fila ? "flex justify-between gap-2" : ""} title={formula}>
      <dt className="text-xs text-stone-500">{titulo}</dt>
      <dd className={`cursor-help font-mono ${negrita ? "font-semibold" : ""} ${valor < 0 ? "text-red-700" : ""}`}>{formatoPesos(Math.round(valor * 100) / 100)}</dd>
      {!fila && <p className="text-[10px] leading-tight text-stone-400">{formula}</p>}
    </div>
  );
}

function Quitar({ alQuitar }: { alQuitar: () => void }) {
  return (
    <td className="w-8">
      <button type="button" onClick={alQuitar} className="px-2 text-stone-400 hover:text-red-700" aria-label="Quitar">
        ×
      </button>
    </td>
  );
}

/** Agregar al mes un cliente / colaborador existente o uno nuevo. */
function AgregarPersona({
  tipo,
  personas,
  enUso,
  crear,
  alElegir,
}: {
  tipo: TipoPersona;
  personas: Persona[];
  enUso: Set<string>;
  crear: (tipo: TipoPersona, nombre: string) => Promise<Persona | null>;
  alElegir: (id: string) => void;
}) {
  const [nuevo, setNuevo] = useState("");
  const [creando, iniciar] = useTransition();
  const libres = personas.filter((p) => p.activo && !enUso.has(p.id));
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 px-3 py-2">
      {libres.length > 0 && (
        <select value="" onChange={(e) => e.target.value && alElegir(e.target.value)} aria-label={`Agregar ${tipo}`} className="campo w-auto text-sm">
          <option value="">+ Agregar {tipo}…</option>
          {libres.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!nuevo.trim()) return;
          iniciar(async () => {
            const p = await crear(tipo, nuevo);
            if (p) {
              if (!enUso.has(p.id)) alElegir(p.id);
              setNuevo("");
            }
          });
        }}
      >
        <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder={`${tipo === "cliente" ? "Cliente" : "Colaborador"} nuevo`} aria-label={`Nombre del ${tipo} nuevo`} className="campo w-44 text-sm" />
        <button type="submit" disabled={creando || !nuevo.trim()} className="boton-secundario text-sm">
          {creando ? "Creando…" : "Crear"}
        </button>
      </form>
    </div>
  );
}

/** Alta y baja para los meses siguientes (los meses donde ya estaban los conservan). */
function Personas({ tipo, personas, cambiarActivo, pendiente }: { tipo: TipoPersona; personas: Persona[]; cambiarActivo: (tipo: TipoPersona, p: Persona) => void; pendiente: boolean }) {
  if (!personas.length) return null;
  return (
    <details className="border-t border-stone-100 px-3 py-2 text-sm">
      <summary className="cursor-pointer text-stone-600">{tipo === "cliente" ? "Clientes" : "Colaboradores"}: alta y baja</summary>
      <p className="mt-1 text-xs text-stone-500">Dar de baja: no se agrega a los meses nuevos. Los meses donde ya estaba lo conservan.</p>
      <ul className="mt-2 divide-y divide-stone-100">
        {personas.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 py-1">
            <span className={p.activo ? "" : "text-stone-400 line-through"}>{p.nombre}</span>
            <button type="button" disabled={pendiente} onClick={() => cambiarActivo(tipo, p)} className="text-xs underline">
              {p.activo ? "Dar de baja" : "Dar de alta"}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ListaGastos({
  titulo,
  ayuda,
  filas,
  total,
  editable,
  alCambiar,
}: {
  titulo: string;
  ayuda?: string;
  filas: MesRuta["gastos_fijos"];
  total: Calculado;
  editable: boolean;
  alCambiar: (filas: MesRuta["gastos_fijos"]) => void;
}) {
  const editar = (i: number, cambio: Partial<MesRuta["gastos_fijos"][number]>) => alCambiar(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  return (
    <Seccion titulo={titulo} ayuda={ayuda}>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-stone-100">
          {filas.map((f, i) => (
            <tr key={i}>
              <td className="px-2 py-1">
                <input value={f.concepto} disabled={!editable} onChange={(e) => editar(i, { concepto: e.target.value })} placeholder="Concepto" aria-label="Concepto" className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none" />
              </td>
              <td className="w-40 px-1 py-1">
                <CampoMonto valor={f.monto} disabled={!editable} etiqueta={`Monto de ${f.concepto || "gasto"}`} alCambiar={(n) => editar(i, { monto: n })} />
              </td>
              {editable && <Quitar alQuitar={() => alCambiar(filas.filter((_, j) => j !== i))} />}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-stone-200 bg-stone-50 font-semibold">
          <tr>
            <td className="px-3 py-1.5">Total</td>
            <CeldaC c={total} />
            {editable && <td />}
          </tr>
        </tfoot>
      </table>
      {editable && (
        <div className="px-3 py-2">
          <button type="button" onClick={() => alCambiar([...filas, { concepto: "", monto: 0 }])} className="text-sm font-medium underline">
            + Agregar gasto
          </button>
        </div>
      )}
    </Seccion>
  );
}

function Reparto({
  r,
  filas,
  editable,
  alCambiar,
}: {
  r: ReturnType<typeof calcularMesRuta>["repartoMensual"];
  filas: MesRuta["distribucion_mensual"];
  editable: boolean;
  alCambiar: (filas: MesRuta["distribucion_mensual"]) => void;
}) {
  const editar = (i: number, cambio: Partial<MesRuta["distribucion_mensual"][number]>) => alCambiar(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  return (
    <Seccion titulo={r.titulo} ayuda={`Base: ${formatoPesos(r.base.valor)} (${r.base.formula}). Los porcentajes se editan por mes y tienen que sumar 100%.`}>
      <table className="w-full text-sm">
        <thead className="text-xs text-stone-500">
          <tr>
            <th className="px-3 py-1 text-left font-medium">Para</th>
            <th className="px-3 py-1 text-right font-medium">%</th>
            <th className="px-3 py-1 text-right font-medium">Monto</th>
            {editable && <th />}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {r.filas.map((f, i) => (
            <tr key={i}>
              <td className="px-2 py-1">
                <input value={filas[i].nombre} disabled={!editable} onChange={(e) => editar(i, { nombre: e.target.value })} aria-label="Para quién" className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none" />
              </td>
              <td className="w-24 px-1 py-1">
                <CampoMonto valor={filas[i].porcentaje} disabled={!editable} etiqueta={`Porcentaje de ${f.nombre}`} alCambiar={(n) => editar(i, { porcentaje: Math.min(100, Math.max(0, n)) })} />
              </td>
              <CeldaC c={f.monto} />
              {editable && <Quitar alQuitar={() => alCambiar(filas.filter((_, j) => j !== i))} />}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-stone-200 bg-stone-50 font-semibold">
          <tr>
            <td className="px-3 py-1.5">Total</td>
            <td className={`px-3 py-1.5 text-right font-mono ${r.ok ? "" : "text-red-700"}`}>{pct(r.sumaPorcentajes)}</td>
            <Celda valor={r.filas.reduce((s, f) => s + f.monto.valor, 0)} formula="Suma de los montos" />
            {editable && <td />}
          </tr>
        </tfoot>
      </table>
      {!r.conReparto && <p className="px-3 py-1 text-xs text-red-700">El resultado no es positivo: no hay reparto este mes.</p>}
      {editable && (
        <div className="px-3 py-2">
          <button type="button" onClick={() => alCambiar([...filas, { nombre: "", porcentaje: 0 }])} className="text-sm font-medium underline">
            + Agregar
          </button>
        </div>
      )}
    </Seccion>
  );
}
