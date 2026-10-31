import { formatoFechaHora } from "@/lib/formato";

/** Aviso de algo eliminado: sigue en el historial pero no cuenta para el stock. */
export function NotaEliminado({ en, motivo }: { en: string; motivo: string | null }) {
  return (
    <span className="mt-1 block text-xs font-medium text-red-700">
      Eliminado el {formatoFechaHora(en)}
      {motivo && <span className="font-normal">: {motivo}</span>}
    </span>
  );
}

export function EtiquetaEliminado() {
  return <span className="ml-1 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600">Eliminado</span>;
}
