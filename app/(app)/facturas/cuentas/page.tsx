import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarProveedores } from "@/lib/facturas/consultas";
import { saldosPendientes } from "@/lib/cuentas/consultas";
import { formatoDocumento } from "@/lib/cuit";
import { leerEmpresa } from "@/lib/empresas";
import { ListaSaldos } from "@/components/cuenta-corriente/lista-saldos";
import { SinAcceso } from "../../sin-acceso";
import { NavegacionFacturas } from "../navegacion";

/** Cuentas corrientes de proveedores: a quién le debe cada empresa y cuánto. */
export default async function PaginaCuentasProveedores({ searchParams }: PageProps<"/facturas/cuentas">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturas", "ver")) return <SinAcceso />;
  const empresa = leerEmpresa((await searchParams).empresa);
  const [proveedores, saldos] = await Promise.all([listarProveedores(), saldosPendientes("pago", empresa)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Proveedores</h1>
        <p className="text-sm text-stone-500">Lo que se les debe: facturas aprobadas pendientes de pago. Los pagos se registran en la ficha de cada uno.</p>
      </div>
      <NavegacionFacturas actual="/facturas/cuentas" />
      <ListaSaldos
        empresa={empresa}
        ruta="/facturas/cuentas"
        ficha="/facturas/proveedores"
        texto="Le debemos"
        fichas={proveedores.map((p) => ({ id: p.id, nombre: p.razon_social, documento: p.cuit ? formatoDocumento(80, p.cuit) : "—", saldo: saldos.get(p.id) ?? 0 }))}
      />
    </div>
  );
}
