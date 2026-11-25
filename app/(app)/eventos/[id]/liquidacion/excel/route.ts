import { obtenerUsuario } from "@/lib/auth/sesion";
import { obtenerEvento } from "@/lib/eventos/consultas";
import { obtenerLiquidacion } from "@/lib/eventos/consultas-liquidacion";
import { puedeEnEvento } from "@/lib/eventos/permiso";
import { excelLiquidacion, nombreArchivo } from "@/lib/eventos/excel";

/** Excel solo de Entradas y liquidación Isidris (con los porcentajes del evento). Solo lee. */
export async function GET(_request: Request, { params }: RouteContext<"/eventos/[id]/liquidacion/excel">) {
  const { id } = await params;
  const [usuario, evento] = await Promise.all([obtenerUsuario(), obtenerEvento(id)]);
  if (!evento) return new Response("Evento no encontrado", { status: 404 });
  if (!puedeEnEvento(usuario, evento.tipo, "costos", "ver")) return new Response("Sin acceso", { status: 403 });
  const liquidacion = await obtenerLiquidacion(id);
  if (!liquidacion) return new Response("Este evento no usa la liquidación Isidris", { status: 404 });

  const archivo = await excelLiquidacion(evento, liquidacion);
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo("LIQUIDACION_ISIDRIS", evento.nombre)}"`,
      "Cache-Control": "no-store",
    },
  });
}
