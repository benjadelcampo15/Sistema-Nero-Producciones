import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarProveedores } from "@/lib/facturas/consultas";
import { categoriasDeCuenta, resumenCuentas } from "@/lib/cuentas/consultas";
import { formatoDocumento } from "@/lib/cuit";
import { leerEmpresa } from "@/lib/empresas";
import { AlternarEmpresa } from "@/components/empresa";
import { ListaSaldos } from "@/components/cuenta-corriente/lista-saldos";
import { SinAcceso } from "../../sin-acceso";
import { NavegacionFacturas } from "../navegacion";

/** Cuentas corrientes de proveedores: a quién le debe cada empresa, y sus movimientos. */
export default async function PaginaCuentasProveedores({ searchParams }: PageProps<"/facturas/cuentas">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturas", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "facturas", "editar") || puede(usuario, "financiero", "editar");
  const empresa = leerEmpresa((await searchParams).empresa);
  const [proveedores, resumen, categorias] = await Promise.all([listarProveedores(), resumenCuentas("pago", empresa), categoriasDeCuenta("pago")]);
  const fichas = proveedores.map((p) => ({ ...p, id: p.id, nombre: p.razon_social, documento: p.cuit ? formatoDocumento(80, p.cuit) : "—", saldo: resumen.get(p.id)?.saldo ?? 0 }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Proveedores</h1>
        <p className="text-sm text-stone-500">Lo que se les debe: facturas y movimientos pendientes de pago.</p>
      </div>
      <NavegacionFacturas actual="/facturas/cuentas" />
      <AlternarEmpresa actual={empresa} href={(e) => `/facturas/cuentas?empresa=${e}`} />
      <ListaSaldos
        tipo="pago"
        empresa={empresa}
        ruta="/facturas/cuentas"
        texto="Le debemos"
        cuentas={fichas.filter((f) => resumen.has(f.id))}
        sinCuenta={fichas.filter((f) => !resumen.has(f.id) && f.activo && (!f.empresa || f.empresa === empresa))}
        categorias={categorias.lista}
        categoriaDefecto={categorias.defecto}
        editable={editable}
      />
    </div>
  );
}
