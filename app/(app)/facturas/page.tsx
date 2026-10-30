import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarProveedores, resumenFacturasPorProveedor } from "@/lib/facturas/consultas";
import { formatoDocumento } from "@/lib/cuit";
import { formatoPesos, hoy } from "@/lib/formato";
import { TarjetasFichas } from "@/components/tarjetas-fichas";
import { AlternarEmpresa } from "@/components/empresa";
import { saldosPendientes } from "@/lib/cuentas/consultas";
import { NOMBRE_EMPRESA, leerEmpresa } from "@/lib/empresas";
import { SinAcceso } from "../sin-acceso";
import { NavegacionFacturas } from "./navegacion";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Proveedores de una empresa: una tarjeta por proveedor con lo facturado en el mes, lo que se le debe y su ficha. */
export default async function PaginaProveedores({ searchParams }: PageProps<"/facturas">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturas", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "facturas", "editar");
  const empresa = leerEmpresa((await searchParams).empresa);
  const [todos, resumen, saldos] = await Promise.all([listarProveedores(), resumenFacturasPorProveedor(empresa), saldosPendientes("pago", empresa)]);
  // Los de esta empresa y los que trabajan con las dos.
  const proveedores = todos.filter((p) => !p.empresa || p.empresa === empresa);
  const activos = proveedores.filter((p) => p.activo).length;
  const deuda = [...proveedores].reduce((t, p) => t + (saldos.get(p.id) ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Proveedores</h1>
          <p className="text-sm text-stone-500">
            {activos} {activos === 1 ? "proveedor" : "proveedores"} de {NOMBRE_EMPRESA[empresa]} · se agregan solos al aprobar una factura
          </p>
        </div>
        {editable && (
          <div className="flex gap-2">
            <Link href="/facturas/lista" className="boton-secundario">Subir facturas</Link>
            <Link href="/facturas/proveedores/nuevo" className="boton">+ Nuevo proveedor</Link>
          </div>
        )}
      </div>

      <NavegacionFacturas actual="/facturas" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AlternarEmpresa actual={empresa} href={(e) => `/facturas?empresa=${e}`} />
        {deuda > 0 && (
          <Link href={`/facturas/cuentas?empresa=${empresa}`} className="text-sm text-amber-800 hover:underline">
            {NOMBRE_EMPRESA[empresa]} le debe {formatoPesos(deuda)} a proveedores →
          </Link>
        )}
      </div>

      <TarjetasFichas
        editable={editable}
        rutas={{ ficha: "/facturas/proveedores", consulta: `?empresa=${empresa}`, saldo: "Le debemos", accion: { texto: "Cargar factura", href: "/facturas/lista" }, agregar: { texto: "Agregar proveedor", href: "/facturas/proveedores/nuevo" } }}
        mes={MESES[Number(hoy().slice(5, 7)) - 1]}
        fichas={proveedores.map((p) => {
          const r = p.cuit ? resumen.get(p.cuit) : undefined;
          return {
            id: p.id,
            nombre: p.razon_social,
            documento: p.cuit ? formatoDocumento(80, p.cuit) : "Sin CUIT",
            condicion: p.alias_cbu ? `Alias ${p.alias_cbu}` : "",
            activo: p.activo,
            contacto: p.telefono ?? p.email,
            mes: r?.mes ?? { cantidad: 0, total: 0 },
            total: r?.total ?? 0,
            cantidad: r?.cantidad ?? 0,
            ultima: r?.ultima ?? null,
            saldo: saldos.get(p.id) ?? 0,
          };
        })}
      />
    </div>
  );
}
