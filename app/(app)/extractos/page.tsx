import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarCuentas, listarExtractos } from "@/lib/extractos/consultas";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../sin-acceso";
import { SubidaExtracto } from "./subida";

export default async function PaginaExtractos() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "financiero", "editar");
  const [cuentas, extractos] = await Promise.all([listarCuentas(), listarExtractos()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Extractos bancarios</h1>
        <p className="text-sm text-stone-500">
          Subí el extracto de una cuenta y conciliá cada movimiento del banco con Financiero: lo que coincide pasa a real, lo que falta se carga y lo que no
          corresponde se ignora.
        </p>
      </div>

      {editable &&
        (cuentas.some((c) => c.activa) ? (
          <SubidaExtracto
            cuentas={cuentas
              .filter((c) => c.activa)
              .map((c) => ({ id: c.id, nombre: c.nombre, banco: c.banco, formato: c.formato_extracto }))}
          />
        ) : (
          <p className="tarjeta text-sm text-stone-600">
            Primero agregá las cuentas en <Link href="/saldos" className="underline">Saldos bancarios</Link>.
          </p>
        ))}

      <section className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Cuenta</th>
              <th className="px-4 py-3">Período</th>
              <th className="px-4 py-3">Archivo</th>
              <th className="px-4 py-3 text-right">Saldo final</th>
              <th className="px-4 py-3 text-right">Movimientos</th>
              <th className="px-4 py-3">Conciliación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {extractos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-stone-500">Todavía no se subió ningún extracto.</td>
              </tr>
            )}
            {extractos.map((e) => (
              <tr key={e.id} className="hover:bg-stone-50">
                <td className="px-4 py-2 font-medium">
                  <Link href={`/extractos/${e.id}`} className="underline decoration-stone-300 hover:decoration-stone-900">{e.cuenta}</Link>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-stone-600">{formatoFecha(e.desde)} al {formatoFecha(e.hasta)}</td>
                <td className="max-w-56 truncate px-4 py-2 text-stone-600">{e.archivo_nombre}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{e.saldo_final === null ? "—" : formatoPesos(e.saldo_final)}</td>
                <td className="px-4 py-2 text-right font-mono">{e.lineas}</td>
                <td className="px-4 py-2">
                  {e.pendientes === 0 ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Completa</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{e.pendientes} pendientes</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
