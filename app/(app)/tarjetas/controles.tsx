import { formatoPesos } from "@/lib/formato";
import { formatoDolares, type Control } from "@/lib/tarjetas/tipos";

/** Los controles contra los totales del PDF: verde si cierra, rojo con la diferencia si no. */
export function Controles({ controles }: { controles: Control[] }) {
  if (!controles.length) {
    return <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">El PDF no trajo totales para controlar: revisá los renglones contra el resumen.</p>;
  }
  const formato = (c: Control, n: number) => (c.moneda === "pesos" ? formatoPesos(n) : formatoDolares(n));
  return (
    <ul className="space-y-1 text-sm">
      {controles.map((c) => (
        <li
          key={c.concepto}
          className={`rounded-md border px-3 py-2 ${c.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}
        >
          {c.ok ? "✓" : "✗"} {c.concepto}: {c.ok ? `coincide (${formato(c, c.esperado)})` : `el PDF dice ${formato(c, c.esperado)} y los renglones suman ${formato(c, c.calculado)} (diferencia ${formato(c, Math.round((c.esperado - c.calculado) * 100) / 100)})`}
        </li>
      ))}
    </ul>
  );
}
