import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarClientes } from "@/lib/clientes/consultas";
import { categoriasDeCuenta, resumenCuentas } from "@/lib/cuentas/consultas";
import { formatoDocumento } from "@/lib/cuit";
import { leerEmpresa } from "@/lib/empresas";
import { AlternarEmpresa } from "@/components/empresa";
import { ListaSaldos } from "@/components/cuenta-corriente/lista-saldos";
import { SinAcceso } from "../../sin-acceso";
import { NavegacionFacturar } from "../navegacion";

/** Cuentas corrientes de clientes: quién le debe a cada empresa, y sus movimientos. */
export default async function PaginaCuentasClientes({ searchParams }: PageProps<"/facturar/cuentas">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturar", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "facturar", "editar") || puede(usuario, "financiero", "editar");
  const empresa = leerEmpresa((await searchParams).empresa);
  const [clientes, resumen, categorias] = await Promise.all([listarClientes({ incluirInactivos: true }), resumenCuentas("cobro", empresa), categoriasDeCuenta("cobro")]);
  const fichas = clientes.map((c) => ({ ...c, nombre: c.razon_social, documento: formatoDocumento(c.doc_tipo, c.doc_nro), saldo: resumen.get(c.id)?.saldo ?? 0 }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <p className="text-sm text-stone-500">Lo que deben: facturas y movimientos pendientes de cobro.</p>
      </div>
      <NavegacionFacturar actual="/facturar/cuentas" />
      <AlternarEmpresa actual={empresa} href={(e) => `/facturar/cuentas?empresa=${e}`} />
      <ListaSaldos
        tipo="cobro"
        empresa={empresa}
        ruta="/facturar/cuentas"
        texto="Nos deben"
        cuentas={fichas.filter((f) => resumen.has(f.id))}
        sinCuenta={fichas.filter((f) => !resumen.has(f.id) && f.activo && (!f.empresa || f.empresa === empresa))}
        categorias={categorias.lista}
        categoriaDefecto={categorias.defecto}
        editable={editable}
      />
    </div>
  );
}
