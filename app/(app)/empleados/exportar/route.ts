import { utils, write } from "xlsx";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarPersonal } from "@/lib/empleados/consultas";
import { CAMPOS_PERSONA } from "@/lib/empleados/tipos";
import { formatoFecha, hoy } from "@/lib/formato";

/**
 * Excel con los empleados elegidos (campos "id" del formulario) o con todos si
 * no se elige ninguno. Va por POST porque la selección puede ser muy larga para una URL.
 */
export async function POST(request: Request) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "operativa", "ver")) return new Response("Sin acceso", { status: 403 });

  const formulario = await request.formData();
  const ids = new Set(formulario.getAll("id").filter((v): v is string => typeof v === "string"));
  const personal = (await listarPersonal()).filter((p) => !ids.size || ids.has(p.id));

  const filas = personal.map((p) => {
    const fila: Record<string, string> = {};
    for (const c of CAMPOS_PERSONA) {
      const valor = p[c.id];
      fila[c.nombre] = c.id === "fecha_nacimiento" && valor ? formatoFecha(valor) : (valor ?? "");
    }
    fila["Notas"] = p.notas ?? "";
    return fila;
  });

  const hoja = utils.json_to_sheet(filas, { header: [...CAMPOS_PERSONA.map((c) => c.nombre), "Notas"] });
  // Ancho de cada columna según su contenido (DNI y CUIL van como texto para no perder ceros).
  hoja["!cols"] = [...CAMPOS_PERSONA.map((c) => c.nombre), "Notas"].map((titulo) => ({
    wch: Math.min(50, Math.max(titulo.length, ...filas.map((f) => String(f[titulo] ?? "").length)) + 2),
  }));
  const libro = utils.book_new();
  utils.book_append_sheet(libro, hoja, "Empleados");
  const archivo = write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const nombre = `empleados${ids.size ? `-${personal.length}` : ""}-${hoy()}.xlsx`;
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
