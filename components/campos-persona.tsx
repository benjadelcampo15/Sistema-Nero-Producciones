import type { Persona } from "@/lib/empleados/tipos";

/** "20123456789" → "20-12345678-9" (y a medida que se escribe: "20-123…"). */
function conGuiones(valor: string) {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length > 10) return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
  if (d.length > 2) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return d;
}

/** Campos de datos del empleado: los usa el formulario público y la ficha en la app. */
export function CamposPersona({ persona, v, sufijo = "" }: { persona?: Partial<Persona>; v: (campo: string, inicial: string) => string; sufijo?: string }) {
  const campo = (id: keyof Persona, inicial = "") => v(id, (persona?.[id] as string | null | undefined) ?? inicial);
  const idDe = (id: string) => `${id}${sufijo}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor={idDe("nombre")} className="etiqueta">Nombre</label>
        <input id={idDe("nombre")} name="nombre" required maxLength={80} autoComplete="given-name" defaultValue={campo("nombre")} className="campo" />
      </div>
      <div>
        <label htmlFor={idDe("apellido")} className="etiqueta">Apellido</label>
        <input id={idDe("apellido")} name="apellido" required maxLength={80} autoComplete="family-name" defaultValue={campo("apellido")} className="campo" />
      </div>
      <div>
        <label htmlFor={idDe("dni")} className="etiqueta">DNI</label>
        <input id={idDe("dni")} name="dni" required inputMode="numeric" maxLength={12} placeholder="Sin puntos" defaultValue={campo("dni")} className="campo font-mono" />
      </div>
      <div>
        <label htmlFor={idDe("cuil")} className="etiqueta">CUIL</label>
        <input
          id={idDe("cuil")}
          name="cuil"
          inputMode="numeric"
          maxLength={13}
          placeholder="20-12345678-9"
          defaultValue={conGuiones(campo("cuil"))}
          // Los guiones se ponen solos al escribir.
          onChange={(e) => {
            e.target.value = conGuiones(e.target.value);
          }}
          className="campo font-mono"
        />
      </div>
      <div>
        <label htmlFor={idDe("fecha_nacimiento")} className="etiqueta">Fecha de nacimiento</label>
        <input id={idDe("fecha_nacimiento")} name="fecha_nacimiento" type="date" autoComplete="bday" defaultValue={campo("fecha_nacimiento")} className="campo" />
      </div>
      <div>
        <label htmlFor={idDe("telefono")} className="etiqueta">Teléfono</label>
        <input id={idDe("telefono")} name="telefono" type="tel" maxLength={40} autoComplete="tel" defaultValue={campo("telefono")} className="campo" />
      </div>
      <div>
        <label htmlFor={idDe("email")} className="etiqueta">Email</label>
        <input id={idDe("email")} name="email" type="email" maxLength={120} autoComplete="email" defaultValue={campo("email")} className="campo" />
      </div>
      <div>
        <label htmlFor={idDe("domicilio")} className="etiqueta">Domicilio</label>
        <input id={idDe("domicilio")} name="domicilio" maxLength={200} autoComplete="street-address" defaultValue={campo("domicilio")} className="campo" />
      </div>
      <div>
        <label htmlFor={idDe("contacto_emergencia")} className="etiqueta">Contacto de emergencia</label>
        <input id={idDe("contacto_emergencia")} name="contacto_emergencia" maxLength={200} placeholder="Nombre y teléfono" defaultValue={campo("contacto_emergencia")} className="campo" />
      </div>
      <div>
        <label htmlFor={idDe("alias_cbu")} className="etiqueta">Alias o CBU</label>
        <input id={idDe("alias_cbu")} name="alias_cbu" maxLength={60} defaultValue={campo("alias_cbu")} className="campo font-mono" />
      </div>
    </div>
  );
}
