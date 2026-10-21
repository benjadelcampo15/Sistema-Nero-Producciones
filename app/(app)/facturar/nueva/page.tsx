import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerCategorias, obtenerEventosResumidos } from "@/lib/financiero/consultas";
import { SinAcceso } from "../../sin-acceso";
import { FormularioFactura } from "./formulario-factura";

export default async function PaginaNuevaFactura() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturar", "editar")) return <SinAcceso />;

  const registraIngreso = puede(usuario, "financiero", "editar");
  const [eventos, categorias] = await Promise.all([
    obtenerEventosResumidos(),
    registraIngreso ? obtenerCategorias() : [],
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Nueva factura</h1>
      <FormularioFactura
        eventos={eventos}
        categorias={categorias.filter((c) => c.tipo === "ingreso")}
        puedeRegistrarIngreso={registraIngreso}
        entorno={process.env.ARCA_ENTORNO ?? "homologacion"}
      />
    </div>
  );
}
