import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerComprobante } from "@/lib/facturar/consultas";
import { datosEmisor } from "@/lib/facturar/emisor";
import { qrSvg, urlQrArca } from "@/lib/facturar/qr";
import { CONDICIONES_IVA, nombreTipoCbte, numeroComprobante, type Comprobante } from "@/lib/facturar/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { ComprobanteVista } from "@/components/comprobante-vista";
import { SinAcceso } from "../../sin-acceso";
import { EnviarMail } from "./enviar-mail";

export default async function PaginaComprobante({ params, searchParams }: PageProps<"/facturar/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturar", "ver")) return <SinAcceso />;

  const { id } = await params;
  const c = await obtenerComprobante(id);
  if (!c) notFound();
  const { mail } = await searchParams;
  const puedeEditar = puede(usuario, "facturar", "editar");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/facturar" className="text-sm text-stone-500 hover:text-stone-900">← Facturar</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">
              {nombreTipoCbte(c.tipo_cbte)} {c.numero ? numeroComprobante(c) : ""}
            </h1>
            {c.entorno === "homologacion" ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">PRUEBA · SIN VALIDEZ FISCAL</span>
            ) : (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">REAL</span>
            )}
          </div>
          {c.estado === "emitido" && (
            <a href={`/imprimir/factura/${c.id}`} target="_blank" rel="noreferrer" className="boton">
              Descargar PDF / Imprimir
            </a>
          )}
        </div>
      </div>

      {mail === "enviado" && c.mail_enviado_a && (
        <p className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">Factura enviada por mail a {c.mail_enviado_a}.</p>
      )}
      {mail === "error" && (
        <p className="alerta-error">La factura se emitió bien, pero no se pudo mandar el mail. Probá de nuevo con “Enviar por mail”.</p>
      )}

      {c.estado === "emitido" ? <Emitido c={c} puedeEditar={puedeEditar} /> : <Rechazado c={c} />}
    </div>
  );
}

/** Factura emitida: se muestra el comprobante tal cual queda en el PDF. */
async function Emitido({ c, puedeEditar }: { c: Comprobante; puedeEditar: boolean }) {
  const emisor = datosEmisor(c.entorno);
  const svg = await qrSvg(urlQrArca(c, emisor.cuit));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_18rem]">
      <div className="tarjeta overflow-x-auto p-0">
        <div className="min-w-[640px]">
          <ComprobanteVista c={c} emisor={emisor} qrSvg={svg} />
        </div>
      </div>

      <aside className="space-y-3 text-sm">
        <div className="tarjeta space-y-2 p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">Mail al cliente</p>
          {c.mail_enviado_a && c.mail_enviado_en ? (
            <p>
              Enviada a <span className="font-medium">{c.mail_enviado_a}</span> el {formatoFecha(c.mail_enviado_en.slice(0, 10))}.
            </p>
          ) : (
            <p className="text-stone-500">Todavía no se envió.</p>
          )}
          {puedeEditar && <EnviarMail id={c.id} emailSugerido={c.mail_enviado_a ?? c.cliente?.email ?? ""} yaEnviada={Boolean(c.mail_enviado_a)} />}
        </div>
        {c.evento && (
          <div className="tarjeta p-4">
            <p className="text-xs uppercase tracking-wide text-stone-500">Evento</p>
            <Link href={`/eventos/${c.evento.id}`} className="font-medium underline">{c.evento.nombre}</Link>
          </div>
        )}
        <div className="tarjeta p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">Financiero</p>
          {c.transaccion_id ? (
            <p>
              Registrada como ingreso pendiente de cobro.{" "}
              <Link href={`/financiero?desde=${c.fecha}&hasta=${c.fecha}`} className="underline">Ver</Link>
            </p>
          ) : (
            <p className="text-stone-500">No se registró ingreso en Financiero.</p>
          )}
        </div>
        {c.mensajes && c.mensajes.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <p className="mb-1 font-medium">Observaciones de ARCA</p>
            <ul className="list-disc pl-4">
              {c.mensajes.map((m) => (
                <li key={m.codigo + m.mensaje}>{m.codigo}: {m.mensaje}</li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

/** Factura rechazada: no hay comprobante; lo importante es por qué la rechazó ARCA. */
function Rechazado({ c }: { c: Comprobante }) {
  return (
    <div className="max-w-3xl space-y-4">
      <div className="alerta-error">
        <p className="font-medium">ARCA rechazó esta factura</p>
        {c.mensajes && (
          <ul className="mt-1 list-disc pl-5">
            {c.mensajes.map((m) => (
              <li key={m.codigo + m.mensaje}>{m.codigo}: {m.mensaje}</li>
            ))}
          </ul>
        )}
      </div>
      <dl className="tarjeta grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-stone-500">Fecha</dt>
        <dd>{formatoFecha(c.fecha)}</dd>
        <dt className="text-stone-500">Cliente</dt>
        <dd>{c.receptor_nombre ?? (c.doc_tipo === 99 ? "Consumidor final" : c.doc_nro)}</dd>
        <dt className="text-stone-500">Condición IVA</dt>
        <dd>{CONDICIONES_IVA.find((x) => x.id === c.condicion_iva_receptor)?.nombre ?? "—"}</dd>
        <dt className="text-stone-500">Total</dt>
        <dd className="font-mono">{formatoPesos(c.total)}</dd>
      </dl>
    </div>
  );
}
