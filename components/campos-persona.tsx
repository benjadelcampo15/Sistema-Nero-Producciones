import { telefonoNacional, type Persona } from "@/lib/empleados/tipos";

const soloNumeros = (valor: string) => valor.replace(/\D/g, "");

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
        <input
          id={idDe("dni")}
          name="dni"
          required
          inputMode="numeric"
          pattern="\d{7,8}"
          title="7 u 8 números, sin puntos"
          placeholder="12345678"
          defaultValue={soloNumeros(campo("dni"))}
          // Solo números: se limpia antes de limitar, para que pegar "12.345.678" no lo corte.
          onChange={(e) => {
            e.target.value = soloNumeros(e.target.value).slice(0, 8);
          }}
          className="campo font-mono"
        />
        <p className="mt-1 text-xs text-stone-500">Solo números, sin puntos (7 u 8).</p>
      </div>
      <div>
        <label htmlFor={idDe("cuil")} className="etiqueta">CUIL</label>
        <input
          id={idDe("cuil")}
          name="cuil"
          inputMode="numeric"
          pattern="\d{2}-\d{8}-\d"
          title="11 números: los guiones se ponen solos"
          placeholder="20-12345678-9"
          defaultValue={conGuiones(campo("cuil"))}
          // Los guiones se ponen solos al escribir.
          onChange={(e) => {
            e.target.value = conGuiones(e.target.value);
          }}
          className="campo font-mono"
        />
        <p className="mt-1 text-xs text-stone-500">11 números: los guiones se ponen solos.</p>
      </div>
      <div>
        <label htmlFor={idDe("fecha_nacimiento")} className="etiqueta">Fecha de nacimiento</label>
        <input id={idDe("fecha_nacimiento")} name="fecha_nacimiento" type="date" autoComplete="bday" defaultValue={campo("fecha_nacimiento")} className="campo" />
      </div>
      <div>
        <label htmlFor={idDe("telefono")} className="etiqueta">Teléfono</label>
        <input
          id={idDe("telefono")}
          name="telefono"
          type="tel"
          inputMode="numeric"
          pattern="\d{10}"
          title="10 números: área sin 0 + número sin 15"
          placeholder="2615551234"
          defaultValue={telefonoNacional(campo("telefono"))}
          // Solo números: se limpia antes de limitar, para que pegar "+54 9 261…" no lo corte.
          onChange={(e) => {
            e.target.value = telefonoNacional(e.target.value).slice(0, 10);
          }}
          className="campo font-mono"
        />
        <p className="mt-1 text-xs text-stone-500">10 números: área sin 0 y sin el 15.</p>
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
