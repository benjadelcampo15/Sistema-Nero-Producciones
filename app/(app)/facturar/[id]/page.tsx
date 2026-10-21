import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerComprobante } from "@/lib/facturar/consultas";
import { ALICUOTAS, CONCEPTOS, CONDICIONES_IVA, nombreTipoCbte, numeroComprobante } from "@/lib/facturar/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../../sin-acceso";

export default async function PaginaComprobante({ params }: PageProps<"/facturar/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturar", "ver")) return <SinAcceso />;

  const { id } = await params;
  const c = await obtenerComprobante(id);
  if (!c) notFound();

  const emitido = c.estado === "emitido";
  const datos: [string, string][] = [
    ["Fecha", formatoFecha(c.fecha)],
    ["Concepto", CONCEPTOS.find((x) => x.id === c.concepto)?.nombre ?? String(c.concepto)],
    ["Cliente", c.receptor_nombre ?? (c.doc_tipo === 99 ? "Consumidor final" : "—")],
    ["Documento", c.doc_tipo === 99 ? "Sin identificar" : `${c.doc_tipo === 80 ? "CUIT" : "DNI"} ${c.doc_nro}`],
    ["Condición IVA", CONDICIONES_IVA.find((x) => x.id === c.condicion_iva_receptor)?.nombre ?? String(c.condicion_iva_receptor)],
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/facturar" className="text-sm text-stone-500 hover:text-stone-900">← Facturar</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">
            {nombreTipoCbte(c.tipo_cbte)} {c.numero ? numeroComprobante(c) : ""}
          </h1>
          {c.entorno === "homologacion" && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">PRUEBA · SIN VALIDEZ FISCAL</span>
          )}
        </div>
      </div>

      {emitido ? (
        <div className="tarjeta flex flex-wrap items-center gap-x-8 gap-y-2 border-green-200 bg-green-50">
          <div>
            <p className="text-xs uppercase tracking-wide text-green-800">CAE</p>
            <p className="font-mono text-xl font-semibold text-green-900">{c.cae}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-green-800">Vencimiento CAE</p>
            <p className="font-mono text-green-900">{c.cae_vto ? formatoFecha(c.cae_vto) : "—"}</p>
          </div>
        </div>
      ) : (
        <div className="alerta-error">
          <p className="font-medium">ARCA rechazó esta factura</p>
        </div>
      )}

      {c.mensajes && c.mensajes.length > 0 && (
        <ul className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {c.mensajes.map((m) => (
            <li key={m.codigo + m.mensaje}>{m.codigo}: {m.mensaje}</li>
          ))}
        </ul>
      )}

      <dl className="tarjeta grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {datos.map(([k, valor]) => (
          <div key={k} className="contents">
            <dt className="text-stone-500">{k}</dt>
            <dd className="font-medium">{valor}</dd>
          </div>
        ))}
        {c.evento && (
          <div className="contents">
            <dt className="text-stone-500">Evento</dt>
            <dd><Link href={`/eventos/${c.evento.id}`} className="font-medium underline">{c.evento.nombre}</Link></dd>
          </div>
        )}
      </dl>

      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2">Descripción</th>
              <th className="px-4 py-2 text-right">Cant.</th>
              <th className="px-4 py-2 text-right">Precio</th>
              {c.tipo_cbte !== 11 && <th className="px-4 py-2 text-right">IVA</th>}
              <th className="px-4 py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {c.items.map((it, i) => (
              <tr key={i}>
                <td className="px-4 py-2">{it.descripcion}</td>
                <td className="px-4 py-2 text-right font-mono">{it.cantidad}</td>
                <td className="px-4 py-2 text-right font-mono">{formatoPesos(it.precio)}</td>
                {c.tipo_cbte !== 11 && (
                  <td className="px-4 py-2 text-right">{ALICUOTAS.find((a) => a.id === it.alicuota)?.porcentaje}%</td>
                )}
                <td className="px-4 py-2 text-right font-mono">{formatoPesos(it.cantidad * it.precio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto max-w-xs space-y-1 border-t border-stone-200 px-4 py-3 text-sm">
          {c.tipo_cbte !== 11 && (
            <>
              <div className="flex justify-between"><dt className="text-stone-500">Neto</dt><dd className="font-mono">{formatoPesos(c.neto)}</dd></div>
              <div className="flex justify-between"><dt className="text-stone-500">IVA</dt><dd className="font-mono">{formatoPesos(c.iva)}</dd></div>
            </>
          )}
          <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="font-mono">{formatoPesos(c.total)}</dd></div>
        </dl>
      </div>

      {c.transaccion_id && (
        <p className="text-sm text-stone-600">
          Registrada como ingreso pendiente de cobro en{" "}
          <Link href={`/financiero?desde=${c.fecha}&hasta=${c.fecha}`} className="underline">Financiero</Link>.
        </p>
      )}
    </div>
  );
}
