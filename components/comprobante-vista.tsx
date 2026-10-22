import { ALICUOTAS, CONCEPTOS, CONDICIONES_IVA, TIPOS_CBTE, nombreTipoCbte, type Comprobante } from "@/lib/facturar/tipos";
import { formatoCuit, type DatosEmisor } from "@/lib/facturar/emisor";
import { formatoFecha, formatoPesos } from "@/lib/formato";

const CODIGO_CBTE: Record<number, string> = { 1: "01", 6: "06", 11: "11" };

/** Factura electrónica con el formato de ARCA (encabezado, letra, CAE y QR). Pensada para imprimir en A4. */
export function ComprobanteVista({ c, emisor, qrSvg }: { c: Comprobante; emisor: DatosEmisor; qrSvg: string }) {
  const clase = TIPOS_CBTE.find((t) => t.id === c.tipo_cbte)?.clase ?? "B";
  const discrimina = clase === "A";
  const porcentaje = (id: number | null) => ALICUOTAS.find((a) => a.id === id)?.porcentaje ?? 0;
  // En A los precios van sin IVA; en B, con IVA incluido; en C no hay IVA.
  const precioMostrado = (precio: number, alicuota: number | null) =>
    clase === "B" ? precio * (1 + porcentaje(alicuota) / 100) : precio;

  const ivaPorAlicuota = new Map<number, number>();
  for (const it of c.items) {
    if (it.alicuota === null) continue;
    ivaPorAlicuota.set(it.alicuota, (ivaPorAlicuota.get(it.alicuota) ?? 0) + (it.cantidad * it.precio * porcentaje(it.alicuota)) / 100);
  }
  const condicion = CONDICIONES_IVA.find((x) => x.id === c.condicion_iva_receptor)?.nombre ?? "—";
  const documento = c.doc_tipo === 80 ? `CUIT ${formatoCuit(c.doc_nro)}` : c.doc_tipo === 96 ? `DNI ${c.doc_nro}` : "Consumidor final";
  const numero = `${String(c.punto_venta).padStart(5, "0")}-${String(c.numero ?? 0).padStart(8, "0")}`;
  const prueba = c.entorno === "homologacion";

  return (
    <article className="relative mx-auto w-full max-w-[210mm] bg-white p-8 text-[13px] text-stone-900 print:p-0">
      {prueba && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-30 text-6xl font-black tracking-widest text-red-600/15">SIN VALIDEZ FISCAL</span>
        </div>
      )}

      {/* Encabezado */}
      <header className="grid grid-cols-[1fr_auto_1fr] border border-stone-900">
        <div className="space-y-0.5 p-4">
          <p className="text-lg font-bold leading-tight">{emisor.razonSocial}</p>
          {emisor.nombreFantasia && <p className="font-medium">{emisor.nombreFantasia}</p>}
          {emisor.domicilio && <p>{emisor.domicilio}</p>}
          <p>{emisor.condicionIva}</p>
        </div>
        <div className="flex flex-col items-center border-x border-stone-900 px-4 pt-2">
          <span className="border border-stone-900 px-4 text-4xl font-bold">{clase}</span>
          <span className="mt-1 text-[10px]">COD. {CODIGO_CBTE[c.tipo_cbte] ?? c.tipo_cbte}</span>
        </div>
        <div className="space-y-0.5 p-4 text-right">
          <p className="text-lg font-bold">{nombreTipoCbte(c.tipo_cbte).toUpperCase()}</p>
          <p className="text-xs font-semibold">ORIGINAL</p>
          <p>Punto de venta y número: <b>{numero}</b></p>
          <p>Fecha de emisión: <b>{formatoFecha(c.fecha)}</b></p>
          <p>CUIT: {formatoCuit(emisor.cuit)}</p>
          {emisor.ingresosBrutos && <p>Ingresos Brutos: {emisor.ingresosBrutos}</p>}
          {emisor.inicioActividades && <p>Inicio de actividades: {emisor.inicioActividades}</p>}
        </div>
      </header>

      {/* Período (servicios) */}
      {c.concepto !== 1 && c.fecha_servicio_desde && (
        <section className="flex flex-wrap justify-between gap-2 border-x border-b border-stone-900 px-4 py-2">
          <span>Período facturado desde: <b>{formatoFecha(c.fecha_servicio_desde)}</b></span>
          {c.fecha_servicio_hasta && <span>Hasta: <b>{formatoFecha(c.fecha_servicio_hasta)}</b></span>}
          {c.fecha_vto_pago && <span>Vencimiento del pago: <b>{formatoFecha(c.fecha_vto_pago)}</b></span>}
        </section>
      )}

      {/* Receptor */}
      <section className="grid gap-1 border-x border-b border-stone-900 px-4 py-2 sm:grid-cols-2">
        <p>{documento}</p>
        <p>Razón social: <b>{c.receptor_nombre ?? (c.doc_tipo === 99 ? "Consumidor final" : "—")}</b></p>
        <p>Condición frente al IVA: {condicion}</p>
        <p>Concepto: {CONCEPTOS.find((x) => x.id === c.concepto)?.nombre}</p>
      </section>

      {/* Ítems */}
      <table className="mt-4 w-full">
        <thead>
          <tr className="border-y border-stone-900 bg-stone-100 text-left text-xs">
            <th className="px-2 py-1.5">Descripción</th>
            <th className="px-2 py-1.5 text-right">Cant.</th>
            <th className="px-2 py-1.5 text-right">Precio unit.</th>
            {discrimina && <th className="px-2 py-1.5 text-right">Alíc. IVA</th>}
            <th className="px-2 py-1.5 text-right">{discrimina ? "Subtotal (sin IVA)" : "Subtotal"}</th>
          </tr>
        </thead>
        <tbody>
          {c.items.map((it, i) => (
            <tr key={i} className="border-b border-stone-200 align-top">
              <td className="px-2 py-1.5">{it.descripcion}</td>
              <td className="px-2 py-1.5 text-right">{it.cantidad}</td>
              <td className="px-2 py-1.5 text-right">{formatoPesos(precioMostrado(it.precio, it.alicuota))}</td>
              {discrimina && <td className="px-2 py-1.5 text-right">{porcentaje(it.alicuota)}%</td>}
              <td className="px-2 py-1.5 text-right">{formatoPesos(it.cantidad * precioMostrado(it.precio, it.alicuota))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totales */}
      <section className="ml-auto mt-4 w-72 space-y-1">
        {discrimina && (
          <>
            <Fila nombre="Importe neto gravado" valor={c.neto} />
            {[...ivaPorAlicuota.entries()].map(([id, importe]) => (
              <Fila key={id} nombre={`IVA ${String(porcentaje(id)).replace(".", ",")}%`} valor={importe} />
            ))}
            <Fila nombre="Importe otros tributos" valor={0} />
          </>
        )}
        <div className="flex justify-between border-t border-stone-900 pt-1 text-base font-bold">
          <span>Importe total</span>
          <span>{formatoPesos(c.total)}</span>
        </div>
        {clase === "B" && c.iva > 0 && (
          // Régimen de Transparencia Fiscal al Consumidor (Ley 27.743).
          <p className="text-right text-xs text-stone-600">IVA contenido: {formatoPesos(c.iva)}</p>
        )}
      </section>

      {/* CAE y QR */}
      <footer className="mt-8 flex items-center gap-6 border-t border-stone-900 pt-4">
        <div className="h-28 w-28 shrink-0" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <div className="space-y-1">
          <p className="text-base font-bold">Comprobante Autorizado</p>
          <p className="text-xs text-stone-600">Esta factura fue autorizada electrónicamente por ARCA.</p>
          <p>CAE N°: <b>{c.cae}</b></p>
          <p>Fecha de vencimiento del CAE: <b>{c.cae_vto ? formatoFecha(c.cae_vto) : "—"}</b></p>
          {prueba && <p className="font-semibold text-red-700">Comprobante de PRUEBA (homologación) – sin validez fiscal</p>}
        </div>
      </footer>
    </article>
  );
}

function Fila({ nombre, valor }: { nombre: string; valor: number }) {
  return (
    <div className="flex justify-between">
      <span>{nombre}</span>
      <span>{formatoPesos(valor)}</span>
    </div>
  );
}
