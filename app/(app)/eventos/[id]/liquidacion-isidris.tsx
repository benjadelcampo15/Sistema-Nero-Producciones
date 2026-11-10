"use client";

import { useState, useTransition } from "react";
import {
  activarLiquidacion,
  actualizarCategoria,
  agregarCategoria,
  borrarCategoria,
  configurarLiquidacion,
  quitarLiquidacion,
  sumarCantidad,
} from "@/lib/eventos/acciones-liquidacion";
import { calcularEntrada, NOMBRE_SECCION, resumir, type Categoria, type Liquidacion, type Seccion } from "@/lib/eventos/liquidacion";
import { formatoPesos } from "@/lib/formato";

type Fallo = { texto: string; reintentar?: () => void } | null;

const cantidad = (n: number) => n.toLocaleString("es-AR");

/** "25.000", "25000", "1.234,50" → número; vacío → null; inválido → NaN. */
function leerNumero(texto: string) {
  const t = texto.trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!t) return null;
  const limpio = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Entradas y liquidación Isidris (pestaña PORCENTAJE ISIDRIS): por evento y
 * opcional. Es solo el cálculo del reparto: no crea movimientos en Financiero.
 */
export function LiquidacionIsidris({
  eventoId,
  inicial,
  editable,
  cambiaReparto,
}: {
  eventoId: string;
  inicial: Liquidacion | null;
  editable: boolean;
  /** Puede cambiar el 85/15 (administrador o permiso de edición en Financiero). */
  cambiaReparto: boolean;
}) {
  const [l, setL] = useState(inicial);
  // Cuando llegan los datos del servidor (después de guardar), se toman esos.
  const [recibido, setRecibido] = useState(inicial);
  if (recibido !== inicial) {
    setRecibido(inicial);
    setL(inicial);
  }
  const [fallo, setFallo] = useState<Fallo>(null);
  const [pendiente, iniciar] = useTransition();

  if (!l) {
    if (!editable) return null;
    return (
      <section className="tarjeta flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="font-semibold">Entradas y liquidación Isidris</h2>
          <p className="text-sm text-stone-500">Cargá las entradas vendidas y calculá el reparto entre Nero e Isidris, más comida y parking. Solo para los eventos que lo usen.</p>
        </div>
        <button
          type="button"
          disabled={pendiente}
          className="boton-secundario"
          onClick={() =>
            iniciar(async () => {
              const r = await activarLiquidacion(eventoId);
              if (r.error) setFallo({ texto: r.error });
            })
          }
        >
          {pendiente ? "Activando…" : "Activar en este evento"}
        </button>
        {fallo && <p className="alerta-error w-full">{fallo.texto}</p>}
      </section>
    );
  }

  const resumen = resumir(l);

  /** Cambia un dato en pantalla al instante y lo guarda; si falla, vuelve atrás y ofrece reintentar. */
  const cambiar = (id: string, campo: keyof Categoria, valor: unknown) => {
    const previa = l.categorias.find((c) => c.id === id);
    if (!previa || previa[campo] === valor) return;
    const aplicar = (v: unknown) => setL((x) => x && { ...x, categorias: x.categorias.map((c) => (c.id === id ? { ...c, [campo]: v } : c)) });
    aplicar(valor);
    setFallo(null);
    iniciar(async () => {
      const r = await actualizarCategoria(id, campo, valor);
      if (r.error) {
        aplicar(previa[campo]);
        setFallo({ texto: `No se guardó (${previa.nombre}): ${r.error}`, reintentar: () => cambiar(id, campo, valor) });
      }
    });
  };

  const configurar = (datos: { pct_nero?: number; comida?: boolean; parking?: boolean }) => {
    const previa = l;
    setL({ ...l, ...(datos.pct_nero !== undefined ? { pctNero: datos.pct_nero } : {}), ...(datos.comida !== undefined ? { comida: datos.comida } : {}), ...(datos.parking !== undefined ? { parking: datos.parking } : {}) });
    setFallo(null);
    iniciar(async () => {
      const r = await configurarLiquidacion(eventoId, datos);
      if (r.error) {
        setL(previa);
        setFallo({ texto: r.error });
      }
    });
  };

  const accion = (hacer: () => Promise<{ error?: string }>) =>
    iniciar(async () => {
      setFallo(null);
      const r = await hacer();
      if (r.error) setFallo({ texto: r.error });
    });

  const filas = (s: Seccion) => l.categorias.filter((c) => c.seccion === s);

  return (
    <details open className="tarjeta group p-0">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4">
        <h2 className="font-semibold">
          <span className="mr-1 inline-block transition group-open:rotate-90">▸</span> Entradas y liquidación Isidris
        </h2>
        <span className="text-sm text-stone-500">
          {cantidad(resumen.entradas.vendidas)} entradas · {formatoPesos(resumen.entradas.vendido)} · Isidris {formatoPesos(resumen.totalIsidris)}
        </span>
      </summary>

      <div className="space-y-5 border-t border-stone-200 p-4">
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <Reparto pctNero={l.pctNero} editable={editable && cambiaReparto} onCambiar={(n) => configurar({ pct_nero: n })} onFallo={setFallo} />
          {editable && (
            <>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={l.comida} onChange={(e) => configurar({ comida: e.target.checked })} /> Preventa comida
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={l.parking} onChange={(e) => configurar({ parking: e.target.checked })} /> Preventa parking
              </label>
            </>
          )}
          {pendiente && <span className="text-xs text-stone-500">Guardando…</span>}
        </div>

        {fallo && (
          <p className="alerta-error flex flex-wrap items-center gap-3">
            {fallo.texto}
            {fallo.reintentar && (
              <button type="button" onClick={fallo.reintentar} className="boton-secundario py-1 text-xs">Reintentar</button>
            )}
          </p>
        )}

        <Resumen resumen={resumen} comida={l.comida} parking={l.parking} />

        <TablaEntradas filas={filas("entradas")} pctNero={l.pctNero} totales={resumen.entradas} editable={editable} cambiar={cambiar} accion={accion} eventoId={eventoId} />
        {l.comida && <TablaSimple seccion="comida" filas={filas("comida")} totales={resumen.comida} editable={editable} cambiar={cambiar} accion={accion} eventoId={eventoId} />}
        {l.parking && <TablaSimple seccion="parking" filas={filas("parking")} totales={resumen.parking} editable={editable} cambiar={cambiar} accion={accion} eventoId={eventoId} />}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
          <p>Es una liquidación (cuánto le corresponde a cada uno): no crea ingresos ni pagos en Financiero ni cambia la rentabilidad del evento.</p>
          {editable && (
            <button
              type="button"
              className="text-red-700 hover:underline"
              onClick={() => {
                if (confirm("¿Quitar la sección de este evento?")) accion(() => quitarLiquidacion(eventoId));
              }}
            >
              Quitar la sección
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

function Reparto({ pctNero, editable, onCambiar, onFallo }: { pctNero: number; editable: boolean; onCambiar: (n: number) => void; onFallo: (f: Fallo) => void }) {
  // Lo que se está escribiendo (null = se muestra el valor guardado).
  const [borrador, setBorrador] = useState<string | null>(null);
  const texto = borrador ?? String(pctNero).replace(".", ",");
  const setTexto = setBorrador;
  const isidris = Math.round((100 - pctNero) * 100) / 100;
  if (!editable) {
    return (
      <p>
        Reparto: <span className="font-semibold">Nero {String(pctNero).replace(".", ",")}%</span> / <span className="font-semibold">Isidris {String(isidris).replace(".", ",")}%</span>
      </p>
    );
  }
  return (
    <div className="flex items-end gap-2">
      <div>
        <label htmlFor="pct-nero" className="etiqueta text-xs">% Nero</label>
        <input
          id="pct-nero"
          inputMode="decimal"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => {
            const n = leerNumero(texto);
            setBorrador(null);
            if (n === null || Number.isNaN(n) || n < 0 || n > 100) onFallo({ texto: "El porcentaje va de 0 a 100" });
            else if (n !== pctNero) onCambiar(n);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="campo w-20 py-1 text-right"
        />
      </div>
      <p className="pb-1.5">/ Isidris {String(isidris).replace(".", ",")}% (suman 100%)</p>
    </div>
  );
}

function Resumen({ resumen: r, comida, parking }: { resumen: ReturnType<typeof resumir>; comida: boolean; parking: boolean }) {
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra titulo="Entradas vendidas" valor={formatoPesos(r.entradas.vendido)} detalle={`${cantidad(r.entradas.vendidas)} entradas`} />
        <Cifra titulo="Liquidar a Nero" valor={formatoPesos(r.entradas.liquidarNero)} detalle="Por entradas" />
        <Cifra
          titulo="Total Isidris"
          valor={formatoPesos(r.totalIsidris)}
          detalle={[`Entradas ${formatoPesos(r.entradas.liquidarIsidris)}`, comida && `comida ${formatoPesos(r.comida.vendido)}`, parking && `parking ${formatoPesos(r.parking.vendido)}`].filter(Boolean).join(" + ")}
          destacado
        />
        <Cifra titulo="Total neto Isidris" valor={formatoPesos(r.netoIsidris)} detalle="Total Isidris ÷ 1,21 (sin IVA 21%). Es un cálculo, no un cobro ni un pago." />
      </div>
      {Math.abs(r.diferencia) >= 0.005 ? (
        <p className="alerta-error">Control: lo vendido en entradas no coincide con Nero + Isidris (diferencia {formatoPesos(r.diferencia)}).</p>
      ) : (
        <p className="text-xs text-green-800">✓ Control: vendido en entradas − (Nero + Isidris) = {formatoPesos(0)}</p>
      )}
    </div>
  );
}

function Cifra({ titulo, valor, detalle, destacado = false }: { titulo: string; valor: string; detalle: string; destacado?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${destacado ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-stone-50"}`}>
      <p className={`text-xs uppercase tracking-wide ${destacado ? "text-stone-300" : "text-stone-500"}`}>{titulo}</p>
      <p className="mt-1 font-mono text-lg font-semibold">{valor}</p>
      <p className={`mt-1 text-xs ${destacado ? "text-stone-300" : "text-stone-500"}`}>{detalle}</p>
    </div>
  );
}

type Cambiar = (id: string, campo: keyof Categoria, valor: unknown) => void;
type Accion = (hacer: () => Promise<{ error?: string }>) => void;

/** Celda numérica: se ve con formato y se edita como número; guarda al salir o con Enter. */
function CeldaNumero({
  valor,
  onGuardar,
  editable,
  entero = false,
  opcional = false,
  ancho = "w-24",
  etiqueta,
}: {
  valor: number | null;
  onGuardar: (n: number | null) => void;
  editable: boolean;
  entero?: boolean;
  opcional?: boolean;
  ancho?: string;
  etiqueta: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const mostrar = valor === null ? "" : entero ? cantidad(valor) : valor.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  if (!editable) return <span className="font-mono">{valor === null ? "—" : mostrar}</span>;
  const invalido = texto !== null && (() => {
    const n = leerNumero(texto);
    return n === null ? !opcional : Number.isNaN(n) || n < 0 || (entero && !Number.isInteger(n));
  })();
  return (
    <input
      aria-label={etiqueta}
      inputMode={entero ? "numeric" : "decimal"}
      value={texto ?? mostrar}
      onFocus={() => setTexto(valor === null ? "" : String(valor).replace(".", ","))}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        if (texto !== null && !invalido) {
          const n = leerNumero(texto);
          onGuardar(n === null ? (opcional ? null : 0) : n);
        }
        setTexto(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setTexto(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={`${ancho} rounded border bg-white px-1.5 py-1 text-right font-mono text-sm focus:outline-none ${invalido ? "border-red-500" : "border-stone-200 focus:border-stone-500"}`}
    />
  );
}

function CeldaNombre({ c, editable, cambiar }: { c: Categoria; editable: boolean; cambiar: Cambiar }) {
  const [texto, setTexto] = useState<string | null>(null);
  if (!editable) return <span className="font-medium">{c.nombre}</span>;
  return (
    <input
      aria-label="Nombre"
      value={texto ?? c.nombre}
      maxLength={80}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        if (texto !== null && texto.trim() && texto.trim() !== c.nombre) cambiar(c.id, "nombre", texto.trim());
        setTexto(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      title={c.nombre}
      className="w-56 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium hover:border-stone-200 focus:border-stone-500 focus:outline-none"
    />
  );
}

/** Suma (o resta, con signo menos) paquetes a lo ya cargado, sin pisar lo que haya cargado otro. */
function Sumar({ c, accion }: { c: Categoria; accion: Accion }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} title="Sumar ventas nuevas a lo ya cargado" className="rounded border border-stone-200 px-1.5 py-0.5 text-xs text-stone-600 hover:bg-stone-100">
        + sumar
      </button>
    );
  }
  const enviar = () => {
    const n = Number(texto.trim());
    if (Number.isInteger(n) && n !== 0) accion(() => sumarCantidad(c.id, n));
    setTexto("");
    setAbierto(false);
  };
  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        aria-label="Paquetes a sumar"
        inputMode="numeric"
        placeholder="+10"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") enviar();
          if (e.key === "Escape") setAbierto(false);
        }}
        className="w-16 rounded border border-stone-300 px-1.5 py-0.5 text-right font-mono text-xs"
      />
      <button type="button" onClick={enviar} className="rounded bg-stone-900 px-1.5 py-0.5 text-xs text-white">OK</button>
    </span>
  );
}

function AccionesFila({ c, editable, cambiar, accion }: { c: Categoria; editable: boolean; cambiar: Cambiar; accion: Accion }) {
  if (!editable) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 whitespace-nowrap">
      {c.activa && <Sumar c={c} accion={accion} />}
      {c.cantidad === 0 ? (
        <button
          type="button"
          onClick={() => confirm(`¿Borrar "${c.nombre}"?`) && accion(() => borrarCategoria(c.id))}
          className="text-xs text-red-700 hover:underline"
        >
          Borrar
        </button>
      ) : (
        <button type="button" onClick={() => cambiar(c.id, "activa", !c.activa)} className="text-xs text-stone-500 hover:underline">
          {c.activa ? "Desactivar" : "Reactivar"}
        </button>
      )}
    </span>
  );
}

function Agregar({ eventoId, seccion, accion, ejemplo }: { eventoId: string; seccion: Seccion; accion: Accion; ejemplo: string }) {
  const [nombre, setNombre] = useState("");
  const agregar = () => {
    const n = nombre.trim();
    if (!n) return;
    accion(() => agregarCategoria(eventoId, seccion, n));
    setNombre("");
  };
  return (
    <div className="flex flex-wrap gap-2">
      <input
        aria-label={`Nueva categoría de ${NOMBRE_SECCION[seccion].toLowerCase()}`}
        placeholder={`Nueva categoría (ej. ${ejemplo})`}
        value={nombre}
        maxLength={80}
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && agregar()}
        className="campo max-w-xs py-1"
      />
      <button type="button" onClick={agregar} className="boton-secundario py-1">+ Agregar</button>
    </div>
  );
}

const th = "px-2 py-2 text-right font-medium";
const td = "whitespace-nowrap px-2 py-1.5 text-right font-mono";

function TablaEntradas({
  filas,
  pctNero,
  totales,
  editable,
  cambiar,
  accion,
  eventoId,
}: {
  filas: Categoria[];
  pctNero: number;
  totales: ReturnType<typeof resumir>["entradas"];
  editable: boolean;
  cambiar: Cambiar;
  accion: Accion;
  eventoId: string;
}) {
  const pctIsidris = Math.round((100 - pctNero) * 100) / 100;
  const pct = (n: number) => String(n).replace(".", ",");
  const excedidas = filas.filter((c) => calcularEntrada(c, pctNero).costosExcedidos);
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">Entradas</h3>
      <p className="text-xs text-stone-500">
        El valor es por entrada. Si se venden paquetes (VIP x2, mesa x5), cargá los paquetes en «Paquetes» y en «×» cuántas entradas trae cada uno: «Entradas» muestra el total equivalente. Las invitaciones van con valor $0.
      </p>
      {excedidas.length > 0 && (
        <p className="alerta-error">Corona + degus + gastro superan el valor de la entrada en: {excedidas.map((c) => c.nombre).join(", ")}.</p>
      )}
      <div className="overflow-x-auto rounded-lg border border-stone-200">
        <table className="w-full min-w-[1700px] text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Entrada</th>
              <th className={th}>Valor</th>
              <th className={th}>Stock</th>
              <th className={th}>Paquetes</th>
              <th className={th}>×</th>
              <th className={th}>Entradas</th>
              <th className={th}>Vendido</th>
              <th className={th}>Proyección</th>
              <th className={th}>Corona</th>
              <th className={th}>Degus</th>
              <th className={th}>Gastro</th>
              <th className={th}>Sin costos</th>
              <th className={th}>Nero {pct(pctNero)}%</th>
              <th className={th}>Isidris {pct(pctIsidris)}%</th>
              <th className={th}>Nero final</th>
              <th className={th}>Isidris final</th>
              <th className={th}>Liquidar Nero</th>
              <th className={th}>Liquidar Isidris</th>
              {editable && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filas.length === 0 && (
              <tr>
                <td colSpan={19} className="px-2 py-6 text-center text-stone-500">Todavía no hay categorías de entradas.</td>
              </tr>
            )}
            {filas.map((c) => {
              const r = calcularEntrada(c, pctNero);
              const editaFila = editable && c.activa;
              return (
                <tr key={c.id} className={`${!c.activa ? "bg-stone-50 text-stone-400" : ""} ${r.costosExcedidos ? "bg-red-50" : ""}`}>
                  <td className="px-2 py-1.5">
                    <CeldaNombre c={c} editable={editaFila} cambiar={cambiar} />
                    {!c.activa && <span className="ml-1 text-[10px] uppercase">desactivada</span>}
                  </td>
                  <td className={td}><CeldaNumero etiqueta="Valor" valor={c.valor} editable={editaFila} onGuardar={(n) => cambiar(c.id, "valor", n)} /></td>
                  <td className={td}><CeldaNumero etiqueta="Stock" valor={c.stock} editable={editaFila} entero opcional ancho="w-16" onGuardar={(n) => cambiar(c.id, "stock", n)} /></td>
                  <td className={td}><CeldaNumero etiqueta="Paquetes vendidos" valor={c.cantidad} editable={editaFila} entero ancho="w-16" onGuardar={(n) => cambiar(c.id, "cantidad", n)} /></td>
                  <td className={td}><CeldaNumero etiqueta="Entradas por paquete" valor={c.multiplicador} editable={editaFila} entero ancho="w-12" onGuardar={(n) => cambiar(c.id, "multiplicador", n)} /></td>
                  <td className={`${td} font-semibold`}>{cantidad(r.vendidas)}</td>
                  <td className={td}>{formatoPesos(r.vendido)}</td>
                  <td className={td}>{r.proyeccion === null ? "—" : formatoPesos(r.proyeccion)}</td>
                  <td className={td}><CeldaNumero etiqueta="Corona" valor={c.corona} editable={editaFila} ancho="w-20" onGuardar={(n) => cambiar(c.id, "corona", n)} /></td>
                  <td className={td}><CeldaNumero etiqueta="Degus" valor={c.degus} editable={editaFila} ancho="w-20" onGuardar={(n) => cambiar(c.id, "degus", n)} /></td>
                  <td className={td}><CeldaNumero etiqueta="Gastro" valor={c.gastro} editable={editaFila} ancho="w-20" onGuardar={(n) => cambiar(c.id, "gastro", n)} /></td>
                  <td className={`${td} ${r.costosExcedidos ? "text-red-700" : ""}`}>{formatoPesos(r.base)}</td>
                  <td className={td}>{formatoPesos(r.nero)}</td>
                  <td className={td}>{formatoPesos(r.isidris)}</td>
                  <td className={td}>{formatoPesos(r.neroFinal)}</td>
                  <td className={td}>{formatoPesos(r.isidrisFinal)}</td>
                  <td className={`${td} font-semibold`}>{formatoPesos(r.liquidarNero)}</td>
                  <td className={`${td} font-semibold`}>{formatoPesos(r.liquidarIsidris)}</td>
                  {editable && (
                    <td className="px-2 py-1.5 text-right">
                      <AccionesFila c={c} editable={editable} cambiar={cambiar} accion={accion} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-stone-200 bg-stone-50 font-semibold">
            <tr>
              <td className="px-2 py-2">Total</td>
              <td />
              <td className={td}>{totales.stock === null ? "—" : cantidad(totales.stock)}</td>
              <td />
              <td />
              <td className={td}>{cantidad(totales.vendidas)}</td>
              <td className={td}>{formatoPesos(totales.vendido)}</td>
              <td className={td}>{formatoPesos(totales.proyeccion)}</td>
              <td colSpan={8} />
              <td className={td}>{formatoPesos(totales.liquidarNero)}</td>
              <td className={td}>{formatoPesos(totales.liquidarIsidris)}</td>
              {editable && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      {editable && <Agregar eventoId={eventoId} seccion="entradas" accion={accion} ejemplo="Preventa Corona" />}
    </section>
  );
}

function TablaSimple({
  seccion,
  filas,
  totales,
  editable,
  cambiar,
  accion,
  eventoId,
}: {
  seccion: "comida" | "parking";
  filas: Categoria[];
  totales: ReturnType<typeof resumir>["comida"];
  editable: boolean;
  cambiar: Cambiar;
  accion: Accion;
  eventoId: string;
}) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">{NOMBRE_SECCION[seccion]}</h3>
      <p className="text-xs text-stone-500">Todo lo vendido va entero a Isidris (sin reparto).</p>
      <div className="overflow-x-auto rounded-lg border border-stone-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Categoría</th>
              <th className={th}>Valor</th>
              <th className={th}>Stock</th>
              <th className={th}>Real</th>
              <th className={th}>Vendido</th>
              <th className={th}>Proyección</th>
              {editable && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-stone-500">Todavía no hay categorías.</td>
              </tr>
            )}
            {filas.map((c) => {
              const editaFila = editable && c.activa;
              return (
                <tr key={c.id} className={!c.activa ? "bg-stone-50 text-stone-400" : ""}>
                  <td className="px-2 py-1.5">
                    <CeldaNombre c={c} editable={editaFila} cambiar={cambiar} />
                    {!c.activa && <span className="ml-1 text-[10px] uppercase">desactivada</span>}
                  </td>
                  <td className={td}><CeldaNumero etiqueta="Valor" valor={c.valor} editable={editaFila} onGuardar={(n) => cambiar(c.id, "valor", n)} /></td>
                  <td className={td}><CeldaNumero etiqueta="Stock" valor={c.stock} editable={editaFila} entero opcional ancho="w-16" onGuardar={(n) => cambiar(c.id, "stock", n)} /></td>
                  <td className={td}><CeldaNumero etiqueta="Cantidad vendida" valor={c.cantidad} editable={editaFila} entero ancho="w-16" onGuardar={(n) => cambiar(c.id, "cantidad", n)} /></td>
                  <td className={td}>{formatoPesos(c.valor * c.cantidad)}</td>
                  <td className={td}>{c.stock === null ? "—" : formatoPesos(c.valor * c.stock)}</td>
                  {editable && (
                    <td className="px-2 py-1.5 text-right">
                      <AccionesFila c={c} editable={editable} cambiar={cambiar} accion={accion} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-stone-200 bg-stone-50 font-semibold">
            <tr>
              <td className="px-2 py-2">Total</td>
              <td />
              <td className={td}>{totales.stock === null ? "—" : cantidad(totales.stock)}</td>
              <td className={td}>{cantidad(totales.vendidas)}</td>
              <td className={td}>{formatoPesos(totales.vendido)}</td>
              <td className={td}>{formatoPesos(totales.proyeccion)}</td>
              {editable && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      {editable && <Agregar eventoId={eventoId} seccion={seccion} accion={accion} ejemplo={seccion === "parking" ? "Parking anticipado" : "Menú degustación"} />}
    </section>
  );
}
