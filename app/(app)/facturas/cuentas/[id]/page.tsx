import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerProveedor } from "@/lib/facturas/consultas";
import { formatoDocumento } from "@/lib/cuit";
import { EMPRESAS, leerEmpresa } from "@/lib/empresas";
import { SeccionCuentaCorriente } from "@/components/cuenta-corriente/seccion";
import { SinAcceso } from "../../../sin-acceso";

/** La cuenta corriente de un proveedor: saldo, pagos y movimientos. */
export default async function PaginaCuentaProveedor({ params, searchParams }: PageProps<"/facturas/cuentas/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturas", "ver")) return <SinAcceso />;
  const { id } = await params;
  const proveedor = await obtenerProveedor(id);
  if (!proveedor) notFound();
  const empresa = proveedor.empresa ?? leerEmpresa((await searchParams).empresa);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/facturas/cuentas?empresa=${empresa}`} className="text-sm text-stone-500 hover:text-stone-900">← Cuentas corrientes</Link>
        <h1 className="mt-1 text-2xl font-semibold">{proveedor.razon_social}</h1>
        <p className="text-sm text-stone-500">
          <span className="font-mono">{proveedor.cuit ? formatoDocumento(80, proveedor.cuit) : "Sin CUIT"}</span> ·{" "}
          <Link href={`/facturas/proveedores/${proveedor.id}?empresa=${empresa}`} className="underline">Ver ficha</Link>
        </p>
      </div>
      <SeccionCuentaCorriente
        tipo="pago"
        id={proveedor.id}
        empresas={proveedor.empresa ? [proveedor.empresa] : EMPRESAS}
        empresa={empresa}
        href={(e) => `/facturas/cuentas/${proveedor.id}?empresa=${e}`}
        editable={puede(usuario, "facturas", "editar") || puede(usuario, "financiero", "editar")}
      />
    </div>
  );
}
