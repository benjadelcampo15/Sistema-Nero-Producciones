import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerCliente } from "@/lib/clientes/consultas";
import { formatoDocumento } from "@/lib/cuit";
import { EMPRESAS, leerEmpresa } from "@/lib/empresas";
import { SeccionCuentaCorriente } from "@/components/cuenta-corriente/seccion";
import { SinAcceso } from "../../../sin-acceso";

/** La cuenta corriente de un cliente: saldo, cobros y movimientos. */
export default async function PaginaCuentaCliente({ params, searchParams }: PageProps<"/facturar/cuentas/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturar", "ver")) return <SinAcceso />;
  const { id } = await params;
  const cliente = await obtenerCliente(id);
  if (!cliente) notFound();
  const empresa = cliente.empresa ?? leerEmpresa((await searchParams).empresa);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/facturar/cuentas?empresa=${empresa}`} className="text-sm text-stone-500 hover:text-stone-900">← Cuentas corrientes</Link>
        <h1 className="mt-1 text-2xl font-semibold">{cliente.razon_social}</h1>
        <p className="text-sm text-stone-500">
          <span className="font-mono">{formatoDocumento(cliente.doc_tipo, cliente.doc_nro)}</span> ·{" "}
          <Link href={`/facturar/clientes/${cliente.id}?empresa=${empresa}`} className="underline">Ver ficha</Link>
        </p>
      </div>
      <SeccionCuentaCorriente
        tipo="cobro"
        id={cliente.id}
        empresas={cliente.empresa ? [cliente.empresa] : EMPRESAS}
        empresa={empresa}
        href={(e) => `/facturar/cuentas/${cliente.id}?empresa=${e}`}
        editable={puede(usuario, "facturar", "editar") || puede(usuario, "financiero", "editar")}
      />
    </div>
  );
}
