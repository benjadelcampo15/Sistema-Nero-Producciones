import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarClientes, resumenFacturacionPorCliente } from "@/lib/clientes/consultas";
import { CONDICIONES_IVA } from "@/lib/facturar/tipos";
import { formatoDocumento } from "@/lib/cuit";
import { hoy } from "@/lib/formato";
import { SinAcceso } from "../sin-acceso";
import { NavegacionFacturar } from "./navegacion";
import { TarjetasFichas } from "@/components/tarjetas-fichas";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Clientes: una tarjeta por cliente con lo facturado en el mes, su ficha y el botón para facturarle. */
export default async function PaginaClientes() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturar", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "facturar", "editar");
  const [clientes, resumen] = await Promise.all([listarClientes({ incluirInactivos: true }), resumenFacturacionPorCliente()]);
  const activos = clientes.filter((c) => c.activo).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-stone-500">{activos} {activos === 1 ? "cliente" : "clientes"}</p>
        </div>
        {editable && (
          <div className="flex gap-2">
            <Link href="/facturar/nueva" className="boton-secundario">Factura sin cliente guardado</Link>
            <Link href="/facturar/clientes/nuevo" className="boton">+ Nuevo cliente</Link>
          </div>
        )}
      </div>

      <NavegacionFacturar actual="/facturar" />

      <TarjetasFichas
        editable={editable}
        rutas={{ ficha: "/facturar/clientes", accion: { texto: "Facturar", href: "/facturar/nueva?cliente={id}" }, agregar: { texto: "Agregar cliente", href: "/facturar/clientes/nuevo" } }}
        mes={MESES[Number(hoy().slice(5, 7)) - 1]}
        fichas={clientes.map((c) => {
          const r = resumen.get(c.id);
          return {
            id: c.id,
            nombre: c.razon_social,
            documento: formatoDocumento(c.doc_tipo, c.doc_nro),
            condicion: CONDICIONES_IVA.find((x) => x.id === c.condicion_iva)?.nombre ?? "",
            activo: c.activo,
            contacto: c.telefono ?? c.email,
            mes: r?.mes ?? { cantidad: 0, total: 0 },
            total: r?.total ?? 0,
            cantidad: r?.cantidad ?? 0,
            ultima: r?.ultima ?? null,
          };
        })}
      />
    </div>
  );
}
