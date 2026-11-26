"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarEstadoPropuesta, duplicarPropuesta, eliminarPropuesta, guardarPropuesta } from "@/lib/propuestas/acciones";
import {
  COLOR_ESTADO_PROPUESTA,
  NOMBRE_ESTADO_PROPUESTA,
  calcularPropuesta,
  ordenarPorPrioridad,
  saldoSolicitud,
  type DatosPropuesta,
  type PagoPropuesto,
  type Propuesta,
  type SolicitudDisponible,
} from "@/lib/propuestas/tipos";
import { COLOR_PRIORIDAD_PAGO, NOMBRE_PRIORIDAD_PAGO, PRIORIDADES_PAGO, type PrioridadPago } from "@/lib/pagos/tipos";
import type { CambioPropuesta } from "@/lib/propuestas/consultas";
import { NOMBRE_EMPRESA } from "@/lib/empresas";
import { formatoFecha, formatoFechaHora, formatoPesos } from "@/lib/formato";
import { useCambiosPendientes, useDatosDelServidor } from "@/lib/cambios-pendientes";
import { AvisoConflicto } from "@/components/aviso-conflicto";
import { CampoMonto } from "@/components/campo-monto";

type Evento = { id: string; nombre: string; fecha: string };
type Proveedor = { nombre: string; alias_cbu: string | null };

const datosDe = (p: Propuesta): DatosPropuesta => ({ nombre: p.nombre, fecha: p.fecha, disponible: p.disponible, observaciones: p.observaciones, items: p.items });
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const pagoVacio = (): PagoPropuesto => ({
  id: crypto.randomUUID(),
  proveedor: "",
  detalle: "",
  evento_id: null,
  adeudado: null,
  importe: 0,
  alias_cbu: "",
  prioridad: "normal",
  observaciones: "",
  solicitud_id: null,
  solicitante: null,
});

type Panel = null | { tipo: "pago"; pago: PagoPropuesto; nuevo: boolean } | { tipo: "solicitudes" };

/**
 * Pantalla de una propuesta: dinero disponible arriba, pagos en orden y el
 * saldo que queda, recalculado con cada cambio. Guardar solo guarda la planificación.
 */
