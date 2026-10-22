"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { emitirFactura } from "@/lib/facturar/acciones";
import {
  ALICUOTAS,
  CONCEPTOS,
  CONDICIONES_IVA,
  TIPOS_CBTE,
  TIPOS_DOC,
  calcularTotales,
  type ClaseCbte,
} from "@/lib/facturar/tipos";
import type { Categoria, EventoResumido } from "@/lib/financiero/tipos";
import { formatoFecha, formatoPesos, hoy, parsearMonto } from "@/lib/formato";

type Item = { descripcion: string; cantidad: string; precio: string; alicuota: string };
const itemVacio = (): Item => ({ descripcion: "", cantidad: "1", precio: "", alicuota: "5" });

export function FormularioFactura({
  eventos,
  categorias,
  puedeRegistrarIngreso,
  realDisponible,
  puntoVenta,
  clientes,
}: {
  eventos: EventoResumido[];
  categorias: Categoria[];
  puedeRegistrarIngreso: boolean;
  /** Hay certificado de producción cargado: se pueden emitir facturas reales. */
  realDisponible: boolean;
  puntoVenta: { homologacion: number; produccion: number | null };
  clientes: { id: string; razon_social: string; doc_tipo: number; doc_nro: string; condicion_iva: number; email: string | null }[];
}) {
  const [estado, accion, enviando] = useActionState(emitirFactura, {});
  const v = (campo: string, inicial: string) => estado.valores?.[campo] ?? inicial;

  const [tipo, setTipo] = useState(Number(v("tipo_cbte", "6")));
  const [concepto, setConcepto] = useState(Number(v("concepto", "2")));
  const [docTipo, setDocTipo] = useState(Number(v("doc_tipo", "99")));
  const [clienteId, setClienteId] = useState(v("cliente_id", ""));
  const [docNro, setDocNro] = useState(v("doc_nro", ""));
  const [nombre, setNombre] = useState(v("receptor_nombre", ""));
  const [condicion, setCondicion] = useState(Number(v("condicion_iva_receptor", "5")));
  const [email, setEmail] = useState(v("email_cliente", ""));
  const [enviarMail, setEnviarMail] = useState(estado.valores ? estado.valores.enviar_mail === "on" : false);

  const elegirCliente = (id: string) => {
    setClienteId(id);
    const c = clientes.find((x) => x.id === id);
    if (!c) return;
    setDocTipo(c.doc_tipo);
    setDocNro(c.doc_tipo === 99 ? "" : c.doc_nro);
    setNombre(c.razon_social);
    setCondicion(c.condicion_iva);
    setEmail(c.email ?? "");
    setEnviarMail(Boolean(c.email));
    // Emisor Responsable Inscripto: A si el cliente puede recibir A (con CUIT), si no B.
    if (tipo !== 11) {
      const puedeA = c.doc_tipo === 80 && (CONDICIONES_IVA.find((x) => x.id === c.condicion_iva)?.clases as readonly string[] | undefined)?.includes("A");
      setTipo(puedeA ? 1 : 6);
    }
  };
  const [items, setItems] = useState<Item[]>([itemVacio()]);
  const [entorno, setEntorno] = useState<"homologacion" | "produccion">(
    v("entorno", "homologacion") === "produccion" && realDisponible ? "produccion" : "homologacion",
  );
  const real = entorno === "produccion";

  const clase = (TIPOS_CBTE.find((t) => t.id === tipo)?.clase ?? "B") as ClaseCbte;
  const condiciones = CONDICIONES_IVA.filter((c) => (c.clases as readonly string[]).includes(clase));
  // Si la condición elegida no corresponde a esta letra, se muestra la primera válida.
  const condicionMostrada = condiciones.some((c) => c.id === condicion) ? condicion : condiciones[0].id;
  const totales = calcularTotales(
    items
      .map((it) => ({
        descripcion: it.descripcion,
        cantidad: parsearMonto(it.cantidad) ?? 0,
        precio: parsearMonto(it.precio) ?? 0,
        alicuota: clase === "C" ? null : Number(it.alicuota),
      }))
      .filter((it) => it.cantidad > 0 && it.precio > 0),
    clase,
  );
  const cambiarItem = (i: number, cambio: Partial<Item>) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...cambio } : it)));

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (real && !window.confirm("Vas a emitir una factura REAL ante ARCA, con validez fiscal. No se puede borrar: para anularla hay que hacer una nota de crédito. ¿Emitir?")) {
          e.preventDefault();
        }
      }}
      className="max-w-4xl space-y-5"
    >
      <input type="hidden" name="entorno" value={entorno} />
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setEntorno("homologacion")}
          className={`rounded-md border px-4 py-3 text-left text-sm ${!real ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200" : "border-stone-300 bg-white"}`}
        >
          <span className="block font-semibold">Prueba</span>
          <span className="text-stone-600">Se autoriza en el entorno de pruebas de ARCA. Sin validez fiscal.</span>
        </button>
        <button
          type="button"
          disabled={!realDisponible}
          onClick={() => setEntorno("produccion")}
          className={`rounded-md border px-4 py-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${real ? "border-red-600 bg-red-50 ring-2 ring-red-200" : "border-stone-300 bg-white"}`}
        >
          <span className="block font-semibold">Real</span>
          <span className="text-stone-600">
            {realDisponible ? "Factura válida ante ARCA, con validez fiscal." : "Falta cargar el certificado de producción de ARCA."}
          </span>
        </button>
      </div>
      {real ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <span className="font-semibold">Factura REAL:</span> se informa a ARCA y tiene validez fiscal. No se puede borrar; para anularla hay que emitir una nota de crédito.
        </p>
      ) : (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-semibold">Prueba:</span> se autoriza en ARCA pero no tiene validez fiscal.
        </p>
      )}

      <fieldset className="tarjeta space-y-4">
        <legend className="px-1 font-semibold">Comprobante</legend>
        <div className="grid grid-cols-3 gap-2">
          {TIPOS_CBTE.map((t) => (
            <label
              key={t.id}
              className={`cursor-pointer rounded-md border px-3 py-2 text-center text-sm font-medium ${
                tipo === t.id ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-600"
              }`}
            >
              <input type="radio" name="tipo_cbte" value={t.id} checked={tipo === t.id} onChange={() => {
                  setTipo(t.id);
                  if (t.clase === "A") setDocTipo(80);
                }}
                className="sr-only"
              />
              {t.nombre}
            </label>
          ))}
        </div>
        <p className="text-xs text-stone-500">
          A: a Responsables Inscriptos y monotributistas · B: a consumidores finales y exentos · C: si el emisor es monotributista.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="punto_venta" className="etiqueta">Punto de venta</label>
            <input
              id="punto_venta"
              name="punto_venta"
              key={entorno}
              inputMode="numeric"
              required
              defaultValue={v("punto_venta", String((real ? puntoVenta.produccion : puntoVenta.homologacion) ?? ""))}
              // Las reales salen siempre por el punto de venta de la app.
              readOnly={real}
              className={real ? "campo bg-stone-100" : "campo"}
            />
          </div>
          <div>
            <label htmlFor="fecha" className="etiqueta">Fecha</label>
            <input id="fecha" name="fecha" type="date" required defaultValue={v("fecha", hoy())} className="campo" />
          </div>
          <div>
            <label htmlFor="concepto" className="etiqueta">Concepto</label>
            <select id="concepto" name="concepto" value={concepto} onChange={(e) => setConcepto(Number(e.target.value))} className="campo">
              {CONCEPTOS.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        {concepto !== 1 && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="fecha_servicio_desde" className="etiqueta">Servicio desde</label>
              <input id="fecha_servicio_desde" name="fecha_servicio_desde" type="date" required defaultValue={v("fecha_servicio_desde", hoy())} className="campo" />
            </div>
            <div>
              <label htmlFor="fecha_servicio_hasta" className="etiqueta">Servicio hasta</label>
              <input id="fecha_servicio_hasta" name="fecha_servicio_hasta" type="date" required defaultValue={v("fecha_servicio_hasta", hoy())} className="campo" />
            </div>
            <div>
              <label htmlFor="fecha_vto_pago" className="etiqueta">Vencimiento del pago</label>
              <input id="fecha_vto_pago" name="fecha_vto_pago" type="date" required defaultValue={v("fecha_vto_pago", hoy())} className="campo" />
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className="tarjeta space-y-4">
        <legend className="px-1 font-semibold">Cliente</legend>
        <input type="hidden" name="cliente_id" value={clienteId} />
        <div>
          <label htmlFor="cliente" className="etiqueta">Cliente guardado</label>
          <select id="cliente" value={clienteId} onChange={(e) => elegirCliente(e.target.value)} className="campo">
            <option value="">— Cliente nuevo u ocasional —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.razon_social}
                {c.doc_tipo !== 99 ? ` · ${c.doc_nro}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="doc_tipo" className="etiqueta">Documento</label>
            <select
              id="doc_tipo"
              name="doc_tipo"
              value={docTipo}
              onChange={(e) => {
                setDocTipo(Number(e.target.value));
                setClienteId("");
              }}
              className="campo"
            >
              {TIPOS_DOC.filter((d) => clase !== "A" || d.id === 80).map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          </div>
          {docTipo !== 99 && (
            <div>
              <label htmlFor="doc_nro" className="etiqueta">{docTipo === 80 ? "CUIT" : "DNI"}</label>
              <input
                id="doc_nro"
                name="doc_nro"
                inputMode="numeric"
                required
                value={docNro}
                onChange={(e) => {
                  setDocNro(e.target.value);
                  setClienteId("");
                }}
                className="campo font-mono"
              />
            </div>
          )}
          <div className={docTipo === 99 ? "sm:col-span-2" : ""}>
            <label htmlFor="receptor_nombre" className="etiqueta">
              Nombre / razón social <span className="font-normal text-stone-400">{docTipo === 99 ? "(opcional)" : ""}</span>
            </label>
            <input
              id="receptor_nombre"
              name="receptor_nombre"
              maxLength={200}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="campo"
            />
          </div>
        </div>
        <div>
          <label htmlFor="condicion_iva_receptor" className="etiqueta">Condición frente al IVA</label>
          <select
            id="condicion_iva_receptor"
            name="condicion_iva_receptor"
            value={condicionMostrada}
            onChange={(e) => setCondicion(Number(e.target.value))}
            className="campo"
          >
            {condiciones.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label htmlFor="email_cliente" className="etiqueta">
              Email del cliente <span className="font-normal text-stone-400">(opcional)</span>
            </label>
            <input
              id="email_cliente"
              name="email_cliente"
              type="email"
              maxLength={200}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (!email && e.target.value) setEnviarMail(true);
              }}
              className="campo"
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="enviar_mail" checked={enviarMail} onChange={(e) => setEnviarMail(e.target.checked)} />
            Enviarle la factura por mail
          </label>
        </div>
        {!clienteId && docTipo !== 99 && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="guardar_cliente" defaultChecked />
            Guardar como cliente para la próxima
          </label>
        )}
      </fieldset>

      <fieldset className="tarjeta space-y-3">
        <legend className="px-1 font-semibold">Ítems</legend>
        <input type="hidden" name="items" value={items.length} />
        {items.map((it, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_6rem_9rem_7rem_auto]">
            <input
              name={`item_descripcion_${i}`}
              value={it.descripcion}
              onChange={(e) => cambiarItem(i, { descripcion: e.target.value })}
              placeholder="Descripción"
              maxLength={200}
              className="campo"
            />
            <input
              name={`item_cantidad_${i}`}
              value={it.cantidad}
              onChange={(e) => cambiarItem(i, { cantidad: e.target.value })}
              inputMode="decimal"
              placeholder="Cant."
              className="campo text-right font-mono"
            />
            <input
              name={`item_precio_${i}`}
              value={it.precio}
              onChange={(e) => cambiarItem(i, { precio: e.target.value })}
              inputMode="decimal"
              placeholder={clase === "C" ? "Precio final" : "Precio sin IVA"}
              className="campo text-right font-mono"
            />
            {clase !== "C" ? (
              <select name={`item_alicuota_${i}`} value={it.alicuota} onChange={(e) => cambiarItem(i, { alicuota: e.target.value })} className="campo">
                {ALICUOTAS.map((a) => (
                  <option key={a.id} value={a.id}>IVA {String(a.porcentaje).replace(".", ",")}%</option>
                ))}
              </select>
            ) : (
              <span />
            )}
            <button
              type="button"
              disabled={items.length === 1}
              onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
              className="px-2 text-sm text-stone-400 hover:text-red-700 disabled:opacity-30"
              aria-label="Quitar ítem"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setItems((prev) => [...prev, itemVacio()])} className="text-sm text-stone-600 underline hover:text-stone-900">
          + Agregar ítem
        </button>

        <dl className="ml-auto max-w-xs space-y-1 border-t border-stone-200 pt-3 text-sm">
          {clase !== "C" && (
            <>
              <div className="flex justify-between"><dt className="text-stone-500">Neto</dt><dd className="font-mono">{formatoPesos(totales.neto)}</dd></div>
              {totales.alicuotas.map((a) => (
                <div key={a.id} className="flex justify-between">
                  <dt className="text-stone-500">IVA {String(ALICUOTAS.find((x) => x.id === a.id)?.porcentaje).replace(".", ",")}%</dt>
                  <dd className="font-mono">{formatoPesos(a.importe)}</dd>
                </div>
              ))}
            </>
          )}
          <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="font-mono">{formatoPesos(totales.total)}</dd></div>
        </dl>
      </fieldset>

      <fieldset className="tarjeta space-y-4">
        <legend className="px-1 font-semibold">En la app</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="evento_id" className="etiqueta">Evento <span className="font-normal text-stone-400">(opcional)</span></label>
            <select id="evento_id" name="evento_id" defaultValue={v("evento_id", "")} className="campo">
              <option value="">Sin evento</option>
              {eventos.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre} · {formatoFecha(e.fecha)}</option>
              ))}
            </select>
          </div>
          {puedeRegistrarIngreso && (
            <div>
              <label htmlFor="categoria_id" className="etiqueta">Categoría del ingreso</label>
              <select id="categoria_id" name="categoria_id" defaultValue={v("categoria_id", categorias[0]?.id ?? "")} className="campo">
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {puedeRegistrarIngreso && (
          <label className="flex items-center gap-2 text-sm">
            {/* En pruebas viene destildado para no mezclar facturas de prueba con los datos reales. */}
            <input type="checkbox" name="registrar_ingreso" key={entorno} defaultChecked={real} />
            Registrar el ingreso en Financiero (pendiente de cobro)
          </label>
        )}
      </fieldset>

      {estado.error && (
        <div className="alerta-error" role="alert">
          <p className="font-medium">{estado.error}</p>
          {estado.detalles && (
            <ul className="mt-1 list-disc pl-5">
              {estado.detalles.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={enviando || totales.total <= 0} className="boton">
          {enviando
            ? "Pidiendo CAE a ARCA…"
            : `Emitir ${TIPOS_CBTE.find((t) => t.id === tipo)?.nombre}${real ? " REAL" : " de prueba"} por ${formatoPesos(totales.total)}`}
        </button>
        <Link href="/facturar" className="text-sm text-stone-600 hover:text-stone-900">Cancelar</Link>
      </div>
    </form>
  );
}
