import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { movimientosEntre, saldoAlInicio } from "@/lib/bancos/consultas";
import type { MovimientoCaja } from "@/lib/bancos/tipos";
import { formatoFecha, formatoPesos, hoy, proximosMeses, sumar } from "@/lib/formato";
import { SinAcceso } from "../sin-acceso";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const fechaValida = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

type Fila = MovimientoCaja & { saldo: number };

export default async function PaginaCashflow({ searchParams }: PageProps<"/cashflow">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;

  const p = await searchParams;
  const porDefecto = proximosMeses(3);
  const desde = fechaValida(p.desde) ? (p.desde as string) : porDefecto.desde;
  const hasta = fechaValida(p.hasta) && (p.hasta as string) >= desde ? (p.hasta as string) : porDefecto.hasta;
  // Los checkboxes vienen solo si están tildados; sin filtros aplicados, van los dos.
  const filtrado = p.desde !== undefined;
  const opciones = { proyectados: !filtrado || p.proyectados === "1", cheques: !filtrado || p.cheques === "1" };

  const [inicio, { movimientos, truncado }] = await Promise.all([saldoAlInicio(desde, opciones), movimientosEntre(desde, hasta, opciones)]);

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
        <p className="text-sm text-stone-500">Ingresos y egresos por fecha, mes a mes, con el saldo a cada fecha. Arranca del saldo en bancos.</p>
      </div>

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
          <p className="text-xs text-stone-500">
            {inicio.cargadoEl ? `Saldos bancarios del ${formatoFecha(inicio.cargadoEl)}` : "Sin saldos bancarios cargados: arranca en $0"}
          </p>
        </div>
        <div className="tarjeta">
          <p className="text-xs uppercase tracking-wide text-stone-500">Saldo final · {formatoFecha(hasta)}</p>
          <p className={`mt-1 font-mono text-xl font-semibold ${saldo < 0 ? "text-red-700" : ""}`}>{formatoPesos(saldo)}</p>
          <p className="text-xs text-stone-500">{movimientos.length} movimientos</p>
        </div>
        <div className={`tarjeta ${minimo < -inicio.descubierto ? "border-red-300 bg-red-50" : ""}`}>
          <p className="text-xs uppercase tracking-wide text-stone-500">Saldo más bajo del período</p>
          <p className={`mt-1 font-mono text-xl font-semibold ${minimo < 0 ? "text-red-700" : ""}`}>{formatoPesos(minimo)}</p>
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
              </p>
            </div>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Detalle</th>
                  <th className="px-4 py-2 text-right">Ingreso</th>
                  <th className="px-4 py-2 text-right">Egreso</th>
                  <th className="px-4 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filas.map((f) => (
                  <tr key={f.origen + f.id} className={f.fecha === fechaHoy ? "bg-amber-50/60" : ""}>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-stone-600">{formatoFecha(f.fecha)}</td>
                    <td className="px-4 py-2">
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
