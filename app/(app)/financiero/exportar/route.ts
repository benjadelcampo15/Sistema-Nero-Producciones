import type { NextRequest } from "next/server";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { leerFiltros, obtenerTransacciones } from "@/lib/financiero/consultas";
import { NOMBRE_MEDIO_PAGO } from "@/lib/financiero/tipos";
import { formatoFecha } from "@/lib/formato";

/** CSV para Excel en español: separador ";" , coma decimal y BOM para los acentos. */
export async function GET(request: NextRequest) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) {
    return new Response("Sin acceso", { status: 403 });
  }

  const filtros = leerFiltros(Object.fromEntries(request.nextUrl.searchParams));
  const { transacciones } = await obtenerTransacciones(filtros);

  const celda = (valor: string) => {
    // Evita que Excel interprete el texto como fórmula (inyección CSV).
    const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
    return `"${seguro.replace(/"/g, '""')}"`;
  };
  const numero = (n: number) => n.toFixed(2).replace(".", ",");

  const filas = [
    ["Fecha", "Tipo", "Descripción", "Categoría", "Evento", "Proveedor / Cliente", "Medio de pago", "Monto", "Notas"],
    ...transacciones.map((t) => [
      formatoFecha(t.fecha),
      t.tipo === "ingreso" ? "Ingreso" : "Egreso",
      t.descripcion,
      t.categoria.nombre,
      t.evento?.nombre ?? "",
      t.contraparte ?? "",
      NOMBRE_MEDIO_PAGO[t.medio_pago],
      numero(t.tipo === "ingreso" ? t.monto : -t.monto),
      t.notas ?? "",
    ]),
  ];

  const csv =
    "﻿" +
    filas
      .map((fila) => fila.map((v, i) => (i === 7 && v !== "Monto" ? v : celda(v))).join(";"))
      .join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="movimientos_${filtros.desde}_${filtros.hasta}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
