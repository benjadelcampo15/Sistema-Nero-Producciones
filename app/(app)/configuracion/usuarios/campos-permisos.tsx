import { NIVELES, NOMBRE_NIVEL, SECCIONES, type Permisos } from "@/lib/permisos";

/** Selector de nivel por sección + casilla de administrador, para usar dentro de un <form>. */
export function CamposPermisos({
  permisos,
  esAdmin,
  bloquearAdmin = false,
}: {
  permisos: Permisos;
  esAdmin: boolean;
  bloquearAdmin?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {SECCIONES.map((s) => (
          <div key={s.id}>
            <label htmlFor={`permiso_${s.id}`} className="etiqueta">{s.nombre}</label>
            <select id={`permiso_${s.id}`} name={`permiso_${s.id}`} defaultValue={permisos[s.id]} className="campo">
              {NIVELES.map((n) => (
                <option key={n} value={n}>{NOMBRE_NIVEL[n]}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="es_admin"
          defaultChecked={esAdmin}
          disabled={bloquearAdmin}
          className="mt-0.5"
        />
        {/* Una casilla deshabilitada no se envía: se replica el valor en un campo oculto. */}
        {bloquearAdmin && esAdmin && <input type="hidden" name="es_admin" value="on" />}
        <span>
          <span className="font-medium">Administrador</span>
          <span className="block text-stone-500">Acceso total a todas las secciones y gestión de usuarios.</span>
        </span>
      </label>
    </div>
  );
}
