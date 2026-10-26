import type { NextRequest } from "next/server";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { leerFiltros, obtenerTransacciones } from "@/lib/financiero/consultas";
import { NOMBRE_ESTADO_MOVIMIENTO, NOMBRE_MEDIO_PAGO } from "@/lib/financiero/tipos";
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

  const encabezado = [
    "Fecha", "Tipo", "Estado", "Descripción", "Categoría", "Evento", "Proveedor / Cuenta",
    "Medio de pago", "Monto", "Facturado", "IVA", "IIBB", "Notas",
  ];
  // Columnas numéricas: van sin comillas para que Excel las tome como números.
  const numericas = new Set(["Monto", "IVA", "IIBB"].map((c) => encabezado.indexOf(c)));

  const filas = transacciones.map((t) => [
    t.fecha ? formatoFecha(t.fecha) : "Sin fecha",
    t.tipo === "ingreso" ? "Ingreso" : "Egreso",
    NOMBRE_ESTADO_MOVIMIENTO[t.estado],
    t.descripcion,
    t.categoria.nombre,
    t.evento?.nombre ?? "",
    t.contraparte ?? "",
    NOMBRE_MEDIO_PAGO[t.medio_pago],
    numero(t.tipo === "ingreso" ? t.monto : -t.monto),
    t.facturado ? "Sí" : "No",
    t.iva !== null ? numero(t.iva) : "",
    t.iibb !== null ? numero(t.iibb) : "",
    t.notas ?? "",
  ]);

  const csv =
    "﻿" +
    [encabezado.map(celda).join(";"), ...filas.map((f) => f.map((v, i) => (numericas.has(i) ? v : celda(v))).join(";"))].join(
      "\r\n",
    );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="movimientos_${filtros.desde}_${filtros.hasta}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
