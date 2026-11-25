import { obtenerUsuario } from "@/lib/auth/sesion";
import { obtenerEvento, obtenerPlanillaEvento } from "@/lib/eventos/consultas";
import { puedeEnEvento } from "@/lib/eventos/permiso";
import { excelPlanilla, nombreArchivo } from "@/lib/eventos/excel";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Excel de la planilla del evento (Resumen, Ingresos, Gastos por sector). Es
 * una foto de lo guardado: solo lee, no modifica nada.
 */
export async function GET(_request: Request, { params }: RouteContext<"/eventos/[id]/excel">) {
  const { id } = await params;
  const [usuario, evento] = await Promise.all([obtenerUsuario(), obtenerEvento(id)]);
  if (!evento) return new Response("Evento no encontrado", { status: 404 });
  if (evento.tipo !== "evento" || !puedeEnEvento(usuario, evento.tipo, "costos", "ver")) return new Response("Sin acceso", { status: 403 });

  const planilla = await obtenerPlanillaEvento(id);
  const ids = [...new Set(planilla.gastos.map((g) => g.proveedor_id).filter(Boolean))] as string[];
  const { data: proveedores } = ids.length
    ? await (await crearClienteServidor()).from("proveedores").select("id, razon_social").in("id", ids)
    : { data: [] as { id: string; razon_social: string }[] };
  // Datos bancarios: solo para quien puede editar la planilla.
  const conBancarios = puedeEnEvento(usuario, evento.tipo, "costos", "editar");
  const archivo = await excelPlanilla(evento, planilla, new Map((proveedores ?? []).map((p) => [p.id, p.razon_social])), conBancarios);
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo("EVENTO", evento.nombre, evento.fecha)}"`,
      "Cache-Control": "no-store",
    },
  });
}
