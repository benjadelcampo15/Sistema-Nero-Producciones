"use client";

import { useEffect, useRef, useState, useTransition, type PointerEvent as EventoPuntero } from "react";
import { guardarPlano } from "@/lib/livings/acciones";
import { descargarModelo, leerLivingsDeExcel } from "@/lib/livings/excel";
import {
  FORMAS,
  TIPOS_ELEMENTO,
  asignarMozos,
  colorMozo,
  consumicionCorta,
  diametroLiving,
  distribuir,
  nuevoId,
  promedioPersonas,
  resumenPorMozo,
  type DocumentoPlano,
  type Elemento,
  type Living,
  type TipoElemento,
} from "@/lib/livings/tipos";
import { formatoPesos } from "@/lib/formato";

type Modo = "mover" | "dibujar" | "zonas";
type Punto = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

const AYUDA: Record<Modo, string> = {
  mover: "Arrastrá los livings para moverlos. Tocá uno para ver o editar sus datos.",
  dibujar: "Elegí qué dibujar y arrastrá sobre el pasto. La × lo borra. Los livings de mayor consumición van más cerca del escenario.",
  zonas: "Arrastrá sobre el pasto para marcar dónde pueden ir livings. La × borra una zona.",
};

const NOMBRE_MODO: Record<Modo, string> = { mover: "Mover livings", dibujar: "Dibujar jardín", zonas: "Zonas de livings" };

/** El punto VIP es el centro del escenario dibujado. */
function centroEscenario(elementos: Elemento[]): Punto | null {
  const e = elementos.find((x) => x.tipo === "escenario");
  return e ? { x: e.x + e.w / 2, y: e.y + e.h / 2 } : null;
}

