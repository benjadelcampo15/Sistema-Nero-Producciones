import Link from "next/link";
import { PLANTILLAS } from "@/lib/plantillas";

export default function PaginaPlantillas() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Plantillas Excel</h1>
        <p className="text-sm text-stone-500">
          Formatos para cargar datos en la app con un Excel. Cada plantilla trae ejemplos, una hoja de instrucciones y la lista de nombres válidos.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PLANTILLAS.map((p) => (
          <section key={p.id} className="tarjeta flex flex-col gap-3">
            <div>
              <h2 className="font-semibold">{p.nombre}</h2>
              <p className="text-sm text-stone-600">{p.descripcion}</p>
            </div>
            <p className="text-xs text-stone-500">
              Columnas: {p.columnas.map((c) => c.titulo).join(", ")}
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-3">
              <a href={`/plantillas/${p.id}`} className="boton">Descargar plantilla</a>
              <Link href={p.dondeSeSube.href} className="text-sm underline">Subirla en {p.dondeSeSube.texto}</Link>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
