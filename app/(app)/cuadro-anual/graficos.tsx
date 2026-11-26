import { formatoPesos } from "@/lib/formato";

/** "$1,2M", "$450k": importes cortos para los ejes. */
export function corto(n: number) {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1).replace(".", ",")}MM`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(".", ",")}M`;
  if (a >= 1e3) return `${s}$${Math.round(a / 1e3)}k`;
  return `${s}$${Math.round(a)}`;
}

/** Escala "linda" para el eje: 0, paso, 2·paso… hasta cubrir el máximo. */
function escala(min: number, max: number, marcas = 4) {
  const rango = Math.max(max - Math.min(min, 0), 1);
  const bruto = rango / marcas;
  const p = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= bruto) ?? bruto;
  const bajo = Math.min(0, Math.floor(min / paso) * paso);
  const alto = Math.max(paso, Math.ceil(max / paso) * paso);
  const ticks: number[] = [];
  for (let v = bajo; v <= alto + paso / 2; v += paso) ticks.push(Math.round(v));
  return { bajo, alto, ticks };
}

const VERDE = "#15803d";
const ROJO = "#b91c1c";
const GRIS = "#e7e5e4";
const TEXTO = "#78716c";

type Mes = { mes: number; nombre: string; ingresos: number; egresos: number; resultado: number; acumulado: number };

