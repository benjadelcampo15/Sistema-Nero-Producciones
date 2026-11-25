import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerCliente } from "@/lib/clientes/consultas";
import { cuentaCorriente } from "@/lib/cuentas/consultas";
import { excelCuentaCorriente, nombreArchivoCuenta } from "@/lib/cuentas/excel";
import { formatoDocumento } from "@/lib/cuit";
import { leerEmpresa } from "@/lib/empresas";
import { hoy } from "@/lib/formato";

/** Excel de la cuenta corriente de un cliente (la misma de su ficha). Solo lee. */
export async function GET(request: Request, { params }: RouteContext<"/facturar/cuentas/[id]/excel">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturar", "ver")) return new Response("Sin acceso", { status: 403 });
  const { id } = await params;
  const cliente = await obtenerCliente(id);
  if (!cliente) return new Response("Cliente no encontrado", { status: 404 });
  const empresa = cliente.empresa ?? leerEmpresa(new URL(request.url).searchParams.get("empresa") ?? undefined);
  const cuenta = await cuentaCorriente("cobro", cliente.id, empresa);
  const archivo = await excelCuentaCorriente("cobro", { nombre: cliente.razon_social, documento: formatoDocumento(cliente.doc_tipo, cliente.doc_nro) }, empresa, cuenta);
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoCuenta(cliente.razon_social, empresa, hoy())}"`,
      "Cache-Control": "no-store",
    },
  });
}
