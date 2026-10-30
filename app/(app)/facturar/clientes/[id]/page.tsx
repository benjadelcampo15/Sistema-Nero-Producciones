import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerCliente, resumenFacturacionPorCliente } from "@/lib/clientes/consultas";
import { listarComprobantes } from "@/lib/facturar/consultas";
import { CONDICIONES_IVA, nombreTipoCbte, numeroComprobante } from "@/lib/facturar/tipos";
import { formatoDocumento } from "@/lib/cuit";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { EtiquetaEmpresa } from "@/components/empresa";
import { SinAcceso } from "../../../sin-acceso";
import { BotonBorrarCliente } from "../../borrar";
import { BotonEstadoCliente, FormularioCliente } from "../formulario-cliente";
import { SeccionCuentaCorriente } from "@/components/cuenta-corriente/seccion";
import { EMPRESAS, NOMBRE_EMPRESA, leerEmpresa } from "@/lib/empresas";

/** Ficha del cliente: sus datos, lo facturado y sus comprobantes. */
export default async function PaginaFichaCliente({ params, searchParams }: PageProps<"/facturar/clientes/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturar", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "facturar", "editar");
  const { id } = await params;
  const [cliente, resumen, comprobantes] = await Promise.all([obtenerCliente(id), resumenFacturacionPorCliente(), listarComprobantes({ cliente: id })]);
  if (!cliente) notFound();
  const r = resumen.get(id);
  // Las empresas con las que trabaja; la cuenta corriente se ve de a una.
  const empresas = cliente.empresa ? [cliente.empresa] : EMPRESAS;
  const empresa = cliente.empresa ?? leerEmpresa((await searchParams).empresa);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/facturar?empresa=${empresa}`} className="text-sm text-stone-500 hover:text-stone-900">← Clientes</Link>
          <h1 className="mt-1 text-2xl font-semibold">{cliente.razon_social}</h1>
          <p className="text-sm text-stone-500">
            <span className="font-mono">{formatoDocumento(cliente.doc_tipo, cliente.doc_nro)}</span> · {CONDICIONES_IVA.find((x) => x.id === cliente.condicion_iva)?.nombre} ·{" "}
            {cliente.empresa ? NOMBRE_EMPRESA[cliente.empresa] : `${NOMBRE_EMPRESA.nero} y ${NOMBRE_EMPRESA.ruta}`}
            {!cliente.activo && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">Desactivado</span>}
          </p>
        </div>
        {editable && (
          <div className="flex flex-wrap items-center gap-3">
            <BotonEstadoCliente id={cliente.id} activo={cliente.activo} />
            {!r && <BotonBorrarCliente id={cliente.id} nombre={cliente.razon_social} irA="/facturar" />}
            {cliente.activo && <Link href={`/facturar/nueva?cliente=${cliente.id}`} className="boton">Facturar</Link>}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Cifra titulo="Este mes" valor={formatoPesos(r?.mes.total ?? 0)} detalle={`${r?.mes.cantidad ?? 0} comprobantes`} />
        <Cifra titulo="Este año" valor={formatoPesos(r?.anio ?? 0)} />
        <Cifra titulo="Total facturado" valor={formatoPesos(r?.total ?? 0)} detalle={r ? `${r.cantidad} comprobantes · última ${formatoFecha(r.ultima)}` : "Sin facturas"} />
      </div>

      <SeccionCuentaCorriente
        tipo="cobro"
        id={cliente.id}
        empresas={empresas}
        empresa={empresa}
        href={(e) => `/facturar/clientes/${cliente.id}?empresa=${e}#cuenta`}
        editable={editable || puede(usuario, "financiero", "editar")}
      />

      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">Datos</h2>
        {editable ? (
          <FormularioCliente cliente={cliente} />
        ) : (
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            {(
              [
                ["Email", cliente.email],
                ["Teléfono", cliente.telefono],
                ["Domicilio", cliente.domicilio],
                ["Notas", cliente.notas],
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
        <h2 className="font-semibold">Comprobantes</h2>
        <div className="tarjeta overflow-x-auto p-0">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Comprobante</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {comprobantes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-stone-500">Todavía no se le facturó.</td>
                </tr>
              )}
              {comprobantes.map((c) => (
                <tr key={c.id} className="hover:bg-stone-50">
                  <td className="whitespace-nowrap px-4 py-2 text-stone-600">{formatoFecha(c.fecha)}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <Link href={`/facturar/${c.id}`} className="font-medium underline decoration-stone-300 hover:decoration-stone-900">
                      {nombreTipoCbte(c.tipo_cbte)} {c.numero ? numeroComprobante(c) : ""}
                    </Link>
                    {c.entorno === "homologacion" && <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">Prueba</span>}
                    {c.estado !== "emitido" && <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-800">Rechazada</span>}
                  </td>
                  <td className="px-4 py-2"><EtiquetaEmpresa empresa={c.empresa} /></td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{formatoPesos(c.total)}</td>
                  <td className="px-4 py-2 text-right">
                    {c.estado === "emitido" && <a href={`/imprimir/factura/${c.id}`} target="_blank" rel="noreferrer" className="text-xs font-medium underline">PDF</a>}
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
