import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarDepositos } from "@/lib/stock/consultas";
import { SinAcceso } from "../../sin-acceso";
import { NavegacionStock } from "../navegacion";
import { BotonEstadoDeposito, FormularioDeposito } from "./controles";

export default async function PaginaDepositos() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "stock", "editar");
  const depositos = await listarDepositos({ incluirInactivos: true });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Stock</h1>
      <NavegacionStock actual="/stock/depositos" />

      {editable && <FormularioDeposito />}

      <ul className="tarjeta divide-y divide-stone-100 p-0">
        {depositos.map((d) => (
          <li key={d.id} className={`flex items-center gap-3 px-4 py-3 text-sm ${d.activo ? "" : "opacity-60"}`}>
            <span className={`font-medium ${d.activo ? "" : "line-through"}`}>{d.nombre}</span>
            {d.direccion && <span className="text-stone-500">{d.direccion}</span>}
            {editable && (
              <span className="ml-auto">
                <BotonEstadoDeposito id={d.id} activo={d.activo} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
