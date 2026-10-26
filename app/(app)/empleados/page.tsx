import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { enviosParaRevisar, listarPersonal, obtenerFormulario } from "@/lib/empleados/consultas";
import { CAMPOS_PERSONA, nombreCompleto } from "@/lib/empleados/tipos";
import { formatoFecha } from "@/lib/formato";
import { urlBase } from "@/lib/url";
import { SinAcceso } from "../sin-acceso";
import { NavegacionEmpleados } from "./navegacion";
import { AccionesEnvio, FormularioPersona, LinkFormulario, ListaPersonal } from "./componentes";

export default async function PaginaEmpleados() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "operativa", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "operativa", "editar");

  const [personal, envios, formulario, base] = await Promise.all([listarPersonal(), enviosParaRevisar(), obtenerFormulario(), urlBase()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Empleados</h1>
        <p className="text-sm text-stone-500">Personal de los eventos: sus datos y los seguros por evento.</p>
      </div>
      <NavegacionEmpleados actual="/empleados" />

      {editable && <LinkFormulario url={formulario ? `${base}/p/alta/${formulario.token}` : null} abierto={formulario?.abierto ?? false} />}

      {envios.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Para revisar ({envios.length})</h2>
          <p className="text-sm text-stone-500">Personas que ya estaban cargadas mandaron datos por el formulario. Revisá los cambios antes de pasarlos a su ficha.</p>
          <div className="space-y-3">
            {envios.map((e) => {
              const cambios = e.persona
                ? CAMPOS_PERSONA.filter((c) => e.datos[c.id] && e.datos[c.id] !== e.persona![c.id])
                : [];
              return (
                <div key={e.id} className="tarjeta space-y-2 border-amber-200 bg-amber-50/50 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {e.persona ? nombreCompleto(e.persona) : "—"} <span className="font-normal text-stone-500">· DNI {e.datos.dni} · {formatoFecha(e.creado_en.slice(0, 10))}</span>
                    </p>
                    {editable && <AccionesEnvio id={e.id} hayCambios={cambios.length > 0} />}
                  </div>
                  {cambios.length ? (
                    <table className="w-full text-xs">
                      <tbody>
                        {cambios.map((c) => (
                          <tr key={c.id} className="border-t border-amber-100">
                            <td className="py-1 pr-3 text-stone-500">{c.nombre}</td>
                            <td className="py-1 pr-3 text-stone-500 line-through">{(e.persona?.[c.id] as string | null) ?? "—"}</td>
                            <td className="py-1 font-medium">{e.datos[c.id]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-xs text-stone-500">Mandó los mismos datos que ya tenía.</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {editable && (
        <details className="tarjeta">
          <summary className="cursor-pointer font-semibold">+ Agregar empleado a mano</summary>
          <div className="mt-4">
            <FormularioPersona />
          </div>
        </details>
      )}

      <ListaPersonal personal={personal} editable={editable} />
    </div>
  );
}
