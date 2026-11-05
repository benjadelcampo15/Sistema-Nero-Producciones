import Link from "next/link";
import { centralConfigurada } from "@/lib/solicitudes/central";
import { SinConfigurar } from "../sin-configurar";
import { FormularioSolicitud } from "./formulario";

export default function PaginaNuevaSolicitud() {
  if (!centralConfigurada()) return <SinConfigurar />;
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/solicitudes" className="text-sm text-stone-500 hover:text-stone-900">← Solicitudes</Link>
        <h1 className="mt-1 text-2xl font-semibold">Nueva solicitud</h1>
        <p className="text-sm text-stone-500">Contanos qué necesitás. El equipo de Planix la evalúa y te responde por acá.</p>
      </div>
      <FormularioSolicitud />
      <p className="text-xs text-stone-500">Crear una solicitud no implica su aprobación ni garantiza su desarrollo.</p>
    </div>
  );
}
