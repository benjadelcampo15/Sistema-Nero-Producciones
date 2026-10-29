import { redirect } from "next/navigation";

/** Los proveedores ahora están en la pantalla principal de la sección. */
export default function PaginaProveedoresVieja() {
  redirect("/facturas");
}
