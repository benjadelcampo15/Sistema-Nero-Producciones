import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarComprobantes } from "@/lib/facturar/consultas";
import { nombreTipoCbte, numeroComprobante } from "@/lib/facturar/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../sin-acceso";
import { NavegacionFacturar } from "./navegacion";

export default async function PaginaFacturar() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturar", "ver")) return <SinAcceso />;

  const comprobantes = await listarComprobantes();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Facturar</h1>
        </div>
        {puede(usuario, "facturar", "editar") && (
          <Link href="/facturar/nueva" className="boton">+ Nueva factura</Link>
        )}
      </div>

      <NavegacionFacturar actual="/facturar" />

      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Comprobante</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {comprobantes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-stone-500">Todavía no se emitieron facturas.</td>
              </tr>
            )}
            {comprobantes.map((c) => (
              <tr key={c.id} className="hover:bg-stone-50">
                <td className="whitespace-nowrap px-4 py-3 text-stone-600">{formatoFecha(c.fecha)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <Link href={`/facturar/${c.id}`} className="font-medium underline decoration-stone-300 hover:decoration-stone-900">
                    {nombreTipoCbte(c.tipo_cbte)} {c.numero ? numeroComprobante(c) : ""}
                  </Link>
                  {c.entorno === "homologacion" ? (
                    <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">Prueba</span>
                  ) : (
                    <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-800">Real</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.receptor_nombre ?? (c.doc_tipo === 99 ? "Consumidor final" : c.doc_nro)}
                  {c.doc_tipo !== 99 && <span className="block text-xs text-stone-500">{c.doc_tipo === 80 ? "CUIT" : "DNI"} {c.doc_nro}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono">{formatoPesos(c.total)}</td>
                <td className="px-4 py-3">
                  {c.estado === "emitido" ? (
                    <>
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">CAE {c.cae}</span>
                      <a href={`/imprimir/factura/${c.id}`} target="_blank" rel="noreferrer" className="ml-2 text-xs font-medium underline">PDF</a>
                    </>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Rechazada</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
