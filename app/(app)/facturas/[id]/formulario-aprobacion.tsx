"use client";

import { useActionState, useState } from "react";
import { aprobarFactura } from "@/lib/facturas/acciones";
import type { Factura } from "@/lib/facturas/tipos";
import {
  ESTADOS_MOVIMIENTO,
  MEDIOS_PAGO,
  NOMBRE_ESTADO_MOVIMIENTO,
  NOMBRE_MEDIO_PAGO,
  type Categoria,
  type EventoResumido,
  type TipoMovimiento,
} from "@/lib/financiero/tipos";
import { formatoFecha, hoy } from "@/lib/formato";
import type { Deposito, Producto } from "@/lib/stock/tipos";
import { SeccionStock, type ItemFactura } from "./seccion-stock";

type DatosIA = {
  emitida_por_nero?: boolean;
  es_compra_mercaderia?: boolean;
  categoria_sugerida?: string;
  descripcion?: string;
  items?: ItemFactura[];
};

const aTexto = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

export function FormularioAprobacion({
  factura,
  categorias,
  eventos,
  productos,
  depositos,
}: {
  factura: Factura;
  categorias: Categoria[];
  eventos: EventoResumido[];
  productos: Producto[];
  depositos: Deposito[];
}) {
  const [estado, accion, enviando] = useActionState(aprobarFactura.bind(null, factura.id), {});
  const ia = (factura.datos_ia ?? {}) as DatosIA;
  const v = (campo: string, inicial: string) => estado.valores?.[campo] ?? inicial;

  // Si Nero emitió la factura es un ingreso; si la recibió, un gasto.
  const [tipo, setTipo] = useState<TipoMovimiento>(ia.emitida_por_nero ? "ingreso" : "egreso");
  const delTipo = categorias.filter((c) => c.tipo === tipo);
  const sugerida = delTipo.find((c) => c.nombre === ia.categoria_sugerida)?.id ?? "";
  const contraparte = tipo === "egreso" ? factura.razon_social_emisor : factura.razon_social_receptor;
  const comprobante = [factura.tipo_comprobante, factura.punto_venta && factura.numero ? `${factura.punto_venta}-${factura.numero}` : null]
    .filter(Boolean)
    .join(" ");

  const campo = (nombre: string, etiqueta: string, inicial: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={nombre} className="etiqueta">{etiqueta}</label>
      <input id={nombre} name={nombre} defaultValue={v(nombre, inicial)} className="campo" {...props} />
    </div>
  );

  return (
    <form action={accion} className="space-y-4">
      {estado.error && <p className="alerta-error">{estado.error}</p>}

      <fieldset className="tarjeta space-y-3">
        <legend className="px-1 font-semibold">Datos del comprobante</legend>
        <p className="text-xs text-stone-500">Leídos por la IA: revisalos contra la factura antes de aprobar.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {campo("tipo_comprobante", "Tipo", factura.tipo_comprobante ?? "", { placeholder: "A, B, C…" })}
          {campo("punto_venta", "Punto de venta", factura.punto_venta ?? "", { inputMode: "numeric" })}
          {campo("numero", "Número", factura.numero ?? "", { inputMode: "numeric" })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {campo("razon_social_emisor", "Emisor", factura.razon_social_emisor ?? "")}
          {campo("cuit_emisor", "CUIT emisor", factura.cuit_emisor ?? "", { inputMode: "numeric" })}
          {campo("razon_social_receptor", "Receptor", factura.razon_social_receptor ?? "")}
          {campo("cuit_receptor", "CUIT receptor", factura.cuit_receptor ?? "", { inputMode: "numeric" })}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {campo("fecha_emision", "Fecha de emisión", factura.fecha_emision ?? hoy(), { type: "date", required: true })}
          {campo("neto", "Neto ($)", aTexto(factura.neto), { inputMode: "decimal", className: "campo text-right font-mono" })}
          {campo("iva", "IVA ($)", aTexto(factura.iva), { inputMode: "decimal", className: "campo text-right font-mono" })}
          {campo("total", "Total ($)", aTexto(factura.total), {
            inputMode: "decimal",
            required: true,
            className: "campo text-right font-mono font-semibold",
          })}
        </div>
      </fieldset>

      <fieldset className="tarjeta space-y-3">
        <legend className="px-1 font-semibold">Movimiento en Financiero</legend>

        <div className="grid grid-cols-2 gap-2">
          {(["egreso", "ingreso"] as const).map((t) => (
            <label
              key={t}
              className={`cursor-pointer rounded-md border px-3 py-2 text-center text-sm font-medium ${
                tipo === t
                  ? t === "ingreso"
                    ? "border-green-600 bg-green-50 text-green-800"
                    : "border-red-600 bg-red-50 text-red-800"
                  : "border-stone-300 bg-white text-stone-600"
              }`}
            >
              <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => setTipo(t)} className="sr-only" />
              {t === "ingreso" ? "Ingreso (la emitió Nero)" : "Egreso (la recibió Nero)"}
            </label>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {campo("descripcion", "Descripción", ia.descripcion || `Factura ${comprobante}`.trim(), { required: true, maxLength: 200 })}
          {/* key: al cambiar el tipo se recalcula el proveedor/cliente sugerido. */}
          <div key={`contraparte-${tipo}`}>
            <label htmlFor="contraparte" className="etiqueta">{tipo === "egreso" ? "Proveedor" : "Cliente"}</label>
            <input id="contraparte" name="contraparte" defaultValue={v("contraparte", contraparte ?? "")} className="campo" />
          </div>
          <div>
            <label htmlFor="categoria_id" className="etiqueta">Categoría</label>
            <select id="categoria_id" name="categoria_id" key={tipo} required defaultValue={v("categoria_id", sugerida)} className="campo">
              <option value="" disabled>Elegí…</option>
              {delTipo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.id === sugerida ? " (sugerida)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="evento_id" className="etiqueta">Evento</label>
            <select id="evento_id" name="evento_id" defaultValue={v("evento_id", "")} className="campo">
              <option value="">Sin evento (gasto general)</option>
              {eventos.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre} · {formatoFecha(e.fecha)}</option>
              ))}
            </select>
          </div>
          {campo("fecha", "Fecha del movimiento", factura.fecha_emision ?? hoy(), { type: "date", required: true })}
          <div>
            <label htmlFor="estado" className="etiqueta">Estado</label>
            <select id="estado" name="estado" defaultValue={v("estado", "pendiente")} className="campo">
              {ESTADOS_MOVIMIENTO.map((e) => (
                <option key={e} value={e}>
                  {NOMBRE_ESTADO_MOVIMIENTO[e]}
                  {e === "real" ? " (ya se pagó / cobró)" : e === "pendiente" ? " (falta pagar / cobrar)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="medio_pago" className="etiqueta">Medio de pago</label>
            <select id="medio_pago" name="medio_pago" defaultValue={v("medio_pago", "transferencia")} className="campo">
              {MEDIOS_PAGO.map((m) => (
                <option key={m} value={m}>{NOMBRE_MEDIO_PAGO[m]}</option>
              ))}
            </select>
          </div>
          {campo("notas", "Notas (opcional)", "", { maxLength: 500 })}
        </div>
      </fieldset>

      {tipo === "egreso" && depositos.length > 0 && (
        <SeccionStock
          items={ia.items ?? []}
          productos={productos}
          depositos={depositos}
          ingresaInicial={!!ia.es_compra_mercaderia}
        />
      )}

      <button type="submit" disabled={enviando} className="boton w-full">
        {enviando ? "Aprobando…" : "Aprobar y cargar en Financiero"}
      </button>
    </form>
  );
}
