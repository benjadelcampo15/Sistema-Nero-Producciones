import type { NextRequest } from "next/server";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { leerEmpresa } from "@/lib/empresas";
import { formatoFecha, sumar } from "@/lib/formato";
import { calcularSaldos, leerPeriodo, obtenerLibro } from "@/lib/contabilidad/consultas";
import { esDeResultado } from "@/lib/contabilidad/tipos";

/** CSV para Excel en español (como el de Financiero): libro diario, mayor de una cuenta o sumas y saldos. */
export async function GET(request: NextRequest) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return new Response("Sin acceso", { status: 403 });

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const vista = params.vista;
  const empresa = leerEmpresa(params.empresa);
  const periodo = leerPeriodo(params, vista === "sumas" ? "anio" : "mes");
  const libro = await obtenerLibro(empresa, periodo.hasta);
  const cuenta = (id: string) => libro.cuentaPorId.get(id);

  const texto = (valor: string) => {
    // Evita que Excel interprete el texto como fórmula (inyección CSV).
    const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
    return `"${seguro.replace(/"/g, '""')}"`;
  };
  const numero = (n: number) => (n ? n.toFixed(2).replace(".", ",") : "");
  type Celda = string | number;
  const fila = (celdas: Celda[]) => celdas.map((c) => (typeof c === "number" ? numero(c) : texto(c))).join(";");

  let nombre: string;
  let filas: Celda[][];

  if (vista === "sumas") {
    nombre = "sumas_y_saldos";
    filas = [
      ["Código", "Cuenta", "Saldo inicial", "Debe", "Haber", "Saldo final"],
      ...calcularSaldos(libro, periodo.desde, periodo.hasta)
        .filter((f) => f.inicial || f.debe || f.haber || f.final)
        .map((f) => [f.cuenta.codigo, f.cuenta.nombre, f.inicial, f.debe, f.haber, f.final]),
    ];
  } else if (vista === "mayor" && params.cuenta && cuenta(params.cuenta)) {
    const c = cuenta(params.cuenta)!;
    nombre = `mayor_${c.codigo}`;
    const inicioEjercicio = `${periodo.desde.slice(0, 4)}-01-01`;
    const anteriores: number[] = [];
    filas = [["Fecha", "Concepto", "Detalle", "Debe", "Haber", "Saldo"]];
    const movimientos: Celda[][] = [];
    for (const a of libro.asientos) {
      for (const l of a.lineas) {
        if (l.cuenta_id !== c.id) continue;
        if (a.fecha >= periodo.desde) movimientos.push([formatoFecha(a.fecha), a.descripcion, l.detalle ?? "", l.debe, l.haber]);
        else if (!esDeResultado(c.codigo) || a.fecha >= inicioEjercicio) anteriores.push(l.debe - l.haber);
      }
    }
    let saldo = sumar(anteriores);
    filas.push([formatoFecha(periodo.desde), "Saldo anterior", "", 0, 0, saldo]);
    for (const m of movimientos) {
      saldo = sumar([saldo, m[3] as number, -(m[4] as number)]);
      filas.push([...m, saldo]);
    }
  } else {
    nombre = "libro_diario";
    filas = [["Fecha", "Asiento", "Origen", "Código", "Cuenta", "Detalle", "Debe", "Haber"]];
    for (const a of libro.asientos.filter((x) => x.fecha >= periodo.desde)) {
      for (const l of a.lineas) {
        const c = cuenta(l.cuenta_id);
        filas.push([formatoFecha(a.fecha), a.descripcion, a.origen === "manual" ? "Manual" : a.origen === "cheque" ? "Cheque" : "Financiero", c?.codigo ?? "", c?.nombre ?? "", l.detalle ?? "", l.debe, l.haber]);
      }
    }
  }

  const csv = "﻿" + filas.map(fila).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}_${empresa}_${periodo.desde}_${periodo.hasta}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
