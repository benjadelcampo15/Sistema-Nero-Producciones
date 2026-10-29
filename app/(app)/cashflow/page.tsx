import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarCuentas, movimientosEntre, saldosAFecha, totalSaldos } from "@/lib/bancos/consultas";
import type { MovimientoCaja } from "@/lib/bancos/tipos";
import { formatoFecha, formatoPesos, hoy, proximosMeses, sumar } from "@/lib/formato";
import { SinAcceso } from "../sin-acceso";
import { NOMBRE_EMPRESA } from "@/lib/empresas";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const fechaValida = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

type Fila = MovimientoCaja & { saldo: number };

export default async function PaginaCashflow({ searchParams }: PageProps<"/cashflow">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;

  const p = await searchParams;
  // Por defecto arranca el día de la última carga de saldos bancarios; se puede elegir otra fecha.
  const ultimos = await saldosAFecha(hoy());
  const ultimaCarga = [...ultimos.values()].map((s) => s.fecha).sort().at(-1) ?? hoy();
  const desde = fechaValida(p.desde) ? (p.desde as string) : ultimaCarga;
  // Saldo inicial: los saldos bancarios tal cual se cargaron hasta esa fecha (sin calcular saldos históricos).
  const [cuentas, saldos] = await Promise.all([listarCuentas(), desde === hoy() ? ultimos : saldosAFecha(desde)]);
  const t = totalSaldos(cuentas, saldos);
  const cargas = [...saldos.values()].map((s) => s.fecha).sort();
  const porDefecto = proximosMeses(3);
  const hasta = fechaValida(p.hasta) && (p.hasta as string) >= desde ? (p.hasta as string) : porDefecto.hasta > desde ? porDefecto.hasta : desde;
  // Los checkboxes vienen solo si están tildados; sin filtros aplicados, van los dos.
  const filtrado = p.hasta !== undefined || p.desde !== undefined;
  const opciones = { proyectados: !filtrado || p.proyectados === "1", cheques: !filtrado || p.cheques === "1" };

  const { movimientos, truncado } = await movimientosEntre(desde, hasta, opciones);
  const inicio = { saldo: t.total, descubierto: t.descubierto };

  // Saldo acumulado movimiento a movimiento, agrupado por mes.
  let saldo = inicio.saldo;
  const meses = new Map<string, Fila[]>();
  for (const m of movimientos) {
    saldo = sumar([saldo, m.tipo === "ingreso" ? m.monto : -m.monto]);
    const clave = m.fecha.slice(0, 7);
    if (!meses.has(clave)) meses.set(clave, []);
    meses.get(clave)!.push({ ...m, saldo });
  }
  const fechaHoy = hoy();
  const minimo = Math.min(inicio.saldo, ...[...meses.values()].flat().map((f) => f.saldo));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cashflow</h1>
        <p className="text-sm text-stone-500">Arranca del saldo bancario cargado y suma los ingresos y egresos de {NOMBRE_EMPRESA.nero} y de {NOMBRE_EMPRESA.ruta} de ahí en adelante, mes a mes, con el saldo a cada fecha.</p>
      </div>

      {cargas.length === 0 && (
        <p className="alerta-error">
          Todavía no hay saldos bancarios cargados: el cashflow arranca en $0. <Link href="/saldos" className="underline">Cargá los saldos del día</Link>.
        </p>
      )}

      <form className="tarjeta flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="desde" className="etiqueta">Desde</label>
          <input id="desde" name="desde" type="date" defaultValue={desde} className="campo" />
        </div>
        <div>
          <label htmlFor="hasta" className="etiqueta">Hasta</label>
          <input id="hasta" name="hasta" type="date" defaultValue={hasta} className="campo" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="proyectados" value="1" defaultChecked={opciones.proyectados} />
          Incluir proyectados
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="cheques" value="1" defaultChecked={opciones.cheques} />
          Incluir cheques pendientes
        </label>
        <button type="submit" className="boton-secundario">Ver</button>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="tarjeta">
          <p className="text-xs uppercase tracking-wide text-stone-500">Saldo inicial · {formatoFecha(desde)}</p>
          <p className={`mt-1 font-mono text-xl font-semibold ${inicio.saldo < 0 ? "text-red-700" : ""}`}>{formatoPesos(inicio.saldo)}</p>
          <ConDescubierto saldo={inicio.saldo} descubierto={inicio.descubierto} />
          <p className="text-xs text-stone-500">
            {cargas.length
              ? `Saldos bancarios cargados al ${formatoFecha(cargas.at(-1)!)} (${cuentas.length - t.sinCargar} cuenta${cuentas.length - t.sinCargar === 1 ? "" : "s"}${t.sinCargar ? `, ${t.sinCargar} sin cargar` : ""})`
              : "No hay saldos bancarios cargados a esa fecha: arranca en $0"}
          </p>
        </div>
        <div className="tarjeta">
          <p className="text-xs uppercase tracking-wide text-stone-500">Saldo final · {formatoFecha(hasta)}</p>
          <p className={`mt-1 font-mono text-xl font-semibold ${saldo < 0 ? "text-red-700" : ""}`}>{formatoPesos(saldo)}</p>
          <ConDescubierto saldo={saldo} descubierto={inicio.descubierto} />
          <p className="text-xs text-stone-500">{movimientos.length} movimientos</p>
        </div>
        <div className={`tarjeta ${minimo < -inicio.descubierto ? "border-red-300 bg-red-50" : ""}`}>
          <p className="text-xs uppercase tracking-wide text-stone-500">Saldo más bajo del período</p>
          <p className={`mt-1 font-mono text-xl font-semibold ${minimo < 0 ? "text-red-700" : ""}`}>{formatoPesos(minimo)}</p>
          <ConDescubierto saldo={minimo} descubierto={inicio.descubierto} />
          <p className="text-xs text-stone-500">
            Descubierto acordado: {formatoPesos(inicio.descubierto)}
            {minimo < -inicio.descubierto && <span className="block font-semibold text-red-700">Se pasa del descubierto</span>}
          </p>
        </div>
      </div>

      {truncado && <p className="alerta-error">Hay demasiados movimientos en el período: acotá las fechas.</p>}
      {movimientos.length === 0 && <p className="tarjeta text-center text-sm text-stone-500">No hay movimientos en el período.</p>}

      {[...meses.entries()].map(([clave, filas]) => {
        const [anio, mes] = clave.split("-").map(Number);
        const ingresos = sumar(filas.filter((f) => f.tipo === "ingreso").map((f) => f.monto));
        const egresos = sumar(filas.filter((f) => f.tipo === "egreso").map((f) => f.monto));
        const cierre = filas[filas.length - 1].saldo;
        return (
          <section key={clave} className="tarjeta overflow-x-auto p-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-200 bg-stone-50 px-4 py-3">
              <h2 className="font-semibold">{MESES[mes - 1]} {anio}</h2>
              <p className="flex flex-wrap gap-x-4 text-sm">
                <span className="text-green-700">Ingresos {formatoPesos(ingresos)}</span>
                <span className="text-red-700">Egresos {formatoPesos(egresos)}</span>
                <span className={`font-semibold ${cierre < 0 ? "text-red-700" : ""}`}>Saldo al cierre {formatoPesos(cierre)}</span>
                <span className={`font-semibold ${cierre + inicio.descubierto < 0 ? "text-red-700" : "text-stone-600"}`}>
                  Con descubierto {formatoPesos(cierre + inicio.descubierto)}
                </span>
              </p>
            </div>
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Detalle</th>
                  <th className="px-4 py-2 text-right">Ingreso</th>
                  <th className="px-4 py-2 text-right">Egreso</th>
                  <th className="px-4 py-2 text-right">Saldo</th>
                  <th className="px-4 py-2 text-right">Saldo con descubierto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filas.map((f) => (
                  <tr key={f.origen + f.id} className={f.fecha === fechaHoy ? "bg-amber-50/60" : ""}>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-stone-600">{formatoFecha(f.fecha)}</td>
                    <td className="px-4 py-2">
                      {f.empresa && (
                        <span
                          className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            f.empresa === "ruta" ? "bg-sky-100 text-sky-800" : "bg-stone-800 text-white"
                          }`}
                        >
                          {f.empresa}
                        </span>
                      )}
                      {f.descripcion}
                      {(f.origen === "cheque" || f.estado !== "real") && (
                        <span className="ml-2 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-stone-600">
                          {f.origen === "cheque" ? "Cheque" : f.estado}
                        </span>
                      )}
                      {f.detalle && <span className="block text-xs text-stone-500">{f.detalle}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-green-700">{f.tipo === "ingreso" ? formatoPesos(f.monto) : ""}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-red-700">{f.tipo === "egreso" ? formatoPesos(f.monto) : ""}</td>
                    <td
                      className={`whitespace-nowrap px-4 py-2 text-right font-mono font-medium ${
                        f.saldo < -inicio.descubierto ? "bg-red-100 text-red-800" : f.saldo < 0 ? "text-red-700" : ""
                      }`}
                    >
                      {formatoPesos(f.saldo)}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-2 text-right font-mono ${f.saldo + inicio.descubierto < 0 ? "bg-red-100 font-medium text-red-800" : "text-stone-600"}`}>
                      {formatoPesos(f.saldo + inicio.descubierto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

/** Línea chica debajo de un saldo: el mismo saldo sumando el descubierto acordado. */
function ConDescubierto({ saldo, descubierto }: { saldo: number; descubierto: number }) {
  return (
    <p className={`font-mono text-sm ${saldo + descubierto < 0 ? "font-semibold text-red-700" : "text-stone-600"}`}>
      Con descubierto: {formatoPesos(saldo + descubierto)}
    </p>
  );
}
