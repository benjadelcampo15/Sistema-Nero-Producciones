import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { leerEmpresa } from "@/lib/empresas";
import { formatoFecha, sumar } from "@/lib/formato";
import { calcularSaldos, leerPeriodo, obtenerLibro } from "@/lib/contabilidad/consultas";
import { esDeResultado } from "@/lib/contabilidad/tipos";
import { SinAcceso } from "../../sin-acceso";
import { EncabezadoContabilidad, Importe, Saldo, hrefOrigen } from "../encabezado";

export default async function PaginaMayor({ searchParams }: PageProps<"/contabilidad/mayor">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const params = await searchParams;
  const empresa = leerEmpresa(params.empresa);
  const periodo = leerPeriodo(params, "mes");
  const libro = await obtenerLibro(empresa, periodo.hasta);
  const cuenta = typeof params.cuenta === "string" ? libro.cuentaPorId.get(params.cuenta) : undefined;
  const consulta = (c: string) => `/contabilidad/mayor?${new URLSearchParams({ empresa, ...periodo, cuenta: c })}`;

  const encabezado = (
    <EncabezadoContabilidad
      actual="/contabilidad/mayor"
      empresa={empresa}
      periodo={periodo}
      extra={cuenta ? { cuenta: cuenta.id } : {}}
      acciones={
        cuenta && (
          <a href={`/contabilidad/exportar?${new URLSearchParams({ vista: "mayor", empresa, ...periodo, cuenta: cuenta.id })}`} className="boton-secundario">
            Exportar a Excel
          </a>
        )
      }
    />
  );

  const selector = (
    <form className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="empresa" value={empresa} />
      <input type="hidden" name="desde" value={periodo.desde} />
      <input type="hidden" name="hasta" value={periodo.hasta} />
      <div className="min-w-72 flex-1">
        <label htmlFor="cuenta" className="etiqueta">Cuenta</label>
        <select id="cuenta" name="cuenta" defaultValue={cuenta?.id ?? ""} className="campo">
          <option value="">Elegí una cuenta…</option>
          {libro.cuentas
            .filter((c) => c.imputable)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.nombre}
              </option>
            ))}
        </select>
      </div>
      <button type="submit" className="boton-secundario">Ver mayor</button>
    </form>
  );

  if (!cuenta || !cuenta.imputable) {
    // Sin cuenta elegida: las que tienen saldo o movimientos en el período.
    const filas = calcularSaldos(libro, periodo.desde, periodo.hasta).filter((f) => f.cuenta.imputable && (f.inicial || f.debe || f.haber));
    return (
      <div className="space-y-6">
        {encabezado}
        {selector}
        <section className="tarjeta overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Cuenta</th>
                <th className="px-4 py-3 text-right">Debe</th>
                <th className="px-4 py-3 text-right">Haber</th>
                <th className="px-4 py-3 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-stone-500">No hay cuentas con movimientos.</td>
                </tr>
              )}
              {filas.map((f) => (
                <tr key={f.cuenta.id} className="hover:bg-stone-50">
                  <td className="px-4 py-2">
                    <Link href={consulta(f.cuenta.id)} className="underline decoration-stone-300 hover:decoration-stone-900">
                      <span className="font-mono text-xs text-stone-500">{f.cuenta.codigo}</span> {f.cuenta.nombre}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right"><Importe valor={f.debe} /></td>
                  <td className="px-4 py-2 text-right"><Importe valor={f.haber} /></td>
                  <td className="px-4 py-2 text-right"><Saldo valor={f.final} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    );
  }

  // Saldo anterior: todo lo previo al período (las de resultado, solo desde el inicio del ejercicio).
  const inicioEjercicio = `${periodo.desde.slice(0, 4)}-01-01`;
  const anteriores: number[] = [];
  const movimientos: { asiento: (typeof libro.asientos)[number]; debe: number; haber: number; detalle: string | null }[] = [];
  for (const a of libro.asientos) {
    for (const l of a.lineas) {
      if (l.cuenta_id !== cuenta.id) continue;
      if (a.fecha >= periodo.desde) movimientos.push({ asiento: a, debe: l.debe, haber: l.haber, detalle: l.detalle });
      else if (!esDeResultado(cuenta.codigo) || a.fecha >= inicioEjercicio) anteriores.push(l.debe - l.haber);
    }
  }
  let saldo = sumar(anteriores);
  const inicial = saldo;
  const filas = movimientos.map((m) => {
    saldo = sumar([saldo, m.debe, -m.haber]);
    return { ...m, saldo };
  });

  return (
    <div className="space-y-6">
      {encabezado}
      {selector}
      <h2 className="text-lg font-semibold">
        <span className="font-mono text-stone-500">{cuenta.codigo}</span> {cuenta.nombre}
      </h2>
      <section className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Concepto</th>
              <th className="px-4 py-3 text-right">Debe</th>
              <th className="px-4 py-3 text-right">Haber</th>
              <th className="px-4 py-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            <tr className="bg-stone-50/60">
              <td className="px-4 py-2 text-stone-500">{formatoFecha(periodo.desde)}</td>
              <td className="px-4 py-2 text-stone-500" colSpan={3}>Saldo anterior</td>
              <td className="px-4 py-2 text-right"><Saldo valor={inicial} /></td>
            </tr>
            {filas.map((f, i) => (
              <tr key={`${f.asiento.id}-${i}`} className="hover:bg-stone-50">
                <td className="whitespace-nowrap px-4 py-2">{formatoFecha(f.asiento.fecha)}</td>
                <td className="px-4 py-2">
                  <Link href={hrefOrigen(f.asiento)} className="underline decoration-stone-300 hover:decoration-stone-900">{f.asiento.descripcion}</Link>
                  {f.detalle && <span className="text-xs text-stone-500"> · {f.detalle}</span>}
                </td>
                <td className="px-4 py-2 text-right"><Importe valor={f.debe} /></td>
                <td className="px-4 py-2 text-right"><Importe valor={f.haber} /></td>
                <td className="px-4 py-2 text-right"><Saldo valor={f.saldo} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-300 font-semibold">
            <tr>
              <td className="px-4 py-3" colSpan={2}>Saldo al {formatoFecha(periodo.hasta)}</td>
              <td className="px-4 py-3 text-right"><Importe valor={sumar(filas.map((f) => f.debe))} /></td>
              <td className="px-4 py-3 text-right"><Importe valor={sumar(filas.map((f) => f.haber))} /></td>
              <td className="px-4 py-3 text-right"><Saldo valor={saldo} /></td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}

