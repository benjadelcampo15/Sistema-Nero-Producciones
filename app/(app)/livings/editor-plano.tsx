"use client";

import { useEffect, useRef, useState, useTransition, type PointerEvent as EventoPuntero } from "react";
import { guardarPlano } from "@/lib/livings/acciones";
import { descargarModelo, leerLivingsDeExcel } from "@/lib/livings/excel";
import {
  ESPACIOS,
  FORMAS,
  LADOS,
  asignarMozosEspacios,
  colorMozo,
  consumicionCorta,
  datosEspacios,
  distribuirEspacios,
  espacioDe,
  ladoEscenario,
  medidasPorDefecto,
  nuevoId,
  resumenPorMozo,
  type DocumentoPlano,
  type Espacio,
  type Lado,
  type Living,
} from "@/lib/livings/tipos";
import { formatoPesos } from "@/lib/formato";

type Punto = { x: number; y: number };

const AYUDA =
  "Arrastrá los livings para moverlos (también del jardín al salón y al revés). Tocá uno para editarlo y estiralo desde la esquina de abajo a la derecha.";

/** Piso de cada espacio: pasto en franjas o baldosas grises. */
const FONDO: Record<Espacio, React.CSSProperties> = {
  jardin: { background: "repeating-linear-gradient(90deg, #4a8c47 0 4%, #539a4f 4% 8%)" },
  salon: {
    backgroundColor: "#d6d3d1",
    backgroundImage: "linear-gradient(#bfbab5 1px, transparent 1px), linear-gradient(90deg, #bfbab5 1px, transparent 1px)",
    backgroundSize: "6% 9%",
  },
};