/** Ingresos y egresos por mes: barras agrupadas o líneas. Cada mes lleva a sus movimientos. */
export function GraficoMensual({ meses, vista, hrefMes }: { meses: Mes[]; vista: "barras" | "lineas"; hrefMes: (mes: number) => string }) {
  const W = 760;
  const H = 260;
  const izq = 56;
  const abajo = 26;
  const arriba = 10;
  const max = Math.max(...meses.flatMap((m) => [m.ingresos, m.egresos]), 1);
  const e = escala(0, max);
  const y = (v: number) => arriba + (H - arriba - abajo) * (1 - (v - e.bajo) / (e.alto - e.bajo));
  const ancho = (W - izq - 8) / 12;
  const x = (i: number) => izq + i * ancho;
  const barra = ancho * 0.34;
  const linea = (k: "ingresos" | "egresos") => meses.map((m, i) => `${i ? "L" : "M"}${x(i) + ancho / 2},${y(m[k])}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Ingresos y egresos por mes">
      {e.ticks.map((t) => (
        <g key={t}>
          <line x1={izq} x2={W - 8} y1={y(t)} y2={y(t)} stroke={GRIS} />
          <text x={izq - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill={TEXTO}>{corto(t)}</text>
        </g>
      ))}
      {meses.map((m, i) => (
        <a key={m.mes} href={hrefMes(m.mes)}>
          <title>{`${m.nombre}: ingresos ${formatoPesos(m.ingresos)} · egresos ${formatoPesos(m.egresos)} · resultado ${formatoPesos(m.resultado)}`}</title>
          <rect x={x(i)} y={arriba} width={ancho} height={H - arriba - abajo} fill="transparent" className="hover:fill-stone-100" />
          {vista === "barras" && (
            <>
              <rect x={x(i) + ancho / 2 - barra - 1} y={y(m.ingresos)} width={barra} height={Math.max(0, y(0) - y(m.ingresos))} rx="2" fill={VERDE} />
              <rect x={x(i) + ancho / 2 + 1} y={y(m.egresos)} width={barra} height={Math.max(0, y(0) - y(m.egresos))} rx="2" fill={ROJO} />
            </>
          )}
          <text x={x(i) + ancho / 2} y={H - 8} textAnchor="middle" fontSize="11" fill={TEXTO}>{m.nombre}</text>
        </a>
      ))}
      {vista === "lineas" && (
        <>
          <path d={linea("ingresos")} fill="none" stroke={VERDE} strokeWidth="2.5" />
          <path d={linea("egresos")} fill="none" stroke={ROJO} strokeWidth="2.5" />
          {meses.map((m, i) => (
            <g key={m.mes}>
              <circle cx={x(i) + ancho / 2} cy={y(m.ingresos)} r="3.5" fill={VERDE}><title>{`${m.nombre}: ingresos ${formatoPesos(m.ingresos)}`}</title></circle>
              <circle cx={x(i) + ancho / 2} cy={y(m.egresos)} r="3.5" fill={ROJO}><title>{`${m.nombre}: egresos ${formatoPesos(m.egresos)}`}</title></circle>
            </g>
          ))}
        </>
      )}
    </svg>
  );
}

/** Resultado de cada mes (verde o rojo) y el acumulado del año (línea). */
export function GraficoResultado({ meses, hrefMes }: { meses: Mes[]; hrefMes: (mes: number) => string }) {
  const W = 760;
  const H = 230;
  const izq = 56;
  const abajo = 26;
  const arriba = 10;
  const valores = meses.flatMap((m) => [m.resultado, m.acumulado]);
  const e = escala(Math.min(...valores, 0), Math.max(...valores, 1));
  const y = (v: number) => arriba + (H - arriba - abajo) * (1 - (v - e.bajo) / (e.alto - e.bajo));
  const ancho = (W - izq - 8) / 12;
  const x = (i: number) => izq + i * ancho;
  const acumulado = meses.map((m, i) => `${i ? "L" : "M"}${x(i) + ancho / 2},${y(m.acumulado)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Resultado mensual y acumulado">
      {e.ticks.map((t) => (
        <g key={t}>
          <line x1={izq} x2={W - 8} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#a8a29e" : GRIS} />
          <text x={izq - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill={TEXTO}>{corto(t)}</text>
        </g>
      ))}
      {meses.map((m, i) => (
        <a key={m.mes} href={hrefMes(m.mes)}>
          <title>{`${m.nombre}: resultado ${formatoPesos(m.resultado)} · acumulado ${formatoPesos(m.acumulado)}`}</title>
          <rect
            x={x(i) + ancho * 0.25}
            y={Math.min(y(m.resultado), y(0))}
            width={ancho * 0.5}
            height={Math.max(1, Math.abs(y(m.resultado) - y(0)))}
            rx="2"
            fill={m.resultado >= 0 ? VERDE : ROJO}
            opacity={m.resultado === 0 ? 0.25 : 0.85}
          />
          <text x={x(i) + ancho / 2} y={H - 8} textAnchor="middle" fontSize="11" fill={TEXTO}>{m.nombre}</text>
        </a>
      ))}
      <path d={acumulado} fill="none" stroke="#1c1917" strokeWidth="2" strokeDasharray="5 3" />
      {meses.map((m, i) => (
        <circle key={m.mes} cx={x(i) + ancho / 2} cy={y(m.acumulado)} r="3" fill="#1c1917"><title>{`Acumulado a ${m.nombre}: ${formatoPesos(m.acumulado)}`}</title></circle>
      ))}
    </svg>
  );
}

/** Barras horizontales (categorías, proveedores…), de mayor a menor. */
export function BarrasHorizontales({ filas, color, href, limite = 12 }: { filas: { id: string; nombre: string; total: number; pct: number | null }[]; color: string; href?: (id: string) => string; limite?: number }) {
  const visibles = filas.slice(0, limite);
  const max = Math.max(...visibles.map((f) => f.total), 1);
  if (!visibles.length) return <p className="py-6 text-center text-sm text-stone-500">Sin movimientos.</p>;
  return (
    <ul className="space-y-1.5">
      {visibles.map((f) => {
        const contenido = (
          <>
            <div className="flex justify-between gap-2 text-sm">
              <span className="truncate">{f.nombre}</span>
              <span className="shrink-0 font-mono">
                {formatoPesos(f.total)} <span className="text-xs text-stone-500">{f.pct === null ? "" : `${(f.pct * 100).toFixed(1).replace(".", ",")}%`}</span>
              </span>
            </div>
            <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full" style={{ width: `${Math.max(1, (f.total / max) * 100)}%`, background: color }} />
            </div>
          </>
        );
        return (
          <li key={f.id} title={`${f.nombre}: ${formatoPesos(f.total)}`}>
            {href ? <a href={href(f.id)} className="block rounded px-1 hover:bg-stone-50">{contenido}</a> : <div className="px-1">{contenido}</div>}
          </li>
        );
      })}
      {filas.length > limite && <li className="px-1 text-xs text-stone-500">y {filas.length - limite} más en la tabla</li>}
    </ul>
  );
}

/** Mini barras de los 12 meses (para ver si un gasto sube). */
export function MiniMeses({ valores, color }: { valores: number[]; color: string }) {
  const max = Math.max(...valores, 1);
  return (
    <svg viewBox="0 0 96 22" className="h-5 w-24" aria-hidden>
      {valores.map((v, i) => (
        <rect key={i} x={i * 8} y={22 - Math.max(v > 0 ? 1.5 : 0, (v / max) * 22)} width="6" height={Math.max(v > 0 ? 1.5 : 0, (v / max) * 22)} fill={color} rx="1">
          <title>{formatoPesos(v)}</title>
        </rect>
      ))}
    </svg>
  );
}
