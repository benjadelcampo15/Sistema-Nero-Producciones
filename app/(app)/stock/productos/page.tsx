import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarProductos } from "@/lib/stock/consultas";
import { formatoCantidad } from "@/lib/stock/tipos";
import { SinAcceso } from "../../sin-acceso";
import { NavegacionStock } from "../navegacion";
import { BotonEstadoProducto, FormularioProducto } from "./controles";

export default async function PaginaProductos() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "stock", "editar");
  const productos = await listarProductos({ incluirInactivos: true });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Stock</h1>
      <NavegacionStock actual="/stock/productos" />

      {editable && (
        <section className="tarjeta space-y-3">
          <h2 className="font-semibold">Nuevo producto</h2>
          <FormularioProducto />
        </section>
      )}

      <section className="tarjeta divide-y divide-stone-100 p-0">
        {productos.length === 0 && <p className="p-6 text-center text-sm text-stone-500">Todavía no hay productos.</p>}
        {productos.map((p) =>
          editable ? (
            <details key={p.id} className={p.activo ? "" : "opacity-60"}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 px-4 py-3 text-sm">
                <span className={`font-medium ${p.activo ? "" : "line-through"}`}>{p.nombre}</span>
                <span className="text-stone-500">{p.unidad}</span>
                {p.codigo && <span className="font-mono text-xs text-stone-400">{p.codigo}</span>}
                {p.stock_minimo > 0 && <span className="text-xs text-stone-500">mín. {formatoCantidad(p.stock_minimo)}</span>}
                <span className="ml-auto">
                  <BotonEstadoProducto id={p.id} activo={p.activo} />
                </span>
              </summary>
              <div className="border-t border-stone-100 bg-stone-50 px-4 py-3">
                <FormularioProducto producto={p} />
              </div>
            </details>
          ) : (
            <div key={p.id} className="flex gap-3 px-4 py-3 text-sm">
              <span className="font-medium">{p.nombre}</span>
              <span className="text-stone-500">{p.unidad}</span>
            </div>
          ),
        )}
      </section>
    </div>
  );
}
