import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarProveedores, resumenFacturasPorProveedor } from "@/lib/facturas/consultas";
import { formatoDocumento } from "@/lib/cuit";
import { hoy } from "@/lib/formato";
import { TarjetasFichas } from "@/components/tarjetas-fichas";
import { SinAcceso } from "../sin-acceso";
import { NavegacionFacturas } from "./navegacion";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Proveedores: una tarjeta por proveedor con lo facturado en el mes (facturas aprobadas) y su ficha. */
export default async function PaginaProveedores() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturas", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "facturas", "editar");
  const [proveedores, resumen] = await Promise.all([listarProveedores(), resumenFacturasPorProveedor()]);
  const activos = proveedores.filter((p) => p.activo).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Proveedores</h1>
          <p className="text-sm text-stone-500">
            {activos} {activos === 1 ? "proveedor" : "proveedores"} · se agregan solos al aprobar una factura
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

      <TarjetasFichas
        editable={editable}
        rutas={{ ficha: "/facturas/proveedores", accion: { texto: "Cargar factura", href: "/facturas/lista" }, agregar: { texto: "Agregar proveedor", href: "/facturas/proveedores/nuevo" } }}
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
          };
        })}
      />
    </div>
  );
}
