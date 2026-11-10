import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { resumenesParaExcel } from "@/lib/tarjetas/consultas";
import { armarExcel } from "@/lib/tarjetas/excel";
import { hoy } from "@/lib/formato";

/** Excel con el formato de la planilla: RESUMEN y una hoja por mes. ?id= un resumen; ?anio= los de ese año (por defecto, todos). */
export async function GET(request: Request) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return new Response("Sin acceso", { status: 403 });
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const anio = Number(params.get("anio"));
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) return new Response("Resumen no encontrado", { status: 404 });
  const meses = await resumenesParaExcel({ id: id ?? undefined, anio: anio >= 2000 && anio < 2100 ? anio : undefined });
  if (!meses.length) return new Response("No hay resúmenes para exportar", { status: 404 });
  const archivo = armarExcel(meses);
  const nombre = `tarjetas-${id ? meses[0].resumen.fecha_cierre.slice(0, 7) : anio || "todas"}-${hoy()}.xlsx`;
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
