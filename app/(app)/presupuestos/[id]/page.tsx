import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { obtenerPresupuesto } from "@/lib/presupuestos/consultas";
import { COLOR_ESTADO_PRESUPUESTO, NOMBRE_ESTADO_PRESUPUESTO, calcularTotales, estadoVisible, numeroPresupuesto } from "@/lib/presupuestos/tipos";
import { mailConfigurado } from "@/lib/mail";
import { formatoFecha, formatoPesos, hoy } from "@/lib/formato";
import { PresupuestoVista } from "@/components/presupuesto-vista";
import { SinAcceso } from "../../sin-acceso";
import { AccionesPresupuesto } from "./acciones-presupuesto";

const fechaHora = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

export default async function PaginaPresupuesto({ params }: PageProps<"/presupuestos/[id]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "presupuestos", "ver")) return <SinAcceso />;

  const { id } = await params;
  const p = await obtenerPresupuesto(id);
  if (!p) notFound();

  const editable = puede(usuario, "presupuestos", "editar");
  const estado = estadoVisible(p, hoy());
  const totales = calcularTotales(p.items, p.modo_iva, p.descuento_pct);

  const seguimiento: [string, string | null][] = [
    ["Enviado", p.enviado_en ? fechaHora.format(new Date(p.enviado_en)) : null],
    ["Visto por el cliente", p.visto_en ? fechaHora.format(new Date(p.visto_en)) : null],
    ["Respuesta", p.respondido_en ? `${fechaHora.format(new Date(p.respondido_en))}${p.respondido_por ? ` · ${p.respondido_por}` : ""}` : null],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/presupuestos" className="text-sm text-stone-500 hover:text-stone-900">← Presupuestos</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{numeroPresupuesto(p.numero)} · {p.cliente_nombre}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO_PRESUPUESTO[estado]}`}>{NOMBRE_ESTADO_PRESUPUESTO[estado]}</span>
          </div>
          {editable && p.estado !== "aceptado" && (
            <Link href={`/presupuestos/${p.id}/editar`} className="boton-secundario">Editar</Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-stone-500">Así lo ve el cliente</p>
          <div className="tarjeta overflow-hidden p-0">
            <PresupuestoVista p={p} />
          </div>
        </div>

        <aside className="space-y-4">
          {editable && (
            <AccionesPresupuesto
              id={p.id}
              estado={p.estado}
              emailCliente={p.cliente_email}
              mailHabilitado={mailConfigurado()}
              tieneEvento={!!p.evento_id}
            />
          )}

          <div className="tarjeta space-y-2 text-sm">
            <p className="font-semibold">Números internos</p>
            <div className="flex justify-between"><span className="text-stone-500">Total al cliente</span><span className="font-mono">{formatoPesos(totales.total)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Neto (sin IVA)</span><span className="font-mono">{formatoPesos(totales.neto)}</span></div>
            {totales.margen !== null ? (
              <>
                <div className="flex justify-between"><span className="text-stone-500">Costo estimado</span><span className="font-mono">{formatoPesos(totales.costo)}</span></div>
                <div className={`flex justify-between font-semibold ${totales.margen >= 0 ? "text-green-700" : "text-red-700"}`}>
                  <span>Margen</span><span className="font-mono">{formatoPesos(totales.margen)} ({totales.margenPct}%)</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-stone-500">Cargá costos en los ítems para ver el margen.</p>
            )}
          </div>

          <div className="tarjeta space-y-2 text-sm">
            <p className="font-semibold">Seguimiento</p>
            {seguimiento.map(([k, valor]) => (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-stone-500">{k}</span>
                <span>{valor ?? "—"}</span>
              </div>
            ))}
            {p.evento_id && (
              <p>
                <Link href={`/eventos/${p.evento_id}`} className="underline">Ver evento creado</Link>
              </p>
            )}
            <p className="text-xs text-stone-500">Creado el {formatoFecha(p.creado_en.slice(0, 10))}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