export function EditorPlano({ inicial, editable }: { inicial: DocumentoPlano; editable: boolean }) {
  const [doc, setDoc] = useState<DocumentoPlano>(inicial);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [sinGuardar, setSinGuardar] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string; detalles?: string[] } | null>(null);
  const [mozosTexto, setMozosTexto] = useState(inicial.mozos.map((m) => m.nombre).join("\n"));
  const [guardando, iniciarGuardado] = useTransition();

  const espacios = datosEspacios(doc);
  const relacionDe = (e: Espacio) => espacios.find((x) => x.id === e)!.relacion;
  const cambiar = (cambio: (d: DocumentoPlano) => DocumentoPlano) => {
    setDoc((d) => cambio(d));
    setSinGuardar(true);
  };

  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar]);

  const guardar = () =>
    iniciarGuardado(async () => {
      const r = await guardarPlano({
        ...doc,
        referencia: null,
        // Un nombre borrado no impide guardar.
        livings: doc.livings.map((l) => ({ ...l, nombre: l.nombre.trim() || "Living" })),
      });
      if (r.error) setMensaje({ tipo: "error", texto: r.error });
      else {
        setSinGuardar(false);
        setMensaje({ tipo: "ok", texto: "Plano guardado" });
      }
    });

  /** Reparte los livings entre jardín y salón y los acomoda en columnas. */
  const acomodar = (livings: Living[], respetarEspacio: boolean) => {
    const r = distribuirEspacios(livings, espacios, respetarEspacio);
    const resultado = doc.mozos.length ? asignarMozosEspacios(r.livings, doc.mozos, espacios) : r.livings;
    cambiar((d) => ({ ...d, livings: resultado }));
    const cuenta = (e: Espacio) => resultado.filter((l) => espacioDe(l) === e && l.x !== null).length;
    return { sinLugar: r.sinLugar, resumen: `${cuenta("jardin")} en el jardín y ${cuenta("salon")} en el salón` };
  };

  const importarExcel = async (archivo: File) => {
    if (doc.livings.length && !window.confirm(`Ya hay ${doc.livings.length} livings cargados. ¿Reemplazarlos por los del Excel?`)) return;
    try {
      const { livings, avisos } = await leerLivingsDeExcel(archivo);
      if (!livings.length) {
        setMensaje({ tipo: "error", texto: "No se cargó ningún living", detalles: avisos });
        return;
      }
      const r = acomodar(livings, true);
      setSeleccionado(null);
      setMensaje({ tipo: avisos.length || r.sinLugar ? "error" : "ok", texto: `${livings.length} livings cargados del Excel: ${r.resumen}.`, detalles: avisos });
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo leer el archivo. Subí un Excel (.xlsx, .xls) o CSV." });
    }
  };

  const redistribuir = () => {
    const r = acomodar(doc.livings, false);
    setMensaje({ tipo: r.sinLugar ? "error" : "ok", texto: `Livings distribuidos: ${r.resumen}. Los de mayor consumición, cerca del escenario.` });
  };

  const repartirMozos = () => {
    if (!doc.mozos.length) {
      setMensaje({ tipo: "error", texto: "Cargá los mozos (uno por línea)" });
      return;
    }
    cambiar((d) => ({ ...d, livings: asignarMozosEspacios(d.livings, d.mozos, espacios) }));
    setMensaje({ tipo: "ok", texto: "Mozos asignados por sectores en el jardín y en el salón. Podés cambiar el mozo de cada living tocándolo." });
  };

  const actualizarMozos = (texto: string) => {
    const nombres = [...new Set(texto.split("\n").map((n) => n.trim().slice(0, 80)).filter(Boolean))].slice(0, 200);
    const mozos = nombres.map((nombre) => doc.mozos.find((m) => m.nombre === nombre) ?? { id: nuevoId(), nombre });
    const ids = new Set(mozos.map((m) => m.id));
    const iguales = mozos.length === doc.mozos.length && mozos.every((m, i) => m.id === doc.mozos[i].id);
    if (iguales) return;
    cambiar((d) => ({ ...d, mozos, livings: d.livings.map((l) => (l.mozo_id && !ids.has(l.mozo_id) ? { ...l, mozo_id: null } : l)) }));
  };

  const editarLiving = (id: string, cambio: Partial<Living>) =>
    cambiar((d) => ({ ...d, livings: d.livings.map((l) => (l.id === id ? { ...l, ...cambio } : l)) }));

  const agregarLiving = () => {
    const id = nuevoId();
    cambiar((d) => ({ ...d, livings: [...d.livings, { id, nombre: `Living ${d.livings.length + 1}`, personas: 0, consumicion: 0, notas: null, x: null, y: null, mozo_id: null }] }));
    setSeleccionado(id);
  };

  const living = doc.livings.find((l) => l.id === seleccionado) ?? null;
  const sinUbicar = doc.livings.filter((l) => l.x === null);
  const resumen = resumenPorMozo(doc.livings, doc.mozos);
  const totalPersonas = doc.livings.reduce((s, l) => s + l.personas, 0);
  const totalConsumicion = doc.livings.reduce((s, l) => s + l.consumicion, 0);

  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button type="button" onClick={redistribuir} disabled={!doc.livings.length} className="boton-secundario">Distribuir livings</button>
          <button type="button" onClick={repartirMozos} disabled={!doc.livings.length} className="boton-secundario">Asignar mozos</button>
          <button type="button" onClick={() => window.print()} className="boton-secundario">Imprimir</button>
          <button type="button" onClick={guardar} disabled={guardando || !sinGuardar} className="boton ml-auto">
            {guardando ? "Guardando…" : sinGuardar ? "Guardar" : "Guardado"}
          </button>
        </div>
      )}

      {mensaje && (
        <div className={`${mensaje.tipo === "error" ? "alerta-error" : "rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900"} print:hidden`}>
          <p>{mensaje.texto}</p>
          {mensaje.detalles && mensaje.detalles.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {mensaje.detalles.slice(0, 10).map((d) => <li key={d}>{d}</li>)}
            </ul>
          )}
        </div>
      )}

      {editable && <p className="text-xs text-stone-500 print:hidden">{AYUDA}</p>}
      {doc.livings.length > 0 && (
        <p className={`text-sm ${sinUbicar.length ? "font-medium text-amber-800" : "text-stone-600"} print:hidden`}>
          {doc.livings.length - sinUbicar.length} de {doc.livings.length} livings en el plano
          {sinUbicar.length > 0 && ` · ${sinUbicar.length} sin ubicar: tocá “Distribuir livings” o ubicalos a mano desde la lista de la derecha`}
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
        {/* Jardín y salón, uno al lado del otro. */}
        <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
          {ESPACIOS.map((e) => {
            const suyos = doc.livings.filter((l) => espacioDe(l) === e.id && l.x !== null);
            return (
              <section key={e.id} className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">
                    {e.nombre}{" "}
                    <span className="text-xs font-normal text-stone-500">
                      {suyos.length} livings · {suyos.reduce((s, l) => s + l.personas, 0)} personas
                    </span>
                  </h2>
                  {editable && (
                    <div className="flex gap-1 print:hidden">
                    <select
                      aria-label={`Escenario del ${e.nombre.toLowerCase()}`}
                      value={ladoEscenario(doc, e.id)}
                      onChange={(ev) => cambiar((d) => ({ ...d, escenarios: { ...d.escenarios, [e.id]: ev.target.value as Lado } }))}
                      className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-xs"
                    >
                      {LADOS.map((l) => (
                        <option key={l.id} value={l.id}>{l.nombre}</option>
                      ))}
                    </select>
                    <select
                      aria-label={`Forma del ${e.nombre.toLowerCase()}`}
                      value={relacionDe(e.id)}
                      onChange={(ev) => cambiar((d) => (e.id === "salon" ? { ...d, proporcion_salon: Number(ev.target.value) } : { ...d, proporcion: Number(ev.target.value) }))}
                      className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-xs print:hidden"
                    >
                      {FORMAS.map((f) => (
                        <option key={f.proporcion} value={f.proporcion}>{f.nombre}</option>
                      ))}
                    </select>
                    </div>
                  )}
                </div>
                <ConEscenario lado={ladoEscenario(doc, e.id)}>
                  <Lienzo
                    espacio={e.id}
                    relacion={relacionDe(e.id)}
                    doc={doc}
                    editable={editable}
                    seleccionado={seleccionado}
                    alSeleccionar={setSeleccionado}
                    alCambiar={cambiar}
                    relacionDe={relacionDe}
                  />
                </ConEscenario>
              </section>
            );
          })}
        </div>

        <aside className="space-y-4 text-sm print:hidden">
          {living ? (
            <DetalleLiving
              living={living}
              doc={doc}
              editable={editable}
              alEditar={(c) => editarLiving(living.id, c)}
              alBorrar={() => {
                cambiar((d) => ({ ...d, livings: d.livings.filter((l) => l.id !== living.id) }));
                setSeleccionado(null);
              }}
              alCerrar={() => setSeleccionado(null)}
            />
          ) : (
            <section className="tarjeta space-y-2 p-4">
              <h2 className="font-semibold">Livings</h2>
              <p className="text-stone-600">
                {doc.livings.length} livings · {totalPersonas} personas · {formatoPesos(totalConsumicion)}
              </p>
              {editable && (
                <div className="flex flex-wrap gap-2">
                  <SubirArchivo etiqueta="Subir Excel" acepta=".xlsx,.xls,.csv" alElegir={importarExcel} principal={!doc.livings.length} />
                  <button type="button" onClick={agregarLiving} className="boton-secundario">+ Living</button>
                </div>
              )}
              {editable && (
                <button type="button" onClick={descargarModelo} className="text-left text-xs text-stone-500 underline">
                  Descargar Excel de ejemplo (Nombre, Personas, Consumición, Notas y Lugar opcional: Jardín o Salón)
                </button>
              )}
              {sinUbicar.length > 0 && (
                <div className="space-y-1 pt-2">
                  <p className="text-xs font-medium text-amber-800">Sin ubicar ({sinUbicar.length}): tocá uno y después tocá el plano</p>
                  <div className="flex flex-wrap gap-1">
                    {sinUbicar.map((l) => (
                      <button key={l.id} type="button" onClick={() => setSeleccionado(l.id)} className="rounded-full border border-stone-300 bg-white px-2 py-0.5 text-xs hover:border-stone-900">
                        {l.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {editable && (
            <section className="tarjeta space-y-2 p-4">
              <h2 className="font-semibold">Mozos</h2>
              <textarea
                value={mozosTexto}
                onChange={(e) => setMozosTexto(e.target.value)}
                onBlur={(e) => actualizarMozos(e.target.value)}
                rows={6}
                placeholder={"Un mozo por línea\nJuan\nMaría"}
                className="campo"
              />
              <p className="text-xs text-stone-500">
                Después tocá “Asignar mozos”: se reparten entre jardín y salón según la gente, y en cada lugar por sectores con cantidades de personas parejas.
              </p>
            </section>
          )}
        </aside>
      </div>

      {doc.livings.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Por mozo</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-2">
            {resumen.map((r) => (
              <div key={r.mozo.id || "sin"} className="tarjeta break-inside-avoid p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: colorMozo(doc.mozos, r.mozo.id || null), printColorAdjust: "exact" }} />
                  {r.mozo.nombre}
                </p>
                <p className="text-xs text-stone-500">
                  {r.livings.length} livings · {r.personas} personas · {formatoPesos(r.consumicion)}
                </p>
                <ul className="mt-2 space-y-0.5">
                  {r.livings.map((l) => (
                    <li key={l.id} className="flex justify-between gap-2">
                      <button type="button" onClick={() => setSeleccionado(l.id)} className="truncate text-left hover:underline">
                        {l.nombre}
                        {espacioDe(l) === "salon" && <span className="ml-1 text-xs text-stone-500">(salón)</span>}
                      </button>
                      <span className="shrink-0 text-stone-500">{l.personas} p.</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Cartel "Escenario" del lado elegido, afuera del rectángulo de livings. */
function ConEscenario({ lado, children }: { lado: Lado; children: React.ReactNode }) {
  if (lado === "ninguno") return <>{children}</>;
  const vertical = lado === "arriba" || lado === "abajo";
  const cartel = (
    <div
      className={`flex items-center justify-center rounded bg-stone-800 text-[10px] font-bold uppercase tracking-widest text-white ${
        vertical ? "h-5 w-full" : "w-5 [writing-mode:vertical-rl]"
      }`}
      style={{ printColorAdjust: "exact" }}
    >
      ★ Escenario
    </div>
  );
  return (
    <div className={`flex gap-1 ${vertical ? "flex-col" : "flex-row"}`}>
      {(lado === "arriba" || lado === "izquierda") && cartel}
      <div className="min-w-0 flex-1">{children}</div>
      {(lado === "abajo" || lado === "derecha") && cartel}
    </div>
  );
}

/** El rectángulo de livings con reserva de un espacio (jardín o salón). */
function Lienzo({
  espacio,
  relacion,
  doc,
  editable,
  seleccionado,
  alSeleccionar,
  alCambiar,
  relacionDe,
}: {
  espacio: Espacio;
  relacion: number;
  doc: DocumentoPlano;
  editable: boolean;
  seleccionado: string | null;
  alSeleccionar: (id: string | null) => void;
  alCambiar: (cambio: (d: DocumentoPlano) => DocumentoPlano) => void;
  relacionDe: (e: Espacio) => number;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [anchoPx, setAnchoPx] = useState(600);
  const arrastre = useRef<string | null>(null);
  // Mientras se arrastra, el living puede salir del rectángulo (para pasar al otro espacio).
  const [arrastrando, setArrastrando] = useState(false);
  // Estirar: el living que se agranda y su esquina de arriba a la izquierda (fija).
  const estirando = useRef<{ id: string; x: number; y: number } | null>(null);
  const deAca = (x: { espacio?: Espacio }) => espacioDe(x) === espacio;

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const observador = new ResizeObserver(() => setAnchoPx(el.clientWidth));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const relativo = (e: { clientX: number; clientY: number }, el: Element): Punto => {
    const r = el.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const punto = (e: EventoPuntero) => relativo(e, caja.current!);
  /** Posición sin limitar al rectángulo (puede quedar afuera mientras se arrastra). */
  const puntoLibre = (e: EventoPuntero): Punto => {
    const r = caja.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const alApretarFondo = (e: EventoPuntero<HTMLDivElement>) => {
    if (!editable) return;
    // Si hay un living elegido sin ubicar, se pone donde se tocó (en este espacio).
    const elegido = doc.livings.find((l) => l.id === seleccionado);
    if (elegido && elegido.x === null) {
      const p = punto(e);
      const medidas = elegido.w && elegido.h ? {} : medidasPorDefecto(doc.livings.filter(deAca), relacion);
      alCambiar((d) => ({ ...d, livings: d.livings.map((l) => (l.id === elegido.id ? { ...l, ...medidas, ...p, espacio } : l)) }));
    } else alSeleccionar(null);
  };

  const alMover = (e: EventoPuntero<HTMLDivElement>) => {
    const p = punto(e);
    if (estirando.current) {
      const { id, x, y } = estirando.current;
      const w = Math.max(0.015, p.x - x);
      const h = Math.max(0.015, p.y - y);
      alCambiar((d) => ({ ...d, livings: d.livings.map((l) => (l.id === id ? { ...l, w, h, x: x + w / 2, y: y + h / 2 } : l)) }));
    } else if (arrastre.current) {
      const id = arrastre.current;
      const libre = puntoLibre(e);
      alCambiar((d) => ({ ...d, livings: d.livings.map((l) => (l.id === id ? { ...l, ...libre } : l)) }));
    }
  };

  const alSoltar = (e: EventoPuntero<HTMLDivElement>) => {
    // Living soltado sobre el otro espacio: pasa a ese espacio, donde se soltó.
    const id = arrastre.current;
    if (id) {
      const destino = document
        .elementsFromPoint(e.clientX, e.clientY)
        .find((el) => el instanceof HTMLElement && el.dataset.espacio && el.dataset.espacio !== espacio) as HTMLElement | undefined;
      if (destino) {
        const otro = destino.dataset.espacio as Espacio;
        const p = relativo(e, destino);
        // Las medidas se guardan en proporción de cada espacio: se mantiene el alto real.
        const factor = relacion / relacionDe(otro);
        alCambiar((d) => ({ ...d, livings: d.livings.map((l) => (l.id === id ? { ...l, ...p, espacio: otro, h: l.h ? Math.min(1, l.h * factor) : l.h } : l)) }));
      } else {
        // Soltado acá (o fuera de los dos espacios): queda dentro del rectángulo.
        const p = punto(e);
        alCambiar((d) => ({ ...d, livings: d.livings.map((l) => (l.id === id ? { ...l, ...p } : l)) }));
      }
    }
    setArrastrando(false);
    arrastre.current = null;
    estirando.current = null;
  };

  // Livings sin medidas propias: tamaño fijo, que no depende de los demás.
  const porDefecto = medidasPorDefecto([], relacion);

  return (
    <div
      ref={caja}
      data-espacio={espacio}
      className={`relative w-full touch-none select-none rounded-md border ${arrastrando ? "z-30 overflow-visible" : "overflow-hidden"} ${espacio === "jardin" ? "border-green-900/30" : "border-stone-400"}`}
      style={{ aspectRatio: `1 / ${relacion}`, ...FONDO[espacio], printColorAdjust: "exact" }}
      onPointerDown={alApretarFondo}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
    >
      {doc.livings
        .filter((l) => deAca(l) && l.x !== null && l.y !== null)
        .map((l) => {
          const elegido = l.id === seleccionado;
          const mozo = doc.mozos.find((m) => m.id === l.mozo_id);
          const color = colorMozo(doc.mozos, l.mozo_id);
          // Rectángulo en px: el alto según las personas (lo calcula la distribución).
          const anchoL = (l.w ?? porDefecto.w) * anchoPx;
          const altoL = (l.h ?? porDefecto.h) * anchoPx * relacion;
          const chico = Math.min(anchoL, altoL);
          return (
            <div
              key={l.id}
              role="button"
              tabIndex={0}
              title={`${l.nombre} · ${l.personas} personas · ${formatoPesos(l.consumicion)}${mozo ? ` · Mozo: ${mozo.nombre}` : ""}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                alSeleccionar(l.id);
                if (editable) {
                  caja.current?.setPointerCapture(e.pointerId);
                  arrastre.current = l.id;
                  setArrastrando(true);
                }
              }}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center overflow-hidden rounded-md border-2 border-white text-center leading-tight text-white shadow ${
                editable ? "cursor-grab active:cursor-grabbing" : ""
              } ${elegido ? "z-10 ring-4 ring-amber-400" : ""}`}
              style={{
                left: `${l.x! * 100}%`,
                top: `${l.y! * 100}%`,
                width: anchoL,
                height: altoL,
                background: color,
                printColorAdjust: "exact",
              }}
            >
              {/* Cartel con el mozo a cargo. */}
              {mozo && altoL >= 30 && (
                <span className="absolute inset-x-0 top-0 truncate bg-white px-1 text-[10px] font-bold leading-4" style={{ color, printColorAdjust: "exact" }}>
                  {mozo.nombre}
                </span>
              )}
              <span className={mozo && altoL >= 30 ? "mt-3 flex flex-col items-center" : "flex flex-col items-center"}>
                {anchoL >= 50 && altoL >= 62 && <span className="w-full truncate px-1 text-[11px] font-semibold">{l.nombre}</span>}
                <span className={chico >= 34 ? "text-xs font-bold" : "text-[9px] font-bold"}>{l.personas}p</span>
                {chico >= 24 && altoL >= 44 && <span className={chico >= 40 ? "text-[11px]" : "text-[9px]"}>{consumicionCorta(l.consumicion)}</span>}
              </span>
              {elegido && editable && (
                <span
                  role="presentation"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    caja.current?.setPointerCapture(e.pointerId);
                    estirando.current = { id: l.id, x: l.x! - (l.w ?? porDefecto.w) / 2, y: l.y! - (l.h ?? porDefecto.h) / 2 };
                  }}
                  className="absolute bottom-0 right-0 z-20 h-3.5 w-3.5 cursor-nwse-resize rounded-tl-sm border-l-2 border-t-2 border-stone-900 bg-white print:hidden"
                  aria-label="Estirar"
                />
              )}
            </div>
          );
        })}
    </div>
  );
}

function DetalleLiving({
  living,
  doc,
  editable,
  alEditar,
  alBorrar,
  alCerrar,
}: {
  living: Living;
  doc: DocumentoPlano;
  editable: boolean;
  alEditar: (cambio: Partial<Living>) => void;
  alBorrar: () => void;
  alCerrar: () => void;
}) {
  const numero = (texto: string) => {
    const n = Number(texto.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return (
    <section className="tarjeta space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Living</h2>
        <button type="button" onClick={alCerrar} className="text-xs text-stone-500 hover:text-stone-900">Cerrar</button>
      </div>
      <div>
        <label className="etiqueta" htmlFor="living-nombre">Nombre</label>
        <input id="living-nombre" value={living.nombre} disabled={!editable} maxLength={120} onChange={(e) => alEditar({ nombre: e.target.value })} className="campo" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="etiqueta" htmlFor="living-personas">Personas</label>
          <input id="living-personas" inputMode="numeric" disabled={!editable} value={living.personas} onChange={(e) => alEditar({ personas: Math.min(1000, Math.round(numero(e.target.value))) })} className="campo" />
        </div>
        <div>
          <label className="etiqueta" htmlFor="living-consumicion">Consumición $</label>
          <input id="living-consumicion" inputMode="decimal" disabled={!editable} value={living.consumicion} onChange={(e) => alEditar({ consumicion: numero(e.target.value) })} className="campo" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="etiqueta" htmlFor="living-lugar">Lugar</label>
          <select
            id="living-lugar"
            disabled={!editable}
            value={espacioDe(living)}
            // Pasa al otro espacio en la misma posición; se acomoda arrastrándolo.
            onChange={(e) => alEditar({ espacio: e.target.value as Espacio })}
            className="campo"
          >
            {ESPACIOS.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="living-mozo">Mozo</label>
          <select id="living-mozo" disabled={!editable} value={living.mozo_id ?? ""} onChange={(e) => alEditar({ mozo_id: e.target.value || null })} className="campo">
            <option value="">Sin mozo</option>
            {doc.mozos.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="etiqueta" htmlFor="living-notas">Notas</label>
        <input id="living-notas" disabled={!editable} value={living.notas ?? ""} maxLength={500} onChange={(e) => alEditar({ notas: e.target.value || null })} className="campo" />
      </div>
      {living.x === null && <p className="text-xs text-amber-800">Sin ubicar: tocá el jardín o el salón donde va.</p>}
      {editable && (
        <div className="flex gap-3 text-xs">
          {living.x !== null && (
            <button type="button" onClick={() => alEditar({ x: null, y: null })} className="text-stone-600 hover:underline">Sacar del plano</button>
          )}
          <button type="button" onClick={() => window.confirm(`¿Borrar ${living.nombre}?`) && alBorrar()} className="ml-auto text-red-700 hover:underline">Borrar</button>
        </div>
      )}
    </section>
  );
}

function SubirArchivo({ etiqueta, acepta, alElegir, principal }: { etiqueta: string; acepta: string; alElegir: (f: File) => void; principal?: boolean }) {
  return (
    <label className={`${principal ? "boton" : "boton-secundario"} cursor-pointer`}>
      {etiqueta}
      <input
        type="file"
        accept={acepta}
        className="sr-only"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          e.target.value = "";
          if (archivo) alElegir(archivo);
        }}
      />
    </label>
  );
}
