import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { SinAcceso } from "../../sin-acceso";
import { NavegacionStock } from "../navegacion";
import { Importador } from "./importador";

export default async function PaginaImportarStock() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "editar")) return <SinAcceso />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Stock</h1>
        <p className="text-sm text-stone-500">
          Cargá movimientos o productos con un Excel. Primero se revisan todas las filas; se graba solo si están todas bien.
        </p>
      </div>
      <NavegacionStock actual="/stock/importar" />
      <Importador tipo="stock-movimientos" />
      <Importador tipo="stock-productos" />
    </div>
  );
}
