import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerProveedor } from "@/lib/facturas/consultas";
import { cuentaCorriente } from "@/lib/cuentas/consultas";
import { excelCuentaCorriente, nombreArchivoCuenta } from "@/lib/cuentas/excel";
import { formatoDocumento } from "@/lib/cuit";
import { leerEmpresa } from "@/lib/empresas";
import { hoy } from "@/lib/formato";

/** Excel de la cuenta corriente de un proveedor (la misma de su ficha). Solo lee. */
export async function GET(request: Request, { params }: RouteContext<"/facturas/cuentas/[id]/excel">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturas", "ver")) return new Response("Sin acceso", { status: 403 });
  const { id } = await params;
  const proveedor = await obtenerProveedor(id);
  if (!proveedor) return new Response("Proveedor no encontrado", { status: 404 });
  const empresa = proveedor.empresa ?? leerEmpresa(new URL(request.url).searchParams.get("empresa") ?? undefined);
  const cuenta = await cuentaCorriente("pago", proveedor.id, empresa);
  const archivo = await excelCuentaCorriente("pago", { nombre: proveedor.razon_social, documento: proveedor.cuit ? `CUIT ${formatoDocumento(80, proveedor.cuit)}` : "Sin CUIT" }, empresa, cuenta);
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoCuenta(proveedor.razon_social, empresa, hoy())}"`,
      "Cache-Control": "no-store",
    },
  });
}
