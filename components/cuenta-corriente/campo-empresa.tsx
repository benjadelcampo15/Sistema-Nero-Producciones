import { NOMBRE_EMPRESA } from "@/lib/empresas";

/** Con qué empresa trabaja un proveedor o cliente ("" = con las dos). */
export function CampoEmpresaFicha({ id, defecto }: { id: string; defecto: string }) {
  return (
    <div>
      <label htmlFor={id} className="etiqueta">Empresa</label>
      <select id={id} name="empresa" defaultValue={defecto} className="campo">
        <option value="">Las dos</option>
        <option value="nero">{NOMBRE_EMPRESA.nero}</option>
        <option value="ruta">{NOMBRE_EMPRESA.ruta}</option>
      </select>
    </div>
  );
}