export function EditorPropuesta({
  propuesta,
  historial,
  eventos,
  solicitudes,
  proveedores,
  editor,
}: {
  propuesta: Propuesta;
  historial: CambioPropuesta[];
  eventos: Evento[];
  solicitudes: SolicitudDisponible[];
  proveedores: Proveedor[];
  editor: boolean;
}) {
  const router = useRouter();
  const [datos, setDatos] = useState<DatosPropuesta>(() => datosDe(propuesta));
  const [guardado, setGuardado] = useState<DatosPropuesta>(() => datosDe(propuesta));
  const [version, setVersion] = useState(propuesta.actualizado_en);
  const [conflicto, setConflicto] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [destino, setDestino] = useState<number | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const sinGuardar = !igual(datos, guardado);
  const editable = editor && propuesta.estado === "borrador";

  // Datos nuevos del servidor (después de guardar o al tocar "Actualizar"): se toman si no hay cambios sin guardar.
  useDatosDelServidor(propuesta, sinGuardar, (p) => {
    setDatos(datosDe(p));
    setGuardado(datosDe(p));
    setVersion(p.actualizado_en);
  });

  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar]);

  const c = calcularPropuesta(datos.disponible, datos.items);
  const nombreEvento = new Map(eventos.map((e) => [e.id, e.nombre]));
  const cambiar = (cambio: Partial<DatosPropuesta>) => setDatos((d) => ({ ...d, ...cambio }));
  const cambiarPago = (id: string, cambio: Partial<PagoPropuesto>) =>
    setDatos((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...cambio } : i)) }));
  const mover = (desde: number, hasta: number) =>
    setDatos((d) => {
      if (desde === hasta || hasta < 0 || hasta >= d.items.length) return d;
      const items = [...d.items];
      const [x] = items.splice(desde, 1);
      items.splice(hasta, 0, x);
      return { ...d, items };
    });
  const quitar = (p: PagoPropuesto) => {
    if (!window.confirm(`¿Quitar el pago a ${p.proveedor} (${formatoPesos(p.importe)}) de la propuesta?`)) return;
    setDatos((d) => ({ ...d, items: d.items.filter((i) => i.id !== p.id) }));
  };

  const guardar = (forzar = false) => {
    setMensaje(null);
    if (!datos.nombre.trim()) return setMensaje({ tipo: "error", texto: "Poné un nombre a la propuesta" });
    if (datos.items.some((i) => !i.proveedor.trim())) return setMensaje({ tipo: "error", texto: "Hay un pago sin proveedor" });
    const enviado = datos;
    iniciar(async () => {
      const r = await guardarPropuesta(propuesta.id, enviado, version, forzar);
      setConflicto(!!r.conflicto);
      if (r.error) return setMensaje({ tipo: "error", texto: r.error });
      if (r.version) setVersion(r.version);
      setGuardado(enviado);
      setMensaje({ tipo: "ok", texto: "Propuesta guardada" });
    });
  };
  useCambiosPendientes(sinGuardar && editable, `Propuesta de pagos «${datos.nombre}»`, () => guardar());

  const estado = (nuevo: "borrador" | "aprobada" | "finalizada") => {
    if (sinGuardar) return setMensaje({ tipo: "error", texto: "Guardá o descartá los cambios antes de cambiar el estado" });
    const textos = {
      aprobada: `¿Aprobar la propuesta?${c.excedido ? `\n\nAtención: los pagos superan el disponible por ${formatoPesos(-c.saldo)}.` : ""}\n\nEs una aprobación interna: no registra pagos ni mueve Financiero. Para cambiarla después hay que volverla a borrador.`,
      finalizada: "¿Finalizar la propuesta? Queda cerrada como planificación (no significa que los proveedores hayan cobrado).",
      borrador: "¿Volver la propuesta a borrador para modificarla?",
    };
    if (!window.confirm(textos[nuevo])) return;
    iniciar(async () => {
      const r = await cambiarEstadoPropuesta(propuesta.id, nuevo);
      setMensaje(r.error ? { tipo: "error", texto: r.error } : { tipo: "ok", texto: `Propuesta ${NOMBRE_ESTADO_PROPUESTA[nuevo].toLowerCase()}` });
    });
  };

  const duplicar = () => {
    if (sinGuardar) return setMensaje({ tipo: "error", texto: "Guardá los cambios antes de duplicar (la copia sale de lo guardado)" });
    const nombre = window.prompt("Nombre de la nueva alternativa:", `${guardado.nombre} (alternativa)`);
    if (nombre === null) return;
    const clave = crypto.randomUUID();
    iniciar(async () => {
      const r = await duplicarPropuesta(propuesta.id, nombre, clave);
      if (r?.error) setMensaje({ tipo: "error", texto: r.error });
    });
  };

  const eliminar = () => {
    if (!window.confirm(`¿Eliminar la propuesta «${guardado.nombre}»? No afecta a ningún otro módulo.`)) return;
    iniciar(async () => {
      const r = await eliminarPropuesta(propuesta.id);
      if (r?.error) setMensaje({ tipo: "error", texto: r.error });
    });
  };

  const copiar = async (p: PagoPropuesto) => {
    try {
      await navigator.clipboard.writeText(p.alias_cbu);
      setCopiado(p.id);
      setTimeout(() => setCopiado((x) => (x === p.id ? null : x)), 1500);
    } catch {
      window.prompt("Copiá el alias / CBU:", p.alias_cbu);
    }
  };

  const descargar = (e: React.MouseEvent) => {
    if (sinGuardar && !window.confirm("Tenés cambios sin guardar: el archivo sale con lo último guardado. ¿Descargar igual?")) e.preventDefault();
  };

  const incluidas = new Set(datos.items.map((i) => i.solicitud_id).filter(Boolean));
  const usoBarra = Math.min(1, Number.isFinite(c.uso) ? c.uso : 1);

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="space-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
            <span className="rounded-full bg-stone-900 px-2 py-0.5 font-semibold text-white">{NOMBRE_EMPRESA[propuesta.empresa]}</span>
            <span className={`rounded-full px-2 py-0.5 font-medium ${COLOR_ESTADO_PROPUESTA[propuesta.estado]}`}>{NOMBRE_ESTADO_PROPUESTA[propuesta.estado]}</span>
            <span>Propuesta #{propuesta.numero}</span>
          </div>
          {editable ? (
            <input
              value={datos.nombre}
              onChange={(e) => cambiar({ nombre: e.target.value })}
              aria-label="Nombre de la propuesta"
              maxLength={200}
              className="mt-1 w-full rounded border border-transparent bg-transparent px-1 text-2xl font-semibold hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none"
            />
          ) : (
            <h1 className="mt-1 text-2xl font-semibold">{datos.nombre}</h1>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <button type="button" onClick={() => guardar()} disabled={pendiente || !sinGuardar} className="boton">
              {pendiente ? "Guardando…" : sinGuardar ? "Guardar propuesta" : "Guardado"}
            </button>
          )}
          {editable && sinGuardar && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => window.confirm("¿Descartar los cambios sin guardar?") && (setDatos(guardado), setMensaje(null))}
              className="boton-secundario"
            >
              Descartar cambios
            </button>
          )}
          {editor && (
            <button type="button" onClick={duplicar} disabled={pendiente} className="boton-secundario" title="Crear otra alternativa a partir de esta">
              Duplicar
            </button>
          )}
          <a href={`/propuestas-pago/${propuesta.id}/pdf`} onClick={descargar} className="boton-secundario">Descargar PDF</a>
          <a href={`/propuestas-pago/${propuesta.id}/excel`} onClick={descargar} className="boton-secundario">Exportar Excel</a>
        </div>
      </div>

      {editor && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-stone-500">Estado:</span>
          {propuesta.estado === "borrador" && (
            <button type="button" disabled={pendiente} onClick={() => estado("aprobada")} className="boton-secundario border-violet-300 text-violet-900">Aprobar propuesta</button>
          )}
          {propuesta.estado === "aprobada" && (
            <button type="button" disabled={pendiente} onClick={() => estado("finalizada")} className="boton-secundario border-green-300 text-green-800">Finalizar</button>
          )}
          {propuesta.estado !== "borrador" && (
            <button type="button" disabled={pendiente} onClick={() => estado("borrador")} className="boton-secundario">Volver a borrador</button>
          )}
        </div>
      )}

      {propuesta.estado !== "borrador" && (
        <p className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-950">
          {propuesta.estado === "aprobada"
            ? "Propuesta aprobada: la distribución está autorizada internamente. No significa que los proveedores hayan cobrado."
            : "Propuesta finalizada: quedó cerrada como planificación. No significa que los proveedores hayan cobrado."}
          {editor && " Para modificarla, volvela a borrador."}
        </p>
      )}

      {mensaje && <p className={mensaje.tipo === "ok" ? "rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800" : "alerta-error"}>{mensaje.texto}</p>}
      {conflicto && editable && (
        <AvisoConflicto
          pendiente={pendiente}
          alVerSuVersion={() => {
            setConflicto(false);
            setMensaje(null);
            // Con los cambios propios descartados, los datos que traiga el servidor se aplican.
            setDatos(guardado);
            router.refresh();
          }}
          alGuardarIgual={() => guardar(true)}
        />
      )}

      {/* Resumen: siempre visible */}
      <div className="sticky top-0 z-20 -mx-1 rounded-xl bg-stone-50/95 px-1 py-2 backdrop-blur print:static">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          <div className="tarjeta p-3 sm:p-4">
            <p className="text-[11px] uppercase tracking-wide text-stone-500 sm:text-xs">Dinero disponible</p>
            {editable ? (
              <div className="flex items-center font-mono text-base font-semibold sm:text-xl">
                <span className="pl-0.5">$</span>
                <CampoMonto valor={datos.disponible} alCambiar={(n) => cambiar({ disponible: Math.max(0, n) })} etiqueta="Dinero disponible" className="min-w-0! text-left! text-base! font-semibold sm:text-xl!" />
              </div>
            ) : (
              <p className="font-mono text-base font-semibold sm:text-xl">{formatoPesos(datos.disponible)}</p>
            )}
          </div>
          <div className="tarjeta p-3 sm:p-4">
            <p className="text-[11px] uppercase tracking-wide text-stone-500 sm:text-xs">Total de pagos propuestos</p>
            <p className="font-mono text-base font-semibold sm:text-xl">{formatoPesos(c.total)}</p>
            <p className="text-[11px] text-stone-500 sm:text-xs">{datos.items.length} pago{datos.items.length === 1 ? "" : "s"}</p>
          </div>
          <div className={`tarjeta col-span-2 p-3 sm:col-span-1 sm:p-4 ${c.excedido ? "border-red-300 bg-red-50" : "border-green-200 bg-green-50"}`}>
            <p className="text-[11px] uppercase tracking-wide text-stone-500 sm:text-xs">Saldo restante</p>
            <p className={`font-mono text-base font-semibold sm:text-xl ${c.excedido ? "text-red-700" : "text-green-700"}`} data-saldo>{formatoPesos(c.saldo)}</p>
            {c.excedido && <p className="text-[11px] font-medium text-red-700 sm:text-xs">Se supera el disponible por {formatoPesos(-c.saldo)}</p>}
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200" title={`Comprometido: ${Number.isFinite(c.uso) ? Math.round(c.uso * 100) : "más del 100"}%`}>
          <div className={`h-full rounded-full ${c.excedido ? "bg-red-600" : "bg-green-600"}`} style={{ width: `${usoBarra * 100}%` }} />
        </div>
      </div>

      {c.excedido && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          ⚠ Los pagos propuestos superan el dinero disponible por {formatoPesos(-c.saldo)}. Bajá importes, quitá pagos o aumentá el disponible.
        </p>
      )}

      {/* Datos de la propuesta */}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="block">
          <span className="etiqueta">Fecha</span>
          <input type="date" value={datos.fecha} disabled={!editable} onChange={(e) => e.target.value && cambiar({ fecha: e.target.value })} className="campo" />
        </label>
        <label className="block">
          <span className="etiqueta">Observaciones</span>
          <input value={datos.observaciones} disabled={!editable} onChange={(e) => cambiar({ observaciones: e.target.value })} maxLength={2000} placeholder="Opcional" className="campo" />
        </label>
      </div>

      {editable && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPanel({ tipo: "pago", pago: pagoVacio(), nuevo: true })} className="boton">+ Agregar pago</button>
          <button type="button" onClick={() => setPanel({ tipo: "solicitudes" })} className="boton-secundario">+ Agregar desde Solicitudes de pagos</button>
          {datos.items.length > 1 && (
            <button type="button" onClick={() => cambiar({ items: ordenarPorPrioridad(datos.items) })} className="boton-secundario" title="Muy urgentes primero, después urgentes y normales">
              Ordenar por prioridad
            </button>
          )}
        </div>
      )}

      {panel?.tipo === "pago" && (
        <FormularioPago
          key={panel.pago.id}
          inicial={panel.pago}
          nuevo={panel.nuevo}
          saldoSinEste={c.saldo + (panel.nuevo ? 0 : (datos.items.find((i) => i.id === panel.pago.id)?.importe ?? 0))}
          eventos={eventos}
          proveedores={proveedores}
          alCancelar={() => setPanel(null)}
          alGuardar={(p) => {
            setDatos((d) => ({ ...d, items: panel.nuevo ? [...d.items, p] : d.items.map((i) => (i.id === p.id ? p : i)) }));
            setPanel(null);
          }}
        />
      )}
      {panel?.tipo === "solicitudes" && (
        <SelectorSolicitudes
          solicitudes={solicitudes}
          incluidas={incluidas}
          saldo={c.saldo}
          empresa={NOMBRE_EMPRESA[propuesta.empresa]}
          alCancelar={() => setPanel(null)}
          alAgregar={(nuevos) => {
            setDatos((d) => ({ ...d, items: [...d.items, ...nuevos.filter((n) => !d.items.some((i) => i.solicitud_id === n.solicitud_id))] }));
            setPanel(null);
          }}
        />
      )}

      {/* Pagos propuestos */}
      {datos.items.length === 0 ? (
        <p className="tarjeta text-center text-sm text-stone-500">
          {editable ? "Todavía no hay pagos. Agregalos con “+ Agregar pago” o traelos de Solicitudes de pagos." : "Esta propuesta no tiene pagos."}
        </p>
      ) : (
        <div className="tarjeta overflow-x-auto p-0">
          <table className="tabla-movil w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="w-10 px-2 py-2">Orden</th>
                <th className="px-2 py-2">Proveedor</th>
                <th className="px-2 py-2">Detalle</th>
                <th className="px-2 py-2">Evento</th>
                <th className="px-2 py-2 text-right">Adeudado</th>
                <th className="px-2 py-2 text-right">A pagar</th>
                <th className="px-2 py-2 text-right">Acumulado</th>
                <th className="px-2 py-2">Alias / CBU</th>
                <th className="px-2 py-2">Prioridad</th>
                {editable && <th className="px-2 py-2">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {c.filas.map((f, i) => {
                const p = f.pago;
                const fondo = f.noAlcanza ? "bg-red-50" : p.prioridad === "muy_urgente" ? "bg-red-50/40" : p.prioridad === "urgente" ? "bg-amber-50/60" : "";
                return (
                  <tr
                    key={p.id}
                    draggable={editable}
                    onDragStart={(e) => {
                      setArrastrando(i);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (arrastrando === null) return;
                      e.preventDefault();
                      setDestino(i);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (arrastrando !== null) mover(arrastrando, i);
                      setArrastrando(null);
                      setDestino(null);
                    }}
                    onDragEnd={() => {
                      setArrastrando(null);
                      setDestino(null);
                    }}
                    className={`${fondo} ${arrastrando === i ? "opacity-40" : ""} ${destino === i && arrastrando !== null && arrastrando !== i ? "outline outline-2 -outline-offset-2 outline-stone-500" : ""}`}
                  >
                    <td className="whitespace-nowrap px-2 py-2 text-stone-500">
                      {editable && <span className="mr-1 hidden cursor-grab select-none text-stone-400 md:inline" title="Arrastrá para cambiar el orden" aria-hidden>⋮⋮</span>}
                      {i + 1}
                    </td>
                    <td className="px-2 py-2">
                      <span className="font-medium">{p.proveedor}</span>
                      {p.solicitud_id && <span className="block text-[11px] text-sky-800">De Solicitudes de pagos{p.solicitante ? ` · pidió ${p.solicitante}` : ""}</span>}
                      {p.observaciones && <span className="block text-[11px] text-stone-500">{p.observaciones}</span>}
                    </td>
                    <td className="px-2 py-2">{p.detalle || <span className="text-stone-400">—</span>}</td>
                    <td className="px-2 py-2">{p.evento_id ? (nombreEvento.get(p.evento_id) ?? "Evento") : <span className="text-stone-400">—</span>}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-mono">{p.adeudado === null ? <span className="text-stone-400">—</span> : formatoPesos(p.adeudado)}</td>
                    <td className="px-2 py-2 text-right">
                      {editable ? (
                        <CampoMonto valor={p.importe} alCambiar={(n) => cambiarPago(p.id, { importe: Math.max(0, n) })} etiqueta={`Importe a pagar a ${p.proveedor}`} className="font-semibold" />
                      ) : (
                        <span className="whitespace-nowrap font-mono font-semibold">{formatoPesos(p.importe)}</span>
                      )}
                      {f.parcial && <span className="block whitespace-nowrap text-[11px] text-amber-800">Parcial · queda debiendo {formatoPesos(Math.round((p.adeudado! - p.importe) * 100) / 100)}</span>}
                      {p.importe === 0 && <span className="block text-[11px] text-stone-500">Para otro momento</span>}
                      {f.noAlcanza && (
                        <span className="block text-[11px] font-medium text-red-700">
                          No alcanza: {f.disponibleAntes > 0 ? `quedan ${formatoPesos(f.disponibleAntes)}` : "no queda saldo"}
                          {editable && f.disponibleAntes > 0 && (
                            <button type="button" onClick={() => cambiarPago(p.id, { importe: f.disponibleAntes })} className="ml-1 underline">
                              Ajustar
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-xs">
                      {formatoPesos(f.acumulado)}
                      <span className={`block ${f.saldoDespues < 0 ? "text-red-700" : "text-stone-500"}`}>queda {formatoPesos(f.saldoDespues)}</span>
                    </td>
                    <td className="max-w-[13rem] px-2 py-2">
                      {p.alias_cbu ? (
                        <span className="flex items-center gap-1">
                          <span className="break-all font-mono text-xs">{p.alias_cbu}</span>
                          <button type="button" onClick={() => copiar(p)} className="shrink-0 rounded border border-stone-300 px-1.5 text-[11px] hover:bg-stone-100" title="Copiar alias / CBU">
                            {copiado === p.id ? "Copiado ✓" : "Copiar"}
                          </button>
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {editable ? (
                        <select
                          value={p.prioridad}
                          onChange={(e) => cambiarPago(p.id, { prioridad: e.target.value as PrioridadPago })}
                          aria-label={`Prioridad del pago a ${p.proveedor}`}
                          className={`rounded-full border-0 px-2 py-0.5 text-xs font-semibold ${COLOR_PRIORIDAD_PAGO[p.prioridad]}`}
                        >
                          {PRIORIDADES_PAGO.map((x) => (
                            <option key={x} value={x} className="bg-white text-stone-900">{NOMBRE_PRIORIDAD_PAGO[x]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_PRIORIDAD_PAGO[p.prioridad]}`}>{NOMBRE_PRIORIDAD_PAGO[p.prioridad]}</span>
                      )}
                    </td>
                    {editable && (
                      <td className="whitespace-nowrap px-2 py-2">
                        <div className="flex justify-end gap-1 md:justify-start">
                          <button type="button" onClick={() => mover(i, i - 1)} disabled={i === 0} className="rounded border border-stone-300 px-1.5 disabled:opacity-30" title="Subir" aria-label={`Subir el pago a ${p.proveedor}`}>↑</button>
                          <button type="button" onClick={() => mover(i, i + 1)} disabled={i === datos.items.length - 1} className="rounded border border-stone-300 px-1.5 disabled:opacity-30" title="Bajar" aria-label={`Bajar el pago a ${p.proveedor}`}>↓</button>
                          <button type="button" onClick={() => setPanel({ tipo: "pago", pago: p, nuevo: false })} className="rounded border border-stone-300 px-1.5 text-xs">Editar</button>
                          <button type="button" onClick={() => quitar(p)} className="rounded border border-red-200 px-1.5 text-xs text-red-700">Quitar</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-stone-100 font-semibold">
              <tr>
                <td colSpan={4} className="px-2 py-2">Total ({datos.items.length} pago{datos.items.length === 1 ? "" : "s"})</td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-mono" data-etiqueta="Adeudado">{c.adeudado ? formatoPesos(c.adeudado) : "—"}</td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-mono" data-etiqueta="A pagar">{formatoPesos(c.total)}</td>
                <td className={`whitespace-nowrap px-2 py-2 text-right font-mono ${c.excedido ? "text-red-700" : "text-green-700"}`} data-etiqueta="Saldo restante">
                  queda {formatoPesos(c.saldo)}
                </td>
                <td colSpan={editable ? 3 : 2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {datos.items.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {c.porPrioridad
            .filter((x) => x.cantidad)
            .map((x) => (
              <span key={x.prioridad} className={`rounded-full px-2.5 py-1 font-medium ${COLOR_PRIORIDAD_PAGO[x.prioridad]}`}>
                {NOMBRE_PRIORIDAD_PAGO[x.prioridad]}: {x.cantidad} · {formatoPesos(x.total)}
              </span>
            ))}
        </div>
      )}

      <p className="text-xs text-stone-500">
        Planificación: guardar, aprobar o exportar esta propuesta no registra pagos ni mueve Financiero, Cuentas corrientes, saldos bancarios ni Solicitudes de pagos.
        {editable && " Arrastrá las filas (o usá ↑ ↓) para cambiar el orden: el acumulado muestra cuánto del disponible se consume hasta cada pago."}
      </p>

      <details className="tarjeta p-4">
        <summary className="cursor-pointer text-sm font-semibold">Historial de cambios ({historial.length})</summary>
        <p className="mt-2 text-xs text-stone-500">
          Creada {propuesta.creador ? `por ${propuesta.creador} ` : ""}el {formatoFechaHora(propuesta.creado_en)} · Última modificación{" "}
          {propuesta.modificador ? `por ${propuesta.modificador} ` : ""}el {formatoFechaHora(propuesta.actualizado_en)}
        </p>
        <ul className="mt-2 divide-y divide-stone-100 text-sm">
          {historial.map((h, i) => (
            <li key={i} className="py-1.5">
              <span className="font-medium">{h.accion}</span>
              {h.detalle && <span className="text-stone-600"> · {h.detalle}</span>}
              <span className="block text-xs text-stone-500">
                {formatoFechaHora(h.creado_en)}
                {h.usuario ? ` · ${h.usuario}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </details>

      {editable && (
        <div className="text-right">
          <button type="button" onClick={eliminar} disabled={pendiente} className="text-sm text-red-700 underline">Eliminar propuesta</button>
        </div>
      )}
    </div>
  );
}

/** Alta o modificación de un pago, con el saldo que quedaría al incluirlo. */
function FormularioPago({
  inicial,
  nuevo,
  saldoSinEste,
  eventos,
  proveedores,
  alCancelar,
  alGuardar,
}: {
  inicial: PagoPropuesto;
  nuevo: boolean;
  saldoSinEste: number;
  eventos: Evento[];
  proveedores: Proveedor[];
  alCancelar: () => void;
  alGuardar: (p: PagoPropuesto) => void;
}) {
  const [p, setP] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const cambiar = (cambio: Partial<PagoPropuesto>) => setP((x) => ({ ...x, ...cambio }));
  const saldo = Math.round((saldoSinEste - p.importe) * 100) / 100;
  const disponibleParaEste = Math.max(0, Math.round(saldoSinEste * 100) / 100);

  /** Si el proveedor es uno cargado, trae su alias / CBU (si todavía no se escribió otro). */
  const elegirProveedor = (texto: string) => {
    const encontrado = proveedores.find((x) => x.nombre.toLowerCase() === texto.trim().toLowerCase());
    const anterior = proveedores.find((x) => x.nombre.toLowerCase() === p.proveedor.trim().toLowerCase());
    const automatico = !p.alias_cbu || p.alias_cbu === anterior?.alias_cbu;
    cambiar({ proveedor: texto, ...(automatico && encontrado?.alias_cbu ? { alias_cbu: encontrado.alias_cbu } : {}) });
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!p.proveedor.trim()) return setError("Completá el proveedor o beneficiario");
    if (!(p.importe >= 0)) return setError("El importe a pagar no es válido");
    alGuardar({ ...p, proveedor: p.proveedor.trim(), detalle: p.detalle.trim(), alias_cbu: p.alias_cbu.trim(), observaciones: p.observaciones.trim() });
  };

  return (
    <form onSubmit={enviar} className="tarjeta space-y-3 border-stone-400 p-4">
      <h2 className="font-semibold">{nuevo ? "Agregar pago" : `Editar pago a ${inicial.proveedor}`}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className="etiqueta">Proveedor o beneficiario</span>
          <input value={p.proveedor} onChange={(e) => elegirProveedor(e.target.value)} list="proveedores-propuesta" required maxLength={200} className="campo" autoFocus />
          <datalist id="proveedores-propuesta">
            {proveedores.map((x) => (
              <option key={x.nombre} value={x.nombre} />
            ))}
          </datalist>
        </label>
        <label className="block sm:col-span-2">
          <span className="etiqueta">Detalle</span>
          <input value={p.detalle} onChange={(e) => cambiar({ detalle: e.target.value })} maxLength={500} placeholder="Motivo o concepto del pago" className="campo" />
        </label>
        <label className="block">
          <span className="etiqueta">Importe adeudado <span className="font-normal text-stone-400">(opcional)</span></span>
          <div className="campo p-1">
            <CampoMonto valor={p.adeudado ?? 0} alCambiar={(n) => cambiar({ adeudado: n > 0 ? n : null })} etiqueta="Importe adeudado" />
          </div>
        </label>
        <label className="block">
          <span className="etiqueta">Importe a pagar</span>
          <div className="campo p-1">
            <CampoMonto valor={p.importe} alCambiar={(n) => cambiar({ importe: Math.max(0, n) })} etiqueta="Importe a pagar" className="font-semibold" />
          </div>
        </label>
        <label className="block">
          <span className="etiqueta">Prioridad</span>
          <select value={p.prioridad} onChange={(e) => cambiar({ prioridad: e.target.value as PrioridadPago })} className="campo">
            {PRIORIDADES_PAGO.map((x) => (
              <option key={x} value={x}>{NOMBRE_PRIORIDAD_PAGO[x]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="etiqueta">Evento <span className="font-normal text-stone-400">(opcional)</span></span>
          <select value={p.evento_id ?? ""} onChange={(e) => cambiar({ evento_id: e.target.value || null })} className="campo">
            <option value="">Sin evento</option>
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre} · {formatoFecha(e.fecha)}</option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="etiqueta">Alias / CBU</span>
          <input value={p.alias_cbu} onChange={(e) => cambiar({ alias_cbu: e.target.value })} maxLength={200} className="campo font-mono" />
        </label>
        <label className="block sm:col-span-2">
          <span className="etiqueta">Observaciones <span className="font-normal text-stone-400">(opcional)</span></span>
          <input value={p.observaciones} onChange={(e) => cambiar({ observaciones: e.target.value })} maxLength={1000} className="campo" />
        </label>
      </div>
      <div className={`rounded-md px-3 py-2 text-sm ${saldo < 0 ? "bg-red-50 text-red-800" : "bg-stone-50 text-stone-700"}`}>
        Saldo restante con este pago: <strong className="font-mono">{formatoPesos(saldo)}</strong>
        {saldo < 0 && (
          <>
            {" "}· supera el disponible por {formatoPesos(-saldo)}.
            {disponibleParaEste > 0 && (
              <button type="button" onClick={() => cambiar({ importe: disponibleParaEste })} className="ml-1 font-medium underline">
                Pagar solo lo que queda ({formatoPesos(disponibleParaEste)})
              </button>
            )}
          </>
        )}
        {p.adeudado !== null && p.importe < p.adeudado && <span className="block text-amber-800">Pago parcial: queda debiendo {formatoPesos(Math.round((p.adeudado - p.importe) * 100) / 100)}.</span>}
        {p.adeudado !== null && p.importe > p.adeudado && <span className="block text-amber-800">El importe a pagar supera lo adeudado.</span>}
      </div>
      {error && <p className="alerta-error">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="boton">{nuevo ? "Agregar a la propuesta" : "Aplicar cambios"}</button>
        <button type="button" onClick={alCancelar} className="boton-secundario">Cancelar</button>
      </div>
    </form>
  );
}

/** Elegir solicitudes abiertas de la empresa y sumarlas (sus datos se copian; la solicitud no cambia). */
function SelectorSolicitudes({
  solicitudes,
  incluidas,
  saldo,
  empresa,
  alCancelar,
  alAgregar,
}: {
  solicitudes: SolicitudDisponible[];
  incluidas: Set<string | null>;
  saldo: number;
  empresa: string;
  alCancelar: () => void;
  alAgregar: (pagos: PagoPropuesto[]) => void;
}) {
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const total = solicitudes.filter((s) => elegidas.has(s.id)).reduce((t, s) => t + Math.round(saldoSolicitud(s) * 100), 0) / 100;
  const alternar = (id: string) =>
    setElegidas((x) => {
      const n = new Set(x);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const agregar = () =>
    alAgregar(
      solicitudes
        .filter((s) => elegidas.has(s.id))
        .map((s) => ({
          id: crypto.randomUUID(),
          proveedor: s.proveedor,
          detalle: s.motivo?.trim() || `Solicitud de pago #${s.numero}`,
          evento_id: s.evento_id,
          adeudado: saldoSolicitud(s),
          importe: saldoSolicitud(s),
          alias_cbu: s.datos_bancarios,
          prioridad: s.prioridad,
          observaciones: "",
          solicitud_id: s.id,
          solicitante: s.solicitante,
        })),
    );

  return (
    <div className="tarjeta space-y-3 border-stone-400 p-4">
      <div>
        <h2 className="font-semibold">Agregar desde Solicitudes de pagos</h2>
        <p className="text-xs text-stone-500">
          Solicitudes abiertas de {empresa}. Se copian sus datos a la propuesta (después podés bajar el importe para un pago parcial). La solicitud original no cambia de estado.
        </p>
      </div>
      {solicitudes.length === 0 ? (
        <p className="text-sm text-stone-500">No hay solicitudes de pago abiertas de {empresa}.</p>
      ) : (
        <ul className="max-h-[26rem] divide-y divide-stone-100 overflow-y-auto rounded-md border border-stone-200">
          {solicitudes.map((s) => {
            const ya = incluidas.has(s.id);
            return (
              <li key={s.id}>
                <label className={`flex gap-3 px-3 py-2 text-sm ${ya ? "bg-stone-50 text-stone-400" : "cursor-pointer hover:bg-stone-50"}`}>
                  <input type="checkbox" disabled={ya} checked={ya || elegidas.has(s.id)} onChange={() => alternar(s.id)} className="mt-1" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span className="font-medium">{s.proveedor}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${COLOR_PRIORIDAD_PAGO[s.prioridad]}`}>{NOMBRE_PRIORIDAD_PAGO[s.prioridad]}</span>
                      <span className="text-xs text-stone-400">#{s.numero}</span>
                      {ya && <span className="text-xs font-medium">Ya está en la propuesta</span>}
                    </span>
                    <span className="block text-xs text-stone-500">
                      {s.motivo || "Sin detalle"}
                      {s.evento ? ` · ${s.evento}` : ""}
                      {s.solicitante ? ` · pidió ${s.solicitante}` : ""} · {formatoFecha(s.creado_en.slice(0, 10))}
                    </span>
                    <span className="block break-all font-mono text-xs text-stone-500">{s.datos_bancarios}</span>
                  </span>
                  <span className="shrink-0 text-right font-mono">
                    {formatoPesos(saldoSolicitud(s))}
                    {s.pagado > 0 && <span className="block text-[11px] text-amber-800">de {formatoPesos(s.monto)} (pagado {formatoPesos(s.pagado)})</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {elegidas.size > 0 && (
        <p className={`text-sm ${saldo - total < 0 ? "text-red-700" : "text-stone-700"}`}>
          {elegidas.size} elegida{elegidas.size === 1 ? "" : "s"} · {formatoPesos(total)} · saldo restante después: <strong className="font-mono">{formatoPesos(Math.round((saldo - total) * 100) / 100)}</strong>
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={agregar} disabled={!elegidas.size} className="boton">
          Agregar {elegidas.size || ""} a la propuesta
        </button>
        <button type="button" onClick={alCancelar} className="boton-secundario">Cancelar</button>
      </div>
    </div>
  );
}
