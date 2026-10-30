import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarClientes } from "@/lib/clientes/consultas";
import { saldosPendientes } from "@/lib/cuentas/consultas";
import { formatoDocumento } from "@/lib/cuit";
import { leerEmpresa } from "@/lib/empresas";
import { ListaSaldos } from "@/components/cuenta-corriente/lista-saldos";
import { SinAcceso } from "../../sin-acceso";
import { NavegacionFacturar } from "../navegacion";

/** Cuentas corrientes de clientes: quién le debe a cada empresa y cuánto. */
export default async function PaginaCuentasClientes({ searchParams }: PageProps<"/facturar/cuentas">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturar", "ver")) return <SinAcceso />;
  const empresa = leerEmpresa((await searchParams).empresa);
  const [clientes, saldos] = await Promise.all([listarClientes({ incluirInactivos: true }), saldosPendientes("cobro", empresa)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <p className="text-sm text-stone-500">Lo que deben: facturas emitidas pendientes de cobro. Los cobros se registran en la ficha de cada uno.</p>
      </div>
      <NavegacionFacturar actual="/facturar/cuentas" />
      <ListaSaldos
        empresa={empresa}
        ruta="/facturar/cuentas"
        ficha="/facturar/clientes"
        texto="Nos deben"
        fichas={clientes.map((c) => ({ id: c.id, nombre: c.razon_social, documento: formatoDocumento(c.doc_tipo, c.doc_nro), saldo: saldos.get(c.id) ?? 0 }))}
      />
    </div>
  );
}
