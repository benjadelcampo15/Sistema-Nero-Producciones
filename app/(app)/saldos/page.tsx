import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarCuentas, movimientosEntre, saldosAFecha, totalSaldos } from "@/lib/bancos/consultas";
import { TIPOS_CUENTA } from "@/lib/bancos/tipos";
import { formatoFecha, formatoPesos, hoy, sumar } from "@/lib/formato";
import { SinAcceso } from "../sin-acceso";
import { BotonEstadoCuenta, FormularioCuenta, FormularioSaldos } from "./formularios";

export default async function PaginaSaldos({ searchParams }: PageProps<"/saldos">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "financiero", "editar");

  const { fecha: fechaParam } = await searchParams;
  const fecha = typeof fechaParam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : hoy();

  const [cuentas, todas, saldos, { movimientos }] = await Promise.all([
    listarCuentas(),
    editable ? listarCuentas({ incluirInactivas: true }) : Promise.resolve([]),
    saldosAFecha(fecha),
    movimientosEntre(fecha, fecha),
  ]);
  const t = totalSaldos(cuentas, saldos);
  const ingresos = sumar(movimientos.filter((m) => m.tipo === "ingreso").map((m) => m.monto));
  const egresos = sumar(movimientos.filter((m) => m.tipo === "egreso").map((m) => m.monto));
  // Saldo bancario tal cual está cargado + lo que entra y sale ese día.
  const final = sumar([t.total, ingresos, -egresos]);
  const excede = final < -t.descubierto;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Saldos bancarios</h1>
          <p className="text-sm text-stone-500">Saldo de cada cuenta, descubierto disponible y saldo final del día.</p>
        </div>
        <form className="flex items-end gap-2">
          <div>
            <label htmlFor="fecha" className="etiqueta">Día</label>
            <input id="fecha" name="fecha" type="date" defaultValue={fecha} className="campo" />
          </div>
          <button type="submit" className="boton-secundario">Ver</button>
          {fecha !== hoy() && <Link href="/saldos" className="pb-2 text-sm underline">Hoy</Link>}
        </form>
      </div>

      {cuentas.length === 0 ? (
        <p className="tarjeta text-sm text-stone-600">Todavía no hay cuentas. Agregá las cuentas de la empresa abajo para cargar sus saldos.</p>
      ) : (
        <>
          <section className="tarjeta overflow-x-auto p-0">
            <FormularioSaldos fecha={fecha} editable={editable}>
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-4 py-3">Cuenta</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                    <th className="px-4 py-3 text-right">Descubierto acordado</th>
                    <th className="px-4 py-3 text-right">Disponible</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {cuentas.map((c) => {
                    const s = saldos.get(c.id);
                    const disponible = (s?.saldo ?? 0) + c.descubierto;
                    const usado = s && s.saldo < 0 ? -s.saldo : 0;
                    return (
                      <tr key={c.id}>
                        <td className="px-4 py-3">
                          <span className="font-medium">{c.nombre}</span>
                          <span className="block text-xs text-stone-500">
                            {[c.banco, TIPOS_CUENTA.find((x) => x.id === c.tipo)?.nombre].filter(Boolean).join(" · ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {editable ? (
                            <input
                              name={`saldo_${c.id}`}
                              inputMode="decimal"
                              aria-label={`Saldo de ${c.nombre}`}
                              // Solo se precarga si el saldo es de este día; si no, se muestra el último como referencia.
                              defaultValue={s?.fecha === fecha ? String(s.saldo).replace(".", ",") : ""}
                              placeholder={s ? String(s.saldo).replace(".", ",") : "0,00"}
                              className={`campo w-40 text-right font-mono ${s && s.saldo < 0 ? "text-red-700" : ""}`}
                            />
                          ) : (
                            <span className={`font-mono ${s && s.saldo < 0 ? "text-red-700" : ""}`}>{s ? formatoPesos(s.saldo) : "—"}</span>
                          )}
                          {s && s.fecha !== fecha && <span className="block text-xs text-amber-700">último: {formatoFecha(s.fecha)}</span>}
                          {!s && <span className="block text-xs text-amber-700">sin cargar</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-stone-600">
                          {c.descubierto ? formatoPesos(c.descubierto) : "—"}
                          {usado > 0 && c.descubierto > 0 && (
                            <span className={`block text-xs ${usado > c.descubierto ? "font-semibold text-red-700" : "text-amber-700"}`}>
                              usado {Math.round((usado / c.descubierto) * 100)}%
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-medium ${disponible < 0 ? "text-red-700" : ""}`}>{formatoPesos(disponible)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-stone-200 font-semibold">
                  <tr>
                    <td className="px-4 py-3">Total</td>
                    <td className={`px-4 py-3 text-right font-mono ${t.total < 0 ? "text-red-700" : ""}`}>{formatoPesos(t.total)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatoPesos(t.descubierto)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatoPesos(t.total + t.descubierto)}</td>
                  </tr>
                </tfoot>
              </table>
            </FormularioSaldos>
          </section>

          <section className={`tarjeta space-y-3 ${excede ? "border-red-300 bg-red-50" : ""}`}>
            <h2 className="font-semibold">Saldo final del {formatoFecha(fecha)}</h2>
            <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
              <dt className="text-stone-600">
                Saldo bancario cargado
                {t.desde && t.desde !== fecha && <span className="block text-xs text-amber-700">hay saldos de días anteriores: cargá los de hoy</span>}
              </dt>
              <dd className="text-right font-mono">{formatoPesos(t.total)}</dd>
              <dt className="text-stone-600">+ Ingresos del día</dt>
              <dd className="text-right font-mono text-green-700">{formatoPesos(ingresos)}</dd>
              <dt className="text-stone-600">− Egresos del día</dt>
              <dd className="text-right font-mono text-red-700">{formatoPesos(egresos)}</dd>
              <dt className="border-t border-stone-200 pt-1 font-semibold">Saldo final del día</dt>
              <dd className={`border-t border-stone-200 pt-1 text-right font-mono text-lg font-semibold ${final < 0 ? "text-red-700" : ""}`}>{formatoPesos(final)}</dd>
              <dt className="text-stone-600">Disponible con descubierto</dt>
              <dd className={`text-right font-mono ${final + t.descubierto < 0 ? "font-semibold text-red-700" : ""}`}>{formatoPesos(final + t.descubierto)}</dd>
            </dl>
            {excede && <p className="text-sm font-medium text-red-800">El saldo final supera el descubierto acordado.</p>}
            {!excede && final < 0 && <p className="text-sm text-amber-800">Se cierra el día usando descubierto.</p>}
            {t.sinCargar > 0 && <p className="text-xs text-amber-700">{t.sinCargar} cuenta{t.sinCargar === 1 ? "" : "s"} sin saldo cargado: no suman.</p>}

            {movimientos.length > 0 && (
              <ul className="divide-y divide-stone-100 border-t border-stone-200 text-sm">
                {movimientos.map((m) => (
                  <li key={m.origen + m.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate">{m.descripcion}</span>
                      <span className="block truncate text-xs text-stone-500">
                        {m.origen === "cheque" ? "Cheques" : `Financiero · ${m.estado}`}{m.detalle ? ` · ${m.detalle}` : ""}
                      </span>
                    </span>
                    <span className={`shrink-0 font-mono ${m.tipo === "ingreso" ? "text-green-700" : "text-red-700"}`}>
                      {m.tipo === "ingreso" ? "+" : "−"} {formatoPesos(m.monto)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {editable && (
        <section className="space-y-2">
          <h2 className="font-semibold">Cuentas</h2>
          <div className="tarjeta divide-y divide-stone-100 p-0">
            {todas.map((c) => (
              <details key={c.id} className={c.activa ? "" : "opacity-60"}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <span className={`flex-1 font-medium ${c.activa ? "" : "line-through"}`}>{c.nombre}</span>
                  <span className="text-xs text-stone-500">{c.banco}</span>
                  <span className="text-xs text-stone-500">Descubierto {formatoPesos(c.descubierto)}</span>
                  <BotonEstadoCuenta id={c.id} activa={c.activa} />
                </summary>
                <div className="border-t border-stone-100 bg-stone-50 px-4 py-4">
                  <FormularioCuenta cuenta={c} />
                </div>
              </details>
            ))}
            <details open={todas.length === 0}>
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">+ Nueva cuenta</summary>
              <div className="border-t border-stone-100 px-4 py-4">
                <FormularioCuenta />
              </div>
            </details>
          </div>
        </section>
      )}
    </div>
  );
}
