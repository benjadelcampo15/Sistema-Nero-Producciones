import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { hoy } from "@/lib/formato";
import { listarCuentasContables, obtenerAsientoManual } from "@/lib/contabilidad/consultas";
import { SinAcceso } from "../../../sin-acceso";
import { FormularioAsiento } from "../formulario-asiento";

export default async function PaginaAsiento({ params }: PageProps<"/contabilidad/asientos/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "financiero", "editar");
  const { id } = await params;
  const [asiento, todas] = await Promise.all([obtenerAsientoManual(id), listarCuentasContables()]);
  if (!asiento) notFound();
  // Las cuentas del asiento siempre aparecen, aunque se hayan desactivado después.
  const usadas = new Set(asiento.lineas.map((l) => l.cuenta_id));
  const cuentas = todas.filter((c) => (c.imputable && c.activa) || usadas.has(c.id));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/contabilidad?empresa=${asiento.empresa}`} className="text-sm text-stone-500 hover:text-stone-900">← Contabilidad</Link>
        <h1 className="mt-1 text-2xl font-semibold">Asiento manual</h1>
      </div>
      {editable ? (
        <FormularioAsiento asiento={asiento} empresa={asiento.empresa} fecha={hoy()} cuentas={cuentas} />
      ) : (
        <fieldset disabled>
          <FormularioAsiento asiento={asiento} empresa={asiento.empresa} fecha={hoy()} cuentas={cuentas} />
        </fieldset>
      )}
    </div>
  );
}
