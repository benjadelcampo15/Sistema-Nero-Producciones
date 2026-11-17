import { utils, write } from "xlsx";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { consumidoEvento } from "@/lib/stock/consumido";
import { NOMBRE_ESTADO, consumoFisico } from "@/lib/stock/fudo";

/** Excel del evento: diferencias por producto, conteo físico, ventas de FUDO (detalle) y pendientes. */
export async function GET(_request: Request, { params }: RouteContext<"/stock/consumido/[id]/excel">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return new Response("Sin acceso", { status: 403 });
  const { id } = await params;
  const datos = await consumidoEvento(id);
  if (!datos) return new Response("No encontrado", { status: 404 });
  const { evento, comparacion, ventas, fisicos, productos } = datos;
  const nombre = (pid: string) => productos.find((p) => p.id === pid)?.nombre ?? "Producto borrado";

  const libro = utils.book_new();
  utils.book_append_sheet(
    libro,
    utils.json_to_sheet(
      comparacion.filas.map((f) => ({
        Producto: f.producto,
        Unidad: f.unidad,
        "FUDO (teórico)": f.teorico,
        "Consumo físico": f.consumo,
        "Justificado (mermas, roturas, invitaciones)": f.justificado,
        Diferencia: f.diferencia,
        "% diferencia": f.pct,
        Estado: NOMBRE_ESTADO[f.estado],
        "Origen FUDO": f.origen.map((o) => `${o.producto}: ${o.vendidas} × ${o.porUnidad}`).join(" · "),
      })),
    ),
    "Diferencias",
  );
  utils.book_append_sheet(
    libro,
    utils.json_to_sheet(
      fisicos.map((f) => ({
        Producto: nombre(f.producto_id),
        Inicial: f.inicial,
        Reposiciones: f.reposiciones,
        Final: f.final,
        Mermas: f.mermas,
        Roturas: f.roturas,
        Invitaciones: f.invitaciones,
        "Consumo físico": consumoFisico(f),
        "Corrección autorizada": f.corregido,
        Motivo: f.motivo,
      })),
    ),
    "Conteo físico",
  );
  utils.book_append_sheet(
    libro,
    utils.json_to_sheet(ventas.map((v) => ({ Fecha: v.fecha, Categoría: v.categoria, "Sub categoría": v.subcategoria, Producto: v.producto, Cantidad: v.cantidad, Monto: v.monto }))),
    "Ventas FUDO",
  );
  if (comparacion.pendientes.length) {
    utils.book_append_sheet(
      libro,
      utils.json_to_sheet(comparacion.pendientes.map((p) => ({ "Producto FUDO sin configurar": p.producto, Vendidas: p.vendidas, Monto: p.monto }))),
      "Sin configurar",
    );
  }
  const archivo = write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nombreArchivo = `Consumido ${evento.nombre} ${evento.fecha}.xlsx`.replace(/[\\/:*?"<>|]+/g, "_");
  const ascii = nombreArchivo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w .-]+/g, "_");
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombreArchivo)}`,
    },
  });
}
