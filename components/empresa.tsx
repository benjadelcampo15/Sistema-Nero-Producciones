import Link from "next/link";
import { EMPRESAS, NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";

/** Botón Nero | Ruta para cambiar de empresa en un listado (cada opción es un link). */
export function AlternarEmpresa({ actual, href }: { actual: Empresa; href: (empresa: Empresa) => string }) {
  return (
    <div className="flex rounded-full border border-stone-300 bg-white p-0.5" role="group" aria-label="Empresa">
      {EMPRESAS.map((e) => (
        <Link
          key={e}
          href={href(e)}
          aria-current={actual === e ? "page" : undefined}
          className={`rounded-full px-4 py-1 text-sm font-semibold ${actual === e ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900"}`}
        >
          {NOMBRE_EMPRESA[e]}
        </Link>
      ))}
    </div>
  );
}

/** Elegir la empresa en un formulario: define a qué financiero va. */
export function CampoEmpresa({ defecto, ayuda }: { defecto: Empresa; ayuda?: string }) {
  return (
    <fieldset>
      <legend className="etiqueta">Empresa</legend>
      <div className="flex gap-4">
        {EMPRESAS.map((e) => (
          <label key={e} className="flex items-center gap-2 text-sm">
            <input type="radio" name="empresa" value={e} defaultChecked={defecto === e} />
            {NOMBRE_EMPRESA[e]}
          </label>
        ))}
      </div>
      {ayuda && <p className="mt-1 text-xs text-stone-500">{ayuda}</p>}
    </fieldset>
  );
}

/** Etiqueta chica con la empresa. */
export function EtiquetaEmpresa({ empresa }: { empresa: Empresa }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${empresa === "ruta" ? "bg-sky-100 text-sky-800" : "bg-stone-800 text-white"}`}>
      {NOMBRE_EMPRESA[empresa]}
    </span>
  );
}
