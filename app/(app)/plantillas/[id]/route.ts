import { utils, write } from "xlsx";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { plantilla } from "@/lib/plantillas";

/**
 * Descarga una plantilla de Excel: hoja de carga con títulos y ejemplos, hoja
 * de instrucciones y, si el usuario tiene acceso, las listas de nombres que
 * existen hoy (productos, depósitos, eventos) para copiarlos tal cual.
 */
export async function GET(_request: Request, { params }: RouteContext<"/plantillas/[id]">) {
  const usuario = await obtenerUsuario();
  const { id } = await params;
  const p = plantilla(id);
  if (!p) return new Response("Plantilla no encontrada", { status: 404 });

  const libro = utils.book_new();
  const hoja = utils.aoa_to_sheet([p.columnas.map((c) => c.titulo), ...p.ejemplos]);
  hoja["!cols"] = p.columnas.map((c) => ({ wch: Math.max(14, c.titulo.length + 4) }));
  utils.book_append_sheet(libro, hoja, "Cargar acá");

  const instrucciones = utils.aoa_to_sheet([
    [p.nombre],
    [p.descripcion],
    [`Se sube en: ${p.dondeSeSube.texto}`],
    ["Las filas de ejemplo de la hoja \"Cargar acá\" se reemplazan por las tuyas. No cambies los títulos."],
    [],
    ["Columna", "Obligatoria", "Qué va"],
    ...p.columnas.map((c) => [c.titulo, c.obligatoria ? "Sí" : "No", c.ayuda]),
  ]);
  instrucciones["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 90 }];
  utils.book_append_sheet(libro, instrucciones, "Instrucciones");

  // Nombres válidos de hoy, para no equivocarse al escribirlos.
  if (p.seccion === "stock" && puede(usuario, "stock", "ver")) {
    const supabase = await crearClienteServidor();
    const [{ data: productos }, { data: depositos }, { data: eventos }] = await Promise.all([
      supabase.from("productos").select("nombre, unidad, codigo").eq("activo", true).order("nombre"),
      supabase.from("depositos").select("nombre").eq("activo", true).order("nombre"),
      supabase.from("eventos").select("nombre, fecha").neq("estado", "cancelado").order("fecha", { ascending: false }),
    ]);
    const largo = Math.max(productos?.length ?? 0, depositos?.length ?? 0, eventos?.length ?? 0);
    const listas = utils.aoa_to_sheet([
      ["Productos", "Unidad", "Código", "", "Depósitos", "", "Eventos"],
      ...Array.from({ length: largo }, (_, i) => [
        productos?.[i]?.nombre ?? "",
        productos?.[i]?.unidad ?? "",
        productos?.[i]?.codigo ?? "",
        "",
        depositos?.[i]?.nombre ?? "",
        "",
        eventos?.[i]?.nombre ?? "",
      ]),
    ]);
    listas["!cols"] = [{ wch: 34 }, { wch: 10 }, { wch: 12 }, { wch: 3 }, { wch: 20 }, { wch: 3 }, { wch: 30 }];
    utils.book_append_sheet(libro, listas, "Nombres válidos");
  }

  const archivo = write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plantilla-${p.id}.xlsx"`,
    },
  });
}
