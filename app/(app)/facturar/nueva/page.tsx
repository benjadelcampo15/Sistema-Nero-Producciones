import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { configuracionArca, entornoConfigurado } from "@/lib/arca/config";
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

  const realDisponible = entornoConfigurado("produccion");
  const puntoVenta = {
    homologacion: (entornoConfigurado("homologacion") && configuracionArca("homologacion").puntoVentaSugerido) || 1,
    produccion: realDisponible ? configuracionArca("produccion").puntoVentaSugerido : null,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Nueva factura</h1>
      <FormularioFactura
        eventos={eventos}
        categorias={categorias.filter((c) => c.tipo === "ingreso")}
        puedeRegistrarIngreso={registraIngreso}
        realDisponible={realDisponible}
        puntoVenta={puntoVenta}
      />
    </div>
  );
}
