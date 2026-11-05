import Link from "next/link";
import { obtenerUsuario } from "@/lib/auth/sesion";
import { centralConfigurada } from "@/lib/solicitudes/central";
import { empresasConSolicitudes, listarSolicitudes } from "@/lib/solicitudes/consultas";
import { ESTADOS, PRIORIDADES_INTERNAS, TIPOS, codigoSolicitud, nombreDe } from "@/lib/solicitudes/tipos";
import { formatoFecha } from "@/lib/formato";
import { EtiquetaEstado } from "@/components/solicitudes/comunes";
import { SinConfigurar } from "./sin-configurar";

const texto = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Centro de Solicitudes: el cliente ve y sigue las de su empresa; el equipo de
 * Planix ve las de todos los clientes, con filtros.
 */
export default async function PaginaSolicitudes({ searchParams }: PageProps<"/solicitudes">) {
  if (!centralConfigurada()) return <SinConfigurar />;
  const usuario = await obtenerUsuario();
  const p = await searchParams;
  const filtros = { empresa: texto(p.empresa), estado: texto(p.estado), tipo: texto(p.tipo), prioridad: texto(p.prioridad), desde: texto(p.desde), hasta: texto(p.hasta), q: texto(p.q) };
  const { equipo, solicitudes, resumen } = await listarSolicitudes(usuario, filtros);
  const empresas = equipo ? await empresasConSolicitudes() : [];
  const hayFiltros = Object.values(filtros).some(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{equipo ? "Solicitudes de los clientes" : "Solicitudes y mejoras"}</h1>
          <p className="text-sm text-stone-500">
            {equipo ? "Panel del equipo de Planix: las solicitudes de todas las empresas." : "Pedí funcionalidades, mejoras o reportá errores, y seguí cómo avanza cada pedido."}
          </p>
        </div>
        <Link href="/solicitudes/nueva" className="boton px-5 py-2.5 text-base">+ Nueva solicitud</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { titulo: "Total", valor: resumen.total, estado: "" },
          { titulo: "Pendientes", valor: resumen.pendientes, estado: "abiertas" },
          { titulo: "Falta información", valor: resumen.informacion, estado: "informacion" },
          { titulo: "En desarrollo", valor: resumen.desarrollo, estado: "desarrollo" },
          { titulo: "Resueltas", valor: resumen.resueltas, estado: "resuelta" },
        ].map((c) => (
          <Link key={c.titulo} href={c.estado ? `/solicitudes?estado=${c.estado}` : "/solicitudes"} className="tarjeta p-4 transition hover:border-stone-400">
            <p className="text-xs uppercase tracking-wide text-stone-500">{c.titulo}</p>
            <p className="mt-1 text-2xl font-semibold">{c.valor}</p>
          </Link>
        ))}
      </div>

      <form className="tarjeta grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" action="/solicitudes">
        <div className="sm:col-span-2">
          <label htmlFor="q" className="etiqueta">Buscar</label>
          <input id="q" name="q" type="search" defaultValue={filtros.q} placeholder={equipo ? "Número (PLN-0001), título o cliente" : "Número o título"} className="campo" />
        </div>
        {equipo && (
          <div>
            <label htmlFor="empresa" className="etiqueta">Empresa</label>
            <select id="empresa" name="empresa" defaultValue={filtros.empresa} className="campo">
              <option value="">Todas</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="estado" className="etiqueta">Estado</label>
          <select id="estado" name="estado" defaultValue={filtros.estado} className="campo">
            <option value="">Todos</option>
            <option value="abiertas">Abiertas (sin resolver)</option>
            {ESTADOS.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tipo" className="etiqueta">Tipo</label>
          <select id="tipo" name="tipo" defaultValue={filtros.tipo} className="campo">
            <option value="">Todos</option>
            {TIPOS.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>
        {equipo && (
          <>
            <div>
              <label htmlFor="prioridad" className="etiqueta">Prioridad</label>
              <select id="prioridad" name="prioridad" defaultValue={filtros.prioridad} className="campo">
                <option value="">Todas</option>
                {PRIORIDADES_INTERNAS.map((x) => (
                  <option key={x.id} value={x.id}>{x.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="desde" className="etiqueta">Desde</label>
              <input id="desde" name="desde" type="date" defaultValue={filtros.desde} className="campo" />
            </div>
            <div>
              <label htmlFor="hasta" className="etiqueta">Hasta</label>
              <input id="hasta" name="hasta" type="date" defaultValue={filtros.hasta} className="campo" />
            </div>
          </>
        )}
        <div className="flex items-end gap-3">
          <button type="submit" className="boton-secundario">Filtrar</button>
          {hayFiltros && <Link href="/solicitudes" className="pb-2 text-sm text-stone-600 underline">Quitar filtros</Link>}
        </div>
      </form>

      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">N°</th>
              <th className="px-4 py-3">Solicitud</th>
              {equipo && <th className="px-4 py-3">Empresa</th>}
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Prioridad</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {solicitudes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-stone-500">
                  {hayFiltros ? "Ninguna solicitud con esos filtros." : "Todavía no hay solicitudes. Tocá “+ Nueva solicitud” para hacer la primera."}
                </td>
              </tr>
            )}
            {solicitudes.map((s) => (
              <tr key={s.id} className="hover:bg-stone-50">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                  <Link href={`/solicitudes/${s.numero}`} className="font-semibold underline decoration-stone-300 hover:decoration-stone-900">{codigoSolicitud(s.numero)}</Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/solicitudes/${s.numero}`} className="font-medium hover:underline">{s.titulo}</Link>
                  {s.novedad && <span className="ml-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Novedad</span>}
                  <p className="text-xs text-stone-500">{s.creado_por_nombre}</p>
                </td>
                {equipo && <td className="px-4 py-3">{s.empresa_nombre}</td>}
                <td className="px-4 py-3 text-stone-600">{nombreDe(TIPOS, s.tipo)}</td>
                <td className="px-4 py-3 text-stone-600">{nombreDe(PRIORIDADES_INTERNAS, (equipo && s.prioridad_interna) || s.prioridad_sugerida)}</td>
                <td className="px-4 py-3"><EtiquetaEstado estado={s.estado} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-stone-600">{formatoFecha(s.creado_en.slice(0, 10))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
