import { redirect } from "next/navigation";

/** Los clientes ahora están en la pantalla principal de Facturar. */
export default function PaginaClientes() {
  redirect("/facturar");
}
