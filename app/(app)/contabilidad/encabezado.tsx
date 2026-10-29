import Link from "next/link";
import { AlternarEmpresa } from "@/components/empresa";
import { periodosRapidos } from "@/lib/formato";
import type { Empresa } from "@/lib/empresas";
import type { Asiento, Aviso } from "@/lib/contabilidad/tipos";

/** Dónde se ve o edita lo que generó el asiento. */
export function hrefOrigen(a: Asiento) {
  if (a.origen === "movimiento") return `/financiero/${a.origenId}/editar`;
  if (a.origen === "cheque") return "/cheques";
  return `/contabilidad/asientos/${a.origenId}`;
}

const PESTANAS = [
  { href: "/contabilidad", nombre: "Libro diario" },
  { href: "/contabilidad/mayor", nombre: "Mayor" },
  { href: "/contabilidad/sumas", nombre: "Sumas y saldos" },
  { href: "/contabilidad/estados", nombre: "Estados contables" },
  { href: "/contabilidad/plan", nombre: "Plan de cuentas" },
  { href: "/contabilidad/imputacion", nombre: "Imputación" },
] as const;

type Props = {
  actual: (typeof PESTANAS)[number]["href"];
  empresa?: Empresa;
  periodo?: { desde: string; hasta: string };
  /** Otros parámetros que se conservan al cambiar de empresa o período (ej.: la cuenta del mayor). */
  extra?: Record<string, string>;
  acciones?: React.ReactNode;
};

export function EncabezadoContabilidad({ actual, empresa, periodo, extra = {}, acciones }: Props) {
  const consulta = (cambios: Record<string, string>) =>
    new URLSearchParams({ ...extra, ...(empresa ? { empresa } : {}), ...(periodo ?? {}), ...cambios }).toString();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Contabilidad</h1>
          {empresa && <AlternarEmpresa actual={empresa} href={(e) => `${actual}?${consulta({ empresa: e })}`} />}
        </div>
        {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-stone-200" aria-label="Contabilidad">
        {PESTANAS.map((p) => (
          <Link
            key={p.href}
            href={empresa && p.href !== "/contabilidad/plan" && p.href !== "/contabilidad/imputacion" ? `${p.href}?${new URLSearchParams({ empresa, ...(periodo ?? {}) })}` : p.href}
            aria-current={p.href === actual ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${p.href === actual ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-900"}`}
          >
            {p.nombre}
          </Link>
        ))}
      </nav>

      {periodo && empresa && (
        <form className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="empresa" value={empresa} />
          {Object.entries(extra).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <div>
            <label htmlFor="desde" className="etiqueta">Desde</label>
            <input id="desde" name="desde" type="date" defaultValue={periodo.desde} className="campo" />
          </div>
          <div>
            <label htmlFor="hasta" className="etiqueta">Hasta</label>
            <input id="hasta" name="hasta" type="date" defaultValue={periodo.hasta} className="campo" />
          </div>
          <button type="submit" className="boton-secundario">Ver</button>
          <div className="flex flex-wrap gap-1 pb-1">
            {periodosRapidos().map((p) => (
              <Link key={p.nombre} href={`${actual}?${consulta({ desde: p.desde, hasta: p.hasta })}`} className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-600 hover:border-stone-900 hover:text-stone-900">
                {p.nombre}
              </Link>
            ))}
          </div>
        </form>
      )}
    </div>
  );
}

/** Lo que conviene revisar para que la contabilidad quede completa. */
export function Avisos({ avisos }: { avisos: Aviso[] }) {
  if (!avisos.length) return null;
  return (
    <details className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <summary className="cursor-pointer font-medium">Para revisar ({avisos.length})</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {avisos.map((a) => (
          <li key={a.texto}>
            <span className="font-mono font-semibold">{a.cantidad}</span> {a.texto}
            {a.href && (
              <>
                {" "}
                · <Link href={a.href} className="underline">ir</Link>
              </>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Importe para tablas contables: vacío si es cero. */
export function Importe({ valor, className = "" }: { valor: number; className?: string }) {
  if (!valor) return <span className={className} />;
  return <span className={`font-mono ${className}`}>{valor.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
}

/** Saldo con D (deudor) o A (acreedor). */
export function Saldo({ valor }: { valor: number }) {
  if (!valor) return <span className="font-mono text-stone-400">0,00</span>;
  return (
    <span className="whitespace-nowrap font-mono">
      <Importe valor={Math.abs(valor)} /> <span className="text-xs text-stone-500">{valor > 0 ? "D" : "A"}</span>
    </span>
  );
}
