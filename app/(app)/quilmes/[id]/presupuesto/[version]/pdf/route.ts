import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { nombreArchivoPresupuesto, presupuestoEmitido } from "@/lib/quilmes/presupuesto";
import { pdfPresupuestoQuilmes } from "@/lib/quilmes/pdf";

/**
 * PDF de una versión emitida del presupuesto para Quilmes. Sale de la copia
 * guardada al emitir (lista blanca, validada de nuevo): nunca de la planilla.
 * Descargarlo no genera nada (ni versiones nuevas, ni cobros, ni movimientos).
 */
export async function GET(_request: Request, { params }: RouteContext<"/quilmes/[id]/presupuesto/[version]/pdf">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "quilmes", "ver")) return new Response("Sin acceso", { status: 403 });
  const { id, version } = await params;
  const doc = await presupuestoEmitido(id, Number(version));
  if (!doc) return new Response("Presupuesto no encontrado", { status: 404 });

  const archivo = await pdfPresupuestoQuilmes(doc);
  const nombre = nombreArchivoPresupuesto(doc);
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
