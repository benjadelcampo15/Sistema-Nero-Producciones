import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarClientes, resumenFacturacionPorCliente } from "@/lib/clientes/consultas";
import { CONDICIONES_IVA } from "@/lib/facturar/tipos";
import { formatoDocumento } from "@/lib/cuit";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../../sin-acceso";
import { NavegacionFacturar } from "../navegacion";
import { BotonEstadoCliente, FormularioCliente } from "./formulario-cliente";

export default async function PaginaClientes() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturar", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "facturar", "editar");

  const [clientes, resumen] = await Promise.all([listarClientes({ incluirInactivos: true }), resumenFacturacionPorCliente()]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Facturar</h1>
      <NavegacionFacturar actual="/facturar/clientes" />

      {editable && (
        <section className="tarjeta space-y-3">
          <h2 className="font-semibold">Nuevo cliente</h2>
          <FormularioCliente />
        </section>
      )}

      <section className="tarjeta divide-y divide-stone-100 p-0">
        {clientes.length === 0 && <p className="p-6 text-center text-sm text-stone-500">Todavía no hay clientes.</p>}
        {clientes.map((c) => {
          const r = resumen.get(c.id);
          const encabezado = (
            <>
              <span className={`min-w-48 flex-1 font-medium ${c.activo ? "" : "line-through"}`}>{c.razon_social}</span>
              <span className="font-mono text-xs text-stone-500">{formatoDocumento(c.doc_tipo, c.doc_nro)}</span>
              <span className="text-xs text-stone-500">{CONDICIONES_IVA.find((x) => x.id === c.condicion_iva)?.nombre}</span>
              <span className="text-xs text-stone-600">
                {r ? `${r.cantidad} factura${r.cantidad === 1 ? "" : "s"} · ${formatoPesos(r.total)} · última ${formatoFecha(r.ultima)}` : "Sin facturas"}
              </span>
            </>
          );
          return editable ? (
            <details key={c.id} className={c.activo ? "" : "opacity-60"}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                {encabezado}
                <span className="ml-auto"><BotonEstadoCliente id={c.id} activo={c.activo} /></span>
              </summary>
              <div className="border-t border-stone-100 bg-stone-50 px-4 py-4">
                <FormularioCliente cliente={c} />
              </div>
            </details>
          ) : (
            <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">{encabezado}</div>
          );
        })}
      </section>
    </div>
  );
}
