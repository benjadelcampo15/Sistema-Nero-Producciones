import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarCuentasContables, obtenerImputacion } from "@/lib/contabilidad/consultas";
import { CLAVES_IMPUTACION, type CuentaContable } from "@/lib/contabilidad/tipos";
import { SinAcceso } from "../../sin-acceso";
import { EncabezadoContabilidad } from "../encabezado";
import { FormularioImputacion } from "./formulario";

export default async function PaginaImputacion() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "financiero", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "financiero", "editar");
  const [cuentas, { categorias, bancos, claves }] = await Promise.all([listarCuentasContables(), obtenerImputacion()]);
  const imputables = cuentas.filter((c) => c.imputable && c.activa);
  const grupos = [...new Set(CLAVES_IMPUTACION.map((c) => c.grupo))];

  return (
    <div className="space-y-6">
      <EncabezadoContabilidad actual="/contabilidad/imputacion" />
      <p className="text-sm text-stone-500">
        A qué cuenta va cada movimiento de Financiero. La categoría define la cuenta de ingreso o gasto; el medio de pago (o la cuenta bancaria, si el movimiento está
        conciliado con un extracto), de dónde sale o adónde entra la plata. Los cambios se aplican a todos los asientos automáticos, también a los de meses anteriores.
      </p>

      <FormularioImputacion editable={editable}>
        <div className="grid gap-6 lg:grid-cols-2">
          {(["ingreso", "egreso"] as const).map((tipo) => (
            <section key={tipo} className="tarjeta space-y-3">
              <h2 className="font-semibold">Categorías de {tipo === "ingreso" ? "ingresos" : "egresos"}</h2>
              {categorias
                .filter((c) => c.tipo === tipo)
                .map((c) => (
                  <Fila key={c.id} nombre={c.nombre} apagado={!c.activa} campo={`cat_${c.id}`} valor={c.cuenta_contable_id} cuentas={imputables} opcional />
                ))}
            </section>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="tarjeta space-y-3">
            <h2 className="font-semibold">Cuentas bancarias</h2>
            <p className="text-xs text-stone-500">Para los movimientos conciliados con un extracto de esa cuenta.</p>
            {bancos.map((b) => (
              <Fila key={b.id} nombre={b.banco && b.banco !== b.nombre ? `${b.nombre} (${b.banco})` : b.nombre} apagado={!b.activa} campo={`banco_${b.id}`} valor={b.cuenta_contable_id} cuentas={imputables} opcional />
            ))}
          </section>

          {grupos.map((g) => (
            <section key={g} className="tarjeta space-y-3">
              <h2 className="font-semibold">{g}</h2>
              {CLAVES_IMPUTACION.filter((c) => c.grupo === g).map((c) => (
                <Fila key={c.clave} nombre={c.nombre} campo={`clave_${c.clave}`} valor={claves[c.clave] ?? null} cuentas={imputables} />
              ))}
            </section>
          ))}
        </div>
      </FormularioImputacion>
    </div>
  );
}

function Fila({ nombre, campo, valor, cuentas, opcional = false, apagado = false }: { nombre: string; campo: string; valor: string | null; cuentas: CuentaContable[]; opcional?: boolean; apagado?: boolean }) {
  return (
    <div className="grid items-center gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:gap-3">
      <label htmlFor={campo} className={`text-sm ${apagado ? "text-stone-400" : ""}`}>
        {nombre}
        {apagado && " (inactiva)"}
      </label>
      <select id={campo} name={campo} defaultValue={valor ?? ""} required={!opcional} className={`campo ${!valor ? "border-amber-400" : ""}`}>
        {opcional && <option value="">Sin cuenta (va a “a clasificar”)</option>}
        {cuentas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.codigo} · {c.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
