"use client";

import { useEffect, useRef, useState, useTransition, type PointerEvent as EventoPuntero } from "react";
import { guardarPlano, subirImagenPlano } from "@/lib/livings/acciones";
import { descargarModelo, leerLivingsDeExcel } from "@/lib/livings/excel";
import {
  asignarMozos,
  colorMozo,
  distribuir,
  nuevoId,
  resumenPorMozo,
  type DocumentoPlano,
  type Living,
  type Plano,
  type Zona,
} from "@/lib/livings/tipos";
import { formatoPesos } from "@/lib/formato";

type Modo = "mover" | "zonas" | "referencia";
type Punto = { x: number; y: number };

const AYUDA: Record<Modo, string> = {
  mover: "Arrastrá los livings para moverlos. Tocá uno para ver o editar sus datos.",
  zonas: "Arrastrá sobre el plano para marcar dónde pueden ir livings. La × borra una zona.",
  referencia: "Tocá el plano donde está el escenario o la zona VIP: los livings de mayor consumición van más cerca.",
};

export function EditorPlano({ inicial, editable }: { inicial: Plano; editable: boolean }) {
  const [doc, setDoc] = useState<DocumentoPlano>({
    tamano_living: inicial.tamano_living,
    zonas: inicial.zonas,
    referencia: inicial.referencia,
    mozos: inicial.mozos,
    livings: inicial.livings,
  });
  const [imagen, setImagen] = useState({ url: inicial.imagen_url, ancho: inicial.imagen_ancho, alto: inicial.imagen_alto });
  const [modo, setModo] = useState<Modo>(inicial.zonas.length ? "mover" : "zonas");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [sinGuardar, setSinGuardar] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string; detalles?: string[] } | null>(null);
  const [mozosTexto, setMozosTexto] = useState(inicial.mozos.map((m) => m.nombre).join("\n"));
  const [guardando, iniciarGuardado] = useTransition();
  const [subiendo, iniciarSubida] = useTransition();

  const relacion = imagen.ancho && imagen.alto ? imagen.alto / imagen.ancho : 0.66;
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
      // Un nombre borrado no impide guardar.
      const r = await guardarPlano({ ...doc, livings: doc.livings.map((l) => ({ ...l, nombre: l.nombre.trim() || "Living" })) });
      if (r.error) setMensaje({ tipo: "error", texto: r.error });
      else {
        setSinGuardar(false);
        setMensaje({ tipo: "ok", texto: "Plano guardado" });
      }
    });

  const subirImagen = (archivo: File) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const datos = new FormData();
      datos.set("imagen", archivo);
      datos.set("ancho", String(img.naturalWidth));
      datos.set("alto", String(img.naturalHeight));
      URL.revokeObjectURL(url);
      iniciarSubida(async () => {
        const r = await subirImagenPlano(datos);
        if (r.error || !r.url) setMensaje({ tipo: "error", texto: r.error ?? "No se pudo subir la imagen" });
        else {
          setImagen({ url: r.url, ancho: img.naturalWidth, alto: img.naturalHeight });
          setMensaje({ tipo: "ok", texto: "Plano del jardín cargado. Ahora marcá las zonas donde pueden ir livings." });
          setModo("zonas");
        }
      });
    };
    img.onerror = () => setMensaje({ tipo: "error", texto: "No se pudo leer la imagen" });
    img.src = url;
  };

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
        const r = distribuir(livings, doc.zonas, doc.tamano_living, relacion, doc.referencia);
        resultado = asignarMozos(r.livings, doc.mozos, relacion, doc.referencia);
        sinLugar = r.sinLugar;
      }
      cambiar((d) => ({ ...d, livings: resultado }));
      setSeleccionado(null);
      setModo("mover");
      setMensaje({
        tipo: avisos.length || sinLugar ? "error" : "ok",
        texto: `${livings.length} livings cargados${doc.zonas.length ? " y acomodados" : ". Marcá zonas y tocá “Distribuir”."}${sinLugar ? ` ${sinLugar} no entraron en las zonas: agrandá las zonas o achicá los livings.` : ""}`,
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
    const r = distribuir(doc.livings, doc.zonas, doc.tamano_living, relacion, doc.referencia);
    cambiar((d) => ({ ...d, livings: d.mozos.length ? asignarMozos(r.livings, d.mozos, relacion, d.referencia) : r.livings }));
    setMensaje(
      r.sinLugar
        ? { tipo: "error", texto: `${r.sinLugar} livings no entraron en las zonas: agrandá las zonas o achicá los livings.` }
        : { tipo: "ok", texto: "Livings distribuidos" },
    );
  };

  const repartirMozos = () => {
    if (!doc.mozos.length) {
      setMensaje({ tipo: "error", texto: "Cargá los mozos (uno por línea)" });
      return;
    }
    cambiar((d) => ({ ...d, livings: asignarMozos(d.livings, d.mozos, relacion, d.referencia) }));
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
            {(["mover", "zonas", "referencia"] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={!imagen.url}
                onClick={() => setModo(m)}
                className={`px-3 py-1.5 disabled:opacity-50 ${modo === m ? "bg-stone-900 text-white" : "bg-white hover:bg-stone-100"}`}
              >
                {m === "mover" ? "Mover livings" : m === "zonas" ? "Marcar zonas" : "Escenario / VIP"}
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
          {imagen.url ? (
            <>
              {editable && <p className="text-xs text-stone-500 print:hidden">{AYUDA[modo]}</p>}
              <Lienzo
                imagenUrl={imagen.url}
                relacion={relacion}
                doc={doc}
                modo={editable ? modo : null}
                seleccionado={seleccionado}
                alSeleccionar={setSeleccionado}
                alCambiar={cambiar}
              />
            </>
          ) : (
            <div className="tarjeta flex min-h-64 flex-col items-center justify-center gap-3 text-center text-sm text-stone-600">
              <p className="font-medium">Subí el plano o una foto del jardín</p>
              <p className="max-w-sm text-stone-500">Sobre la imagen se marcan las zonas donde pueden ir los livings y la app los acomoda.</p>
              {editable && <SubirArchivo etiqueta={subiendo ? "Subiendo…" : "Elegir imagen"} acepta="image/jpeg,image/png,image/webp" alElegir={subirImagen} principal />}
            </div>
          )}
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

          {editable && imagen.url && (
            <section className="tarjeta space-y-2 p-4">
              <h2 className="font-semibold">Plano</h2>
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
              <p className="text-xs text-stone-500">{doc.zonas.length} zona{doc.zonas.length === 1 ? "" : "s"} marcada{doc.zonas.length === 1 ? "" : "s"}{doc.referencia ? " · escenario marcado" : ""}</p>
              <SubirArchivo etiqueta={subiendo ? "Subiendo…" : "Cambiar imagen del jardín"} acepta="image/jpeg,image/png,image/webp" alElegir={subirImagen} />
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
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: colorMozo(doc.mozos, r.mozo.id || null) }} />
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

/** Imagen del jardín con las zonas, el escenario y los livings encima. */
function Lienzo({
  imagenUrl,
  relacion,
  doc,
  modo,
  seleccionado,
  alSeleccionar,
  alCambiar,
}: {
  imagenUrl: string;
  relacion: number;
  doc: DocumentoPlano;
  modo: Modo | null;
  seleccionado: string | null;
  alSeleccionar: (id: string | null) => void;
  alCambiar: (cambio: (d: DocumentoPlano) => DocumentoPlano) => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [anchoPx, setAnchoPx] = useState(800);
  const [borrador, setBorrador] = useState<{ inicio: Punto; fin: Punto } | null>(null);
  const arrastre = useRef<{ id: string; movido: boolean } | null>(null);

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
    if (modo === "zonas") {
      e.currentTarget.setPointerCapture(e.pointerId);
      setBorrador({ inicio: p, fin: p });
    } else if (modo === "referencia") {
      alCambiar((d) => ({ ...d, referencia: p }));
    } else {
      // Mover: si hay un living elegido sin ubicar, se pone donde se tocó.
      const elegido = doc.livings.find((l) => l.id === seleccionado);
      if (elegido && elegido.x === null) alCambiar((d) => ({ ...d, livings: d.livings.map((l) => (l.id === elegido.id ? { ...l, ...p } : l)) }));
      else alSeleccionar(null);
    }
  };

  const alMover = (e: EventoPuntero<HTMLDivElement>) => {
    if (borrador) setBorrador({ ...borrador, fin: punto(e) });
    if (arrastre.current) {
      const p = punto(e);
      const id = arrastre.current.id;
      arrastre.current.movido = true;
      alCambiar((d) => ({ ...d, livings: d.livings.map((l) => (l.id === id ? { ...l, ...p } : l)) }));
    }
  };

  const alSoltar = () => {
    if (borrador) {
      const zona: Zona = {
        id: nuevoId(),
        x: Math.min(borrador.inicio.x, borrador.fin.x),
        y: Math.min(borrador.inicio.y, borrador.fin.y),
        w: Math.abs(borrador.fin.x - borrador.inicio.x),
        h: Math.abs(borrador.fin.y - borrador.inicio.y),
      };
      if (zona.w > 0.01 && zona.h > 0.01) alCambiar((d) => ({ ...d, zonas: [...d.zonas, zona] }));
      setBorrador(null);
    }
    arrastre.current = null;
  };

  const diametro = doc.tamano_living * anchoPx;
  const rect = borrador && {
    x: Math.min(borrador.inicio.x, borrador.fin.x),
    y: Math.min(borrador.inicio.y, borrador.fin.y),
    w: Math.abs(borrador.fin.x - borrador.inicio.x),
    h: Math.abs(borrador.fin.y - borrador.inicio.y),
  };

  return (
    <div
      ref={caja}
      className={`relative w-full touch-none select-none overflow-hidden rounded-md border border-stone-300 bg-stone-100 ${modo === "zonas" || modo === "referencia" ? "cursor-crosshair" : ""}`}
      style={{ aspectRatio: `1 / ${relacion}` }}
      onPointerDown={alApretarFondo}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- link firmado temporal de Supabase */}
      <img src={imagenUrl} alt="Plano del jardín" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />

      {doc.zonas.map((z) => (
        <div
          key={z.id}
          className={`absolute border-2 border-dashed ${modo === "zonas" ? "border-sky-500 bg-sky-400/20" : "border-sky-500/40 bg-sky-400/5"} print:hidden`}
          style={{ left: `${z.x * 100}%`, top: `${z.y * 100}%`, width: `${z.w * 100}%`, height: `${z.h * 100}%` }}
        >
          {modo === "zonas" && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => alCambiar((d) => ({ ...d, zonas: d.zonas.filter((x) => x.id !== z.id) }))}
              className="absolute right-0 top-0 h-6 w-6 bg-sky-600 text-sm leading-6 text-white"
              aria-label="Borrar zona"
            >
              ×
            </button>
          )}
        </div>
      ))}
      {rect && (
        <div className="absolute border-2 border-sky-600 bg-sky-400/30" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }} />
      )}

      {doc.referencia && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-stone-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ left: `${doc.referencia.x * 100}%`, top: `${doc.referencia.y * 100}%` }}
        >
          ★ Escenario
        </div>
      )}

      {doc.livings
        .filter((l) => l.x !== null && l.y !== null)
        .map((l) => {
          const color = colorMozo(doc.mozos, l.mozo_id);
          const elegido = l.id === seleccionado;
          return (
            <div
              key={l.id}
              role="button"
              tabIndex={0}
              title={`${l.nombre} · ${l.personas} personas · ${formatoPesos(l.consumicion)}`}
              onPointerDown={(e) => {
                if (modo !== "mover" && modo !== null) return;
                e.stopPropagation();
                alSeleccionar(l.id);
                if (modo === "mover") {
                  caja.current?.setPointerCapture(e.pointerId);
                  arrastre.current = { id: l.id, movido: false };
                }
              }}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center overflow-hidden rounded-full border-2 text-center leading-tight text-white shadow ${
                modo === "mover" ? "cursor-grab active:cursor-grabbing" : ""
              } ${elegido ? "z-10 ring-4 ring-amber-400" : ""}`}
              style={{ left: `${l.x! * 100}%`, top: `${l.y! * 100}%`, width: diametro, height: diametro, background: color, borderColor: "white" }}
            >
              {diametro >= 44 && <span className="w-full truncate px-1 text-[10px] font-semibold">{l.nombre}</span>}
              <span className={diametro >= 24 ? "text-[11px] font-bold" : "text-[8px] font-bold"}>{l.personas}</span>
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
