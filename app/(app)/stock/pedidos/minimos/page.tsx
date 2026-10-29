import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerStock } from "@/lib/stock/consultas";
import { SinAcceso } from "../../../sin-acceso";
import { FormularioMinimos } from "./formulario-minimos";

export default async function PaginaMinimos() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "stock", "editar")) return <SinAcceso />;
  const stock = await obtenerStock();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/stock/pedidos" className="text-sm text-stone-500 hover:text-stone-900">← Pedidos</Link>
        <h1 className="mt-1 text-2xl font-semibold">Stock mínimo</h1>
        <p className="text-sm text-stone-500">
          Cuánto tiene que haber como mínimo de cada producto (sumando todos los depósitos). Cuando el stock queda por debajo, aparece como faltante al armar un pedido. Dejalo
          vacío en lo que no se repone.
        </p>
      </div>
      <FormularioMinimos
        productos={stock.map((f) => ({
          id: f.producto.id,
          nombre: f.producto.nombre,
          unidad: f.producto.unidad,
          codigo: f.producto.codigo,
          stock: Math.round(f.total * 1000) / 1000,
          minimo: f.producto.stock_minimo,
        }))}
      />
    </div>
  );
}
