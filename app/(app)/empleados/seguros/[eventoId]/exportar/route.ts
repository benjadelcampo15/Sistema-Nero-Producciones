import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { segurosDeEvento } from "@/lib/empleados/consultas";
import { formatoFecha } from "@/lib/formato";

/** Lista del personal del evento para pedir el seguro (CSV para Excel en español). */
export async function GET(_request: Request, { params }: RouteContext<"/empleados/seguros/[eventoId]/exportar">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "operativa", "ver")) return new Response("Sin acceso", { status: 403 });
  const { eventoId } = await params;
  const datos = await segurosDeEvento(eventoId);
  if (!datos) return new Response("Evento no encontrado", { status: 404 });

  const celda = (valor: string) => {
    // Evita que Excel interprete el texto como fórmula (inyección CSV).
    const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
    return `"${seguro.replace(/"/g, '""')}"`;
  };
  const filas = [
    ["Apellido", "Nombre", "DNI", "CUIL", "Fecha de nacimiento", "Puesto", "Domicilio", "Teléfono"],
    ...datos.convocados.map(({ persona: p, puesto_id }) => [
      p.apellido,
      p.nombre,
      p.dni,
      p.cuil ?? "",
      p.fecha_nacimiento ? formatoFecha(p.fecha_nacimiento) : "",
      datos.puestos.find((q) => q.id === puesto_id)?.nombre ?? "",
      p.domicilio ?? "",
      p.telefono ?? "",
    ]),
  ];
  const csv = "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n");
  const nombre = `seguro ${datos.evento.nombre} ${datos.evento.fecha}`.replace(/[^\w\s-]/g, "").trim();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}.csv"`,
    },
  });
}
