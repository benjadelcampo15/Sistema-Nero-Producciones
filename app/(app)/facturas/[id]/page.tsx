import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import {
  obtenerFactura,
  obtenerMovimientoDeFactura,
  urlTemporalArchivo,
} from "@/lib/facturas/consultas";
import { obtenerCategorias, obtenerEventosResumidos } from "@/lib/financiero/consultas";
import { COLOR_ESTADO_FACTURA, NOMBRE_ESTADO_FACTURA } from "@/lib/facturas/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../../sin-acceso";
import { FormularioAprobacion } from "./formulario-aprobacion";
import { AccionesFactura } from "./acciones-factura";

export default async function PaginaFactura({ params }: PageProps<"/facturas/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturas", "ver")) return <SinAcceso />;

  const { id } = await params;
  const factura = await obtenerFactura(id);
  if (!factura) notFound();

  const editable = puede(usuario, "facturas", "editar");
  const revisable = editable && (factura.estado === "por_revisar" || factura.estado === "error");
  const [url, movimiento, categorias, eventos] = await Promise.all([
    urlTemporalArchivo(factura.archivo_path),
    factura.estado === "aprobada" ? obtenerMovimientoDeFactura(factura.id) : null,
    revisable ? obtenerCategorias() : [],
    revisable ? obtenerEventosResumidos() : [],
  ]);

  const ia = factura.datos_ia as { confianza?: string; observaciones?: string } | null;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/facturas" className="text-sm text-stone-500 hover:text-stone-900">← Facturas</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{factura.razon_social_emisor ?? factura.archivo_nombre}</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO_FACTURA[factura.estado]}`}>
            {NOMBRE_ESTADO_FACTURA[factura.estado]}
          </span>
        </div>
        <p className="text-sm text-stone-500">
          {factura.archivo_nombre}
          {factura.proveedor_ia && ` · leída con ${factura.proveedor_ia}`}
        </p>
      </div>

      {factura.estado === "error" && (
        <p className="alerta-error">La IA no pudo leer la factura: {factura.error}. Podés reintentar o cargar los datos a mano.</p>
      )}
      {factura.duplicada_de && factura.estado === "por_revisar" && (
        <p className="alerta-error">
          Ya hay otra factura con el mismo CUIT, punto de venta y número.{" "}
          <Link href={`/facturas/${factura.duplicada_de}`} className="font-medium underline">Ver la otra</Link>
        </p>
      )}
      {ia?.observaciones && factura.estado === "por_revisar" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">La IA advierte{ia.confianza ? ` (confianza ${ia.confianza})` : ""}:</span>{" "}
          {ia.observaciones}
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="tarjeta overflow-hidden p-0">
          {url ? (
            factura.archivo_tipo === "application/pdf" ? (
              <iframe src={url} title="Factura" className="h-[75vh] w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- link temporal firmado, no optimizable
              <img src={url} alt="Factura" className="max-h-[75vh] w-full object-contain" />
            )
          ) : (
            <p className="p-6 text-sm text-stone-500">No se pudo cargar el archivo.</p>
          )}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="block border-t border-stone-200 px-4 py-2 text-sm text-stone-600 hover:text-stone-900">
              Abrir en otra pestaña ↗
            </a>
          )}
        </div>

        <div className="space-y-4">
          {revisable ? (
            <>
              <FormularioAprobacion factura={factura} categorias={categorias} eventos={eventos} />
              <AccionesFactura id={factura.id} puedeReintentar />
            </>
          ) : (
            <ResumenFactura factura={factura} movimiento={movimiento} />
          )}
        </div>
      </div>
    </div>
  );
}

function ResumenFactura({
  factura,
  movimiento,
}: {
  factura: NonNullable<Awaited<ReturnType<typeof obtenerFactura>>>;
  movimiento: Awaited<ReturnType<typeof obtenerMovimientoDeFactura>>;
}) {
  const filas: [string, string | null][] = [
    ["Comprobante", [factura.tipo_comprobante, factura.punto_venta && factura.numero ? `${factura.punto_venta}-${factura.numero}` : null].filter(Boolean).join(" ") || null],
    ["Fecha de emisión", factura.fecha_emision ? formatoFecha(factura.fecha_emision) : null],
    ["Emisor", [factura.razon_social_emisor, factura.cuit_emisor && `CUIT ${factura.cuit_emisor}`].filter(Boolean).join(" · ") || null],
    ["Receptor", [factura.razon_social_receptor, factura.cuit_receptor && `CUIT ${factura.cuit_receptor}`].filter(Boolean).join(" · ") || null],
    ["Neto", factura.neto !== null ? formatoPesos(factura.neto) : null],
    ["IVA", factura.iva !== null ? formatoPesos(factura.iva) : null],
    ["Total", factura.total !== null ? formatoPesos(factura.total) : null],
  ];
  return (
    <div className="tarjeta space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {filas.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-stone-500">{k}</dt>
            <dd className="font-medium">{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
      {movimiento && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">
          Cargada en Financiero: {movimiento.descripcion} ({formatoFecha(movimiento.fecha)}).{" "}
          <Link href={`/financiero?desde=${movimiento.fecha}&hasta=${movimiento.fecha}`} className="font-medium underline">
            Ver movimiento
          </Link>
        </p>
      )}
    </div>
  );
}
