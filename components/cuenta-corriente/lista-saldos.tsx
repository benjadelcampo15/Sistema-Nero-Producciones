import Link from "next/link";
import { AlternarEmpresa } from "@/components/empresa";
import { NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";
import { formatoPesos, sumar } from "@/lib/formato";

/** Lista de cuentas corrientes con saldo (proveedores o clientes) de una empresa. */
export function ListaSaldos({
  empresa,
  ruta,
  ficha,
  fichas,
  texto,
}: {
  empresa: Empresa;
  /** Esta misma página (para cambiar de empresa). */
  ruta: string;
  /** Ficha: se le agrega "/<id>". */
  ficha: string;
  fichas: { id: string; nombre: string; documento: string; saldo: number }[];
  /** "Le debemos" o "Nos deben". */
  texto: string;
}) {
  const conSaldo = fichas.filter((f) => f.saldo > 0).sort((a, b) => b.saldo - a.saldo);
  const total = sumar(conSaldo.map((f) => f.saldo));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AlternarEmpresa actual={empresa} href={(e) => `${ruta}?empresa=${e}`} />
        <p className="text-sm">
          {texto} en total: <span className="font-mono text-lg font-semibold">{formatoPesos(total)}</span>
        </p>
      </div>
      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">CUIT / DNI</th>
              <th className="px-4 py-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {conSaldo.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-stone-500">No hay saldos pendientes con {NOMBRE_EMPRESA[empresa]}.</td>
              </tr>
            )}
            {conSaldo.map((f) => (
              <tr key={f.id} className="hover:bg-stone-50">
                <td className="px-4 py-2">
                  <Link href={`${ficha}/${f.id}?empresa=${empresa}#cuenta`} className="font-medium underline decoration-stone-300 hover:decoration-stone-900">{f.nombre}</Link>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-stone-600">{f.documento}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono font-semibold">{formatoPesos(f.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
