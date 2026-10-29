import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { leerEmpresa } from "@/lib/empresas";
import { hoy } from "@/lib/formato";
import { listarCuentasContables } from "@/lib/contabilidad/consultas";
import { SinAcceso } from "../../../sin-acceso";
import { FormularioAsiento } from "../formulario-asiento";

export default async function PaginaNuevoAsiento({ searchParams }: PageProps<"/contabilidad/asientos/nuevo">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "editar")) return <SinAcceso />;
  const { empresa } = await searchParams;
  const cuentas = (await listarCuentasContables()).filter((c) => c.imputable && c.activa);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/contabilidad" className="text-sm text-stone-500 hover:text-stone-900">← Contabilidad</Link>
        <h1 className="mt-1 text-2xl font-semibold">Nuevo asiento manual</h1>
        <p className="text-sm text-stone-500">
          Para lo que no pasa por Financiero: asiento de apertura con los saldos iniciales, amortizaciones, ajustes, pago del IVA del mes, aportes de los socios…
        </p>
      </div>
      <FormularioAsiento empresa={leerEmpresa(empresa)} fecha={hoy()} cuentas={cuentas} />
    </div>
  );
}