export function EditorPlano({ inicial, editable }: { inicial: DocumentoPlano; editable: boolean }) {
  const [doc, setDoc] = useState<DocumentoPlano>(inicial);
  const [modo, setModo] = useState<Modo>(!inicial.elementos.length ? "dibujar" : !inicial.zonas.length ? "zonas" : "mover");
  const [tipoDibujo, setTipoDibujo] = useState<TipoElemento>("escenario");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [sinGuardar, setSinGuardar] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string; detalles?: string[] } | null>(null);
  const [mozosTexto, setMozosTexto] = useState(inicial.mozos.map((m) => m.nombre).join("\n"));
  const [guardando, iniciarGuardado] = useTransition();

  const relacion = doc.proporcion;
  const referencia = centroEscenario(doc.elementos);
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
        referencia,
        // Un nombre borrado no impide guardar.
        livings: doc.livings.map((l) => ({ ...l, nombre: l.nombre.trim() || "Living" })),
      });
      if (r.error) setMensaje({ tipo: "error", texto: r.error });
      else {
        setSinGuardar(false);
        setMensaje({ tipo: "ok", texto: "Plano guardado" });
      }
    });

  const importarExcel = async (archivo: File) => {
    if (doc.livings.length && !window.confirm(`Ya hay ${doc.livings.length} livings cargados. ¿Reemplazarlos por los del Excel?`)) return;
    try {
      const { livings, avisos } = await leerLivingsDeExcel(archivo);
      if (!livings.length) {
        setMensaje({ tipo: "error", texto: "No se cargó ningún living", detalles: avisos });
        return;
      }
      let resultado = livings;
      let sinLugar = 0;
      if (doc.zonas.length) {
        const r = distribuir(livings, doc.zonas, doc.tamano_living, relacion, referencia, doc.elementos);
        resultado = asignarMozos(r.livings, doc.mozos, relacion, referencia);
        sinLugar = r.sinLugar;
      }
      cambiar((d) => ({ ...d, livings: resultado }));
      setSeleccionado(null);
      setModo("mover");
      setMensaje({
        tipo: avisos.length || sinLugar ? "error" : "ok",
        texto: `${livings.length} livings cargados${doc.zonas.length ? " y acomodados" : ". Marcá las zonas de livings y tocá “Distribuir”."}${sinLugar ? ` ${sinLugar} no entraron en las zonas: agrandá las zonas o achicá los livings.` : ""}`,
        detalles: avisos,
      });
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo leer el archivo. Subí un Excel (.xlsx, .xls) o CSV." });
    }
  };

  const redistribuir = () => {
    if (!doc.zonas.length) {
      setMensaje({ tipo: "error", texto: "Primero marcá las zonas donde pueden ir livings" });
      setModo("zonas");
      return;
    }
    const r = distribuir(doc.livings, doc.zonas, doc.tamano_living, relacion, referencia, doc.elementos);
    cambiar((d) => ({ ...d, livings: d.mozos.length ? asignarMozos(r.livings, d.mozos, relacion, referencia) : r.livings }));
    setMensaje(
      r.sinLugar
        ? { tipo: "error", texto: `${r.sinLugar} livings no entraron en las zonas: agrandá las zonas o achicá los livings.` }
        : { tipo: "ok", texto: referencia ? "Livings distribuidos: los de mayor consumición, cerca del escenario" : "Livings distribuidos (dibujá el escenario para que los de mayor consumición queden adelante)" },
    );
  };

  const repartirMozos = () => {
    if (!doc.mozos.length) {
      setMensaje({ tipo: "error", texto: "Cargá los mozos (uno por línea)" });
      return;
    }
    cambiar((d) => ({ ...d, livings: asignarMozos(d.livings, d.mozos, relacion, referencia) }));
    setMensaje({ tipo: "ok", texto: "Mozos asignados. Podés cambiar el mozo de cada living tocándolo." });
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
    setModo("mover");
  };

  const alDibujar = (r: Rect) => {
    if (modo === "zonas") cambiar((d) => ({ ...d, zonas: [...d.zonas, { id: nuevoId(), ...r }] }));
    if (modo === "dibujar") cambiar((d) => ({ ...d, elementos: [...d.elementos, { id: nuevoId(), tipo: tipoDibujo, ...r }] }));
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
          <div className="flex overflow-hidden rounded-md border border-stone-300 text-sm">
            {(["dibujar", "zonas", "mover"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModo(m)}
                className={`px-3 py-1.5 ${modo === m ? "bg-stone-900 text-white" : "bg-white hover:bg-stone-100"}`}
              >
                {NOMBRE_MODO[m]}
              </button>
            ))}
          </div>
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

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-2">
          {editable && (
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <p className="text-xs text-stone-500">{AYUDA[modo]}</p>
              {modo === "dibujar" && (
                <div className="flex flex-wrap gap-1">
                  {TIPOS_ELEMENTO.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTipoDibujo(t.id)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${tipoDibujo === t.id ? "border-stone-900 ring-2 ring-stone-900" : "border-stone-300"}`}
                      style={{ background: t.color, color: t.texto }}
                    >
                      {t.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Lienzo
            doc={doc}
            modo={editable ? modo : null}
            seleccionado={seleccionado}
            alSeleccionar={setSeleccionado}
            alCambiar={cambiar}
            alDibujar={alDibujar}
          />
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
                <button type="button" onClick={descargarModelo} className="text-xs text-stone-500 underline">
                  Descargar Excel de ejemplo (Nombre, Personas, Consumición, Notas)
                </button>
              )}
              {sinUbicar.length > 0 && (
                <div className="space-y-1 pt-2">
                  <p className="text-xs font-medium text-amber-800">Sin ubicar ({sinUbicar.length}): tocá uno y después tocá el plano</p>
                  <div className="flex flex-wrap gap-1">
                    {sinUbicar.map((l) => (
                      <button key={l.id} type="button" onClick={() => { setSeleccionado(l.id); setModo("mover"); }} className="rounded-full border border-stone-300 bg-white px-2 py-0.5 text-xs hover:border-stone-900">
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
                rows={5}
                placeholder={"Un mozo por línea\nJuan\nMaría"}
                className="campo"
              />
              <p className="text-xs text-stone-500">Después tocá “Asignar mozos”: reparte sectores del jardín con una cantidad de personas pareja.</p>
            </section>
          )}

          {editable && (
            <section className="tarjeta space-y-2 p-4">
              <h2 className="font-semibold">Jardín</h2>
              <label className="etiqueta" htmlFor="forma">Forma</label>
              <select
                id="forma"
                value={doc.proporcion}
                onChange={(e) => cambiar((d) => ({ ...d, proporcion: Number(e.target.value) }))}
                className="campo"
              >
                {FORMAS.map((f) => (
                  <option key={f.proporcion} value={f.proporcion}>{f.nombre}</option>
                ))}
              </select>
              <label className="etiqueta" htmlFor="tamano">Tamaño de los livings</label>
              <input
                id="tamano"
                type="range"
                min={0.015}
                max={0.12}
                step={0.001}
                value={doc.tamano_living}
                onChange={(e) => cambiar((d) => ({ ...d, tamano_living: Number(e.target.value) }))}
                className="w-full"
              />
              <p className="text-xs text-stone-500">
                {doc.zonas.length} zona{doc.zonas.length === 1 ? "" : "s"} de livings · {referencia ? "escenario dibujado" : "falta dibujar el escenario"}
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
                      <button type="button" onClick={() => setSeleccionado(l.id)} className="truncate text-left hover:underline">{l.nombre}</button>
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

/** Jardín dibujado (pasto, escenario, barras…) con las zonas y los livings encima. */
function Lienzo({
  doc,
  modo,
  seleccionado,
  alSeleccionar,
  alCambiar,
  alDibujar,
}: {
  doc: DocumentoPlano;
  modo: Modo | null;
  seleccionado: string | null;
  alSeleccionar: (id: string | null) => void;
  alCambiar: (cambio: (d: DocumentoPlano) => DocumentoPlano) => void;
  alDibujar: (r: Rect) => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [anchoPx, setAnchoPx] = useState(800);
  const [borrador, setBorrador] = useState<{ inicio: Punto; fin: Punto } | null>(null);
  const arrastre = useRef<string | null>(null);
  const dibujando = modo === "zonas" || modo === "dibujar";

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const observador = new ResizeObserver(() => setAnchoPx(el.clientWidth));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const punto = (e: EventoPuntero): Punto => {
    const r = caja.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const alApretarFondo = (e: EventoPuntero<HTMLDivElement>) => {
    if (!modo) return;
    const p = punto(e);
    if (dibujando) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setBorrador({ inicio: p, fin: p });
      return;
    }
    // Mover: si hay un living elegido sin ubicar, se pone donde se tocó.
    const elegido = doc.livings.find((l) => l.id === seleccionado);
    if (elegido && elegido.x === null) alCambiar((d) => ({ ...d, livings: d.livings.map((l) => (l.id === elegido.id ? { ...l, ...p } : l)) }));
    else alSeleccionar(null);
  };

  const alMover = (e: EventoPuntero<HTMLDivElement>) => {
    if (borrador) setBorrador({ ...borrador, fin: punto(e) });
    if (arrastre.current) {
      const p = punto(e);
      const id = arrastre.current;
      alCambiar((d) => ({ ...d, livings: d.livings.map((l) => (l.id === id ? { ...l, ...p } : l)) }));
    }
  };

  const rectBorrador = borrador && {
    x: Math.min(borrador.inicio.x, borrador.fin.x),
    y: Math.min(borrador.inicio.y, borrador.fin.y),
    w: Math.abs(borrador.fin.x - borrador.inicio.x),
    h: Math.abs(borrador.fin.y - borrador.inicio.y),
  };

  const alSoltar = () => {
    if (rectBorrador && rectBorrador.w > 0.01 && rectBorrador.h > 0.01) alDibujar(rectBorrador);
    setBorrador(null);
    arrastre.current = null;
  };

  const posicion = (r: Rect) => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
  const promedio = promedioPersonas(doc.livings);
  const borrar = (accion: () => void) => (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={accion}
      className="absolute right-0 top-0 h-6 w-6 bg-stone-900/80 text-sm leading-6 text-white"
      aria-label="Borrar"
    >
      ×
    </button>
  );

  return (
    <div
      ref={caja}
      className={`relative w-full touch-none select-none overflow-hidden rounded-md border border-green-900/30 ${dibujando ? "cursor-crosshair" : ""}`}
      style={{
        aspectRatio: `1 / ${doc.proporcion}`,
        // Pasto cortado en franjas.
        background: "repeating-linear-gradient(90deg, #4a8c47 0 4%, #539a4f 4% 8%)",
        printColorAdjust: "exact",
      }}
      onPointerDown={alApretarFondo}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
    >
      {doc.elementos.map((el) => {
        const tipo = TIPOS_ELEMENTO.find((t) => t.id === el.tipo)!;
        return (
          <div
            key={el.id}
            className="absolute flex items-center justify-center overflow-hidden rounded-sm text-center text-[11px] font-semibold uppercase tracking-wide shadow-sm"
            style={{ ...posicion(el), background: tipo.color, color: tipo.texto, printColorAdjust: "exact" }}
          >
            {el.w * anchoPx > 40 && el.h * anchoPx * doc.proporcion > 14 && <span className="px-1">{tipo.id === "escenario" ? "★ " : ""}{tipo.nombre}</span>}
            {modo === "dibujar" && borrar(() => alCambiar((d) => ({ ...d, elementos: d.elementos.filter((x) => x.id !== el.id) })))}
          </div>
        );
      })}

      {doc.zonas.map((z) => (
        <div
          key={z.id}
          className={`absolute border-2 border-dashed ${modo === "zonas" ? "border-white bg-white/20" : "border-white/40"} print:hidden`}
          style={posicion(z)}
        >
          {modo === "zonas" && borrar(() => alCambiar((d) => ({ ...d, zonas: d.zonas.filter((x) => x.id !== z.id) })))}
        </div>
      ))}
      {rectBorrador && (
        <div
          className="absolute border-2 border-white"
          style={{
            ...posicion(rectBorrador),
            background: modo === "dibujar" ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.2)",
          }}
        />
      )}

      {doc.livings
        .filter((l) => l.x !== null && l.y !== null)
        .map((l) => {
          const elegido = l.id === seleccionado;
          // Más personas, living más grande.
          const diametro = diametroLiving(l.personas, doc.tamano_living, promedio) * anchoPx;
          return (
            <div
              key={l.id}
              role="button"
              tabIndex={0}
              title={`${l.nombre} · ${l.personas} personas · ${formatoPesos(l.consumicion)}`}
              onPointerDown={(e) => {
                if (dibujando) return;
                e.stopPropagation();
                alSeleccionar(l.id);
                if (modo === "mover") {
                  caja.current?.setPointerCapture(e.pointerId);
                  arrastre.current = l.id;
                }
              }}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center overflow-hidden rounded-full border-2 border-white text-center leading-tight text-white shadow ${
                modo === "mover" ? "cursor-grab active:cursor-grabbing" : ""
              } ${elegido ? "z-10 ring-4 ring-amber-400" : ""} ${dibujando ? "pointer-events-none opacity-60" : ""}`}
              style={{
                left: `${l.x! * 100}%`,
                top: `${l.y! * 100}%`,
                width: diametro,
                height: diametro,
                background: colorMozo(doc.mozos, l.mozo_id),
                printColorAdjust: "exact",
              }}
            >
              {diametro >= 64 && <span className="w-full truncate px-1 text-[10px] font-semibold">{l.nombre}</span>}
              <span className={diametro >= 36 ? "text-[11px] font-bold" : "text-[8px] font-bold"}>{l.personas}p</span>
              {diametro >= 26 && <span className={diametro >= 44 ? "text-[10px]" : "text-[8px]"}>{consumicionCorta(l.consumicion)}</span>}
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
      <div>
        <label className="etiqueta" htmlFor="living-mozo">Mozo</label>
        <select id="living-mozo" disabled={!editable} value={living.mozo_id ?? ""} onChange={(e) => alEditar({ mozo_id: e.target.value || null })} className="campo">
          <option value="">Sin mozo</option>
          {doc.mozos.map((m) => (
            <option key={m.id} value={m.id}>{m.nombre}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="etiqueta" htmlFor="living-notas">Notas</label>
        <input id="living-notas" disabled={!editable} value={living.notas ?? ""} maxLength={500} onChange={(e) => alEditar({ notas: e.target.value || null })} className="campo" />
      </div>
      {living.x === null && <p className="text-xs text-amber-800">Sin ubicar: tocá el plano donde va.</p>}
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
