import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { leerFiltrosCuadro, obtenerCuadro } from "@/lib/cuadro/consultas";
import { pdfCuadroAnual } from "@/lib/cuadro/pdf";
import { obtenerCategorias } from "@/lib/financiero/consultas";
import { NOMBRE_EMPRESA } from "@/lib/empresas";
import { formatoFechaHora } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/server";

/** Informe financiero anual en PDF (una empresa, un año, los filtros elegidos). Solo lee. */
export async function GET(request: Request) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return new Response("Sin acceso", { status: 403 });
  const f = leerFiltrosCuadro(Object.fromEntries(new URL(request.url).searchParams));
  const [{ cuadro }, categorias] = await Promise.all([obtenerCuadro(f), f.categoria && f.categoria !== "sin" ? obtenerCategorias({ incluirInactivas: true }) : Promise.resolve([])]);
  let evento = "";
  if (f.evento === "sin") evento = "sin evento";
  else if (f.evento) {
    const { data } = await (await crearClienteServidor()).from("eventos").select("nombre").eq("id", f.evento).eq("empresa", f.empresa).maybeSingle();
    evento = data?.nombre ? `evento ${data.nombre}` : "";
  }
  const filtros = [
    f.categoria === "sin" ? "sin categoría" : f.categoria ? `categoría ${categorias.find((c) => c.id === f.categoria)?.nombre ?? ""}` : "",
    evento,
  ].filter(Boolean).join(" · ");
  const archivo = await pdfCuadroAnual(cuadro, f.empresa, formatoFechaHora(new Date().toISOString()), filtros);
  const nombre = `INFORME_ANUAL_${NOMBRE_EMPRESA[f.empresa]}_${f.anio}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9_-]+/g, "_") + ".pdf";
  return new Response(new Uint8Array(archivo), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nombre}"`, "Cache-Control": "no-store" },
  });
}
