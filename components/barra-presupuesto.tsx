export function BarraPresupuesto({ uso }: { uso: number }) {
  const porcentaje = Math.round(uso * 100);
  const color = uso > 1 ? "bg-red-600" : uso > 0.85 ? "bg-amber-500" : "bg-stone-900";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-stone-500">
        <span>Presupuesto de gastos usado</span>
        <span className={uso > 1 ? "font-semibold text-red-700" : ""}>{porcentaje}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(porcentaje, 100)}%` }} />
      </div>
    </div>
  );
}
