import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarCuentasContables } from "@/lib/contabilidad/consultas";
import { SinAcceso } from "../../sin-acceso";
import { EncabezadoContabilidad } from "../encabezado";
import { FilaCuenta, FormularioCuentaContable } from "./controles";

export default async function PaginaPlanDeCuentas() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "financiero", "editar");
  const cuentas = await listarCuentasContables();

  return (
    <div className="space-y-6">
      <EncabezadoContabilidad actual="/contabilidad/plan" />
      <p className="text-sm text-stone-500">
        El plan es el mismo para Nero y para Ruta. El código arma la jerarquía y el primer número define el tipo: 1 activo, 2 pasivo, 3 patrimonio neto, 4 ingresos, 5
        egresos. Los rubros agrupan; los asientos van a las cuentas imputables. Las cuentas no se borran: se desactivan.
      </p>

      {editable && (
        <section className="tarjeta space-y-3">
          <h2 className="font-semibold">Nueva cuenta</h2>
          <FormularioCuentaContable />
        </section>
      )}

      <section className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Cuenta</th>
              <th className="px-4 py-3">Tipo</th>
              {editable && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {cuentas.map((c) => (
              <FilaCuenta key={c.id} cuenta={c} nivel={c.codigo.split(".").length - 1} editable={editable} />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
