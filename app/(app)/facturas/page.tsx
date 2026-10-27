import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { contarPorEstado, leerEstadoFactura, listarFacturas } from "@/lib/facturas/consultas";
import { COLOR_ESTADO_FACTURA, NOMBRE_ESTADO_FACTURA, type EstadoFactura } from "@/lib/facturas/tipos";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { SinAcceso } from "../sin-acceso";
import { SubidaFacturas } from "./subida";
import { NavegacionFacturas } from "./navegacion";

const PESTANAS: (EstadoFactura | undefined)[] = [undefined, "por_revisar", "error", "aprobada", "rechazada"];

const fechaHora = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

export default async function PaginaFacturas({ searchParams }: PageProps<"/facturas">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "facturas", "ver")) return <SinAcceso />;

  const { estado: parametro } = await searchParams;
  const estado = leerEstadoFactura(parametro);
  const [facturas, conteo] = await Promise.all([listarFacturas(estado), contarPorEstado()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Facturas</h1>
        <p className="mt-1 text-sm text-stone-600">
          Subí facturas y la IA lee sus datos. Después las revisás y al aprobarlas se cargan en Financiero.
        </p>
      </div>

      <NavegacionFacturas actual="/facturas" />

      {puede(usuario, "facturas", "editar") && <SubidaFacturas />}

      <nav className="flex flex-wrap gap-2">
        {PESTANAS.map((e) => {
          const cantidad = e ? conteo[e] : Object.values(conteo).reduce((a, b) => a + b, 0);
          return (
            <Link
              key={e ?? "todas"}
              href={e ? `/facturas?estado=${e}` : "/facturas"}
              scroll={false}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                estado === e
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
              }`}
            >
              {e ? NOMBRE_ESTADO_FACTURA[e] : "Todas"} ({cantidad})
            </Link>
          );
        })}
      </nav>

      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Subida</th>
              <th className="px-4 py-3">Emisor</th>
              <th className="px-4 py-3">Comprobante</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {facturas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-stone-500">No hay facturas.</td>
              </tr>
            )}
            {facturas.map((f) => (
              <tr key={f.id} className="hover:bg-stone-50">
                <td className="whitespace-nowrap px-4 py-3 text-stone-600">{fechaHora.format(new Date(f.creado_en))}</td>
                <td className="px-4 py-3">
                  <Link href={`/facturas/${f.id}`} className="font-medium underline decoration-stone-300 hover:decoration-stone-900">
                    {f.razon_social_emisor ?? f.archivo_nombre}
                  </Link>
                  {f.cuit_emisor && <p className="text-xs text-stone-500">CUIT {f.cuit_emisor}</p>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-stone-600">
                  {[f.tipo_comprobante, f.punto_venta && f.numero ? `${f.punto_venta}-${f.numero}` : null]
                    .filter(Boolean)
                    .join(" ") || "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-stone-600">
                  {f.fecha_emision ? formatoFecha(f.fecha_emision) : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                  {f.total !== null ? formatoPesos(f.total) : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO_FACTURA[f.estado]}`}>
                    {NOMBRE_ESTADO_FACTURA[f.estado]}
                  </span>
                  {f.duplicada_de && f.estado === "por_revisar" && (
                    <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                      ¿Duplicada?
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {/* Ruta que verifica permisos y redirige a un link temporal del archivo. */}
                  <a href={`/facturas/${f.id}/archivo`} target="_blank" rel="noreferrer" className="boton-secundario">
                    Ver
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
