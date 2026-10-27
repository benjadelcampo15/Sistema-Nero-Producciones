import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../../sin-acceso";
import { NavegacionFacturas } from "../navegacion";
import { BotonBorrarProveedor, FormularioProveedor, type Proveedor } from "./formulario-proveedor";

const cuitLegible = (c: string) => `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;

export default async function PaginaProveedores() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturas", "ver")) return <SinAcceso />;
  const editable = puede(usuario, "facturas", "editar");

  const supabase = await crearClienteServidor();
  const [{ data: proveedores }, { data: facturas }] = await Promise.all([
    supabase.from("proveedores").select("id, cuit, razon_social, contacto, telefono, email, alias_cbu, notas, activo").order("razon_social"),
    supabase.from("facturas").select("id, cuit_emisor, total, fecha_emision, estado").limit(5000),
  ]);

  // Facturas de cada proveedor (por CUIT): cantidad, total aprobado y la última.
  const resumen = new Map<string, { cantidad: number; total: number; ultima: string | null; ultimaId: string }>();
  for (const f of facturas ?? []) {
    const cuit = (f.cuit_emisor ?? "").replace(/\D/g, "");
    if (!cuit) continue;
    const r = resumen.get(cuit) ?? { cantidad: 0, total: 0, ultima: null, ultimaId: f.id };
    r.cantidad++;
    if (f.estado === "aprobada") r.total += Number(f.total ?? 0);
    if (f.fecha_emision && (!r.ultima || f.fecha_emision > r.ultima)) {
      r.ultima = f.fecha_emision;
      r.ultimaId = f.id;
    }
    resumen.set(cuit, r);
  }
  const lista = (proveedores ?? []) as Proveedor[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Facturas</h1>
        <p className="mt-1 text-sm text-stone-600">Proveedores que le facturan a la productora. Se agregan solos al aprobar una factura.</p>
      </div>
      <NavegacionFacturas actual="/facturas/proveedores" />

      {editable && (
        <details className="tarjeta">
          <summary className="cursor-pointer font-semibold">+ Agregar proveedor</summary>
          <div className="mt-4">
            <FormularioProveedor />
          </div>
        </details>
      )}

      <section className="tarjeta divide-y divide-stone-100 p-0">
        {lista.length === 0 && <p className="p-6 text-center text-sm text-stone-500">Todavía no hay proveedores.</p>}
        {lista.map((p) => {
          const r = p.cuit ? resumen.get(p.cuit) : undefined;
          const encabezado = (
            <>
              <span className="min-w-48 flex-1 font-medium">{p.razon_social}</span>
              {p.cuit && <span className="font-mono text-xs text-stone-500">CUIT {cuitLegible(p.cuit)}</span>}
              <span className="text-xs text-stone-600">
                {r ? `${r.cantidad} factura${r.cantidad === 1 ? "" : "s"} · ${formatoPesos(r.total)} aprobado${r.ultima ? ` · última ${formatoFecha(r.ultima)}` : ""}` : "Sin facturas"}
              </span>
              {p.alias_cbu && <span className="font-mono text-xs text-stone-500">{p.alias_cbu}</span>}
            </>
          );
          return editable ? (
            <details key={p.id}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">{encabezado}</summary>
              <div className="space-y-3 border-t border-stone-100 bg-stone-50 px-4 py-4">
                <FormularioProveedor proveedor={p} />
                <div className="flex items-center justify-between text-sm">
                  {r ? (
                    <Link href={`/facturas/${r.ultimaId}`} className="underline">Ver última factura</Link>
                  ) : (
                    <span />
                  )}
                  <BotonBorrarProveedor id={p.id} nombre={p.razon_social} />
                </div>
              </div>
            </details>
          ) : (
            <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">{encabezado}</div>
          );
        })}
      </section>
    </div>
  );
}
