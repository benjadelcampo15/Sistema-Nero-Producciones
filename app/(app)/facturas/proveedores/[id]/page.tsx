import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { facturasDeCuit, obtenerProveedor, resumenFacturasPorProveedor } from "@/lib/facturas/consultas";
import { COLOR_ESTADO_FACTURA, NOMBRE_ESTADO_FACTURA } from "@/lib/facturas/tipos";
import { formatoDocumento } from "@/lib/cuit";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../../../sin-acceso";
import { BotonBorrarProveedor, FormularioProveedor } from "../formulario-proveedor";
import { SeccionCuentaCorriente } from "@/components/cuenta-corriente/seccion";
import { EMPRESAS, NOMBRE_EMPRESA, leerEmpresa } from "@/lib/empresas";

/** Ficha del proveedor: sus datos, lo facturado y sus facturas. */
export default async function PaginaFichaProveedor({ params, searchParams }: PageProps<"/facturas/proveedores/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturas", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "facturas", "editar");
  const { id } = await params;
  const proveedor = await obtenerProveedor(id);
  if (!proveedor) notFound();
  const [resumen, facturas] = await Promise.all([resumenFacturasPorProveedor(), proveedor.cuit ? facturasDeCuit(proveedor.cuit) : Promise.resolve([])]);
  const r = proveedor.cuit ? resumen.get(proveedor.cuit) : undefined;
  // Las empresas con las que trabaja; la cuenta corriente se ve de a una.
  const empresas = proveedor.empresa ? [proveedor.empresa] : EMPRESAS;
  const pedida = (await searchParams).empresa;
  const empresa = proveedor.empresa ?? leerEmpresa(pedida);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/facturas?empresa=${empresa}`} className="text-sm text-stone-500 hover:text-stone-900">← Proveedores</Link>
          <h1 className="mt-1 text-2xl font-semibold">{proveedor.razon_social}</h1>
          <p className="text-sm text-stone-500">
            <span className="font-mono">{proveedor.cuit ? formatoDocumento(80, proveedor.cuit) : "Sin CUIT"}</span>
            {proveedor.alias_cbu && <span className="font-mono"> · Alias {proveedor.alias_cbu}</span>}
            {" · "}
            {proveedor.empresa ? NOMBRE_EMPRESA[proveedor.empresa] : `${NOMBRE_EMPRESA.nero} y ${NOMBRE_EMPRESA.ruta}`}
          </p>
        </div>
        {editable && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <BotonBorrarProveedor id={proveedor.id} nombre={proveedor.razon_social} irA="/facturas" />
            <Link href="/facturas/lista" className="boton">Cargar factura</Link>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Cifra titulo="Este mes" valor={formatoPesos(r?.mes.total ?? 0)} detalle={`${r?.mes.cantidad ?? 0} facturas aprobadas`} />
        <Cifra titulo="Este año" valor={formatoPesos(r?.anio ?? 0)} />
        <Cifra titulo="Total aprobado" valor={formatoPesos(r?.total ?? 0)} detalle={r ? `${r.cantidad} facturas${r.ultima ? ` · última ${formatoFecha(r.ultima)}` : ""}` : "Sin facturas"} />
      </div>

      {/* Sin CUIT no se le vinculan facturas, pero se le pueden cargar deudas a mano. */}
      <SeccionCuentaCorriente
        tipo="pago"
        id={proveedor.id}
        empresas={empresas}
        empresa={empresa}
        href={(e) => `/facturas/proveedores/${proveedor.id}?empresa=${e}#cuenta`}
        editable={editable || puede(usuario, "financiero", "editar")}
      />

      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">Datos</h2>
        {editable ? (
          <FormularioProveedor proveedor={proveedor} />
        ) : (
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            {(
              [
                ["Contacto", proveedor.contacto],
                ["Teléfono", proveedor.telefono],
                ["Email", proveedor.email],
                ["Alias o CBU", proveedor.alias_cbu],
                ["Notas", proveedor.notas],
              ] as const
            ).map(([n, v]) => (
              <div key={n} className="contents">
                <dt className="text-stone-500">{n}</dt>
                <dd>{v ?? "—"}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Facturas</h2>
        <div className="tarjeta overflow-x-auto p-0">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Comprobante</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {facturas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-stone-500">{proveedor.cuit ? "Todavía no hay facturas de este proveedor." : "Cargale el CUIT para ver sus facturas."}</td>
                </tr>
              )}
              {facturas.map((f) => (
                <tr key={f.id} className="hover:bg-stone-50">
                  <td className="whitespace-nowrap px-4 py-2 text-stone-600">{f.fecha_emision ? formatoFecha(f.fecha_emision) : "—"}</td>
                  <td className="px-4 py-2">
                    <Link href={`/facturas/${f.id}`} className="font-medium underline decoration-stone-300 hover:decoration-stone-900">
                      {[f.tipo_comprobante, f.punto_venta && f.numero ? `${f.punto_venta}-${f.numero}` : f.numero].filter(Boolean).join(" ") || f.archivo_nombre}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{f.total !== null ? formatoPesos(f.total) : "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO_FACTURA[f.estado]}`}>{NOMBRE_ESTADO_FACTURA[f.estado]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{titulo}</p>
      <p className="mt-1 font-mono text-xl font-semibold">{valor}</p>
      {detalle && <p className="text-xs text-stone-500">{detalle}</p>}
    </div>
  );
}
