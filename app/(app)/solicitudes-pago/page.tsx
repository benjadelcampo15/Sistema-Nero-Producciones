import Link from "next/link";
import { Fragment } from "react";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { detalleSolicitudPago, esContabilidad, listarSolicitudesPago, notificacionesSinLeer, opcionesSolicitudPago } from "@/lib/pagos/consultas";
import {
  COLOR_ESTADO_PAGO,
  COLOR_PRIORIDAD_PAGO,
  ESTADOS_ABIERTOS,
  ESTADOS_PAGO,
  NOMBRE_ESTADO_PAGO,
  NOMBRE_PRIORIDAD_PAGO,
  PRIORIDADES_PAGO,
  ordenarSolicitudes,
} from "@/lib/pagos/tipos";
import { EMPRESAS, NOMBRE_EMPRESA } from "@/lib/empresas";
import { formatoFecha, formatoPesos, sumar } from "@/lib/formato";
import { EtiquetaEmpresa } from "@/components/empresa";
import { SinAcceso } from "../sin-acceso";
import { NuevaSolicitud } from "./formulario";
import { DetalleSolicitud, Novedades } from "./detalle";

const texto = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Solicitudes de pagos: el equipo pide pagar a un proveedor y Contabilidad las
 * ordena, aprueba y registra cuándo se pagaron. No mueve Financiero.
 */
export default async function PaginaSolicitudesPago({ searchParams }: PageProps<"/solicitudes-pago">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "pagos", "ver")) return <SinAcceso />;
  const contabilidad = esContabilidad(usuario);

  const p = await searchParams;
  const filtros = {
    empresa: texto(p.empresa),
    evento: texto(p.evento),
    proveedor: texto(p.proveedor),
    estado: texto(p.estado),
    prioridad: texto(p.prioridad),
    desde: texto(p.desde),
    hasta: texto(p.hasta),
  };
  const ver = Number(texto(p.ver)) || null;
  const [lista, opciones, novedades] = await Promise.all([listarSolicitudesPago(filtros), opcionesSolicitudPago(), notificacionesSinLeer()]);
  const solicitudes = ordenarSolicitudes(lista);
  const elegida = ver ? solicitudes.find((s) => s.numero === ver) : undefined;
  const detalle = elegida ? await detalleSolicitudPago(elegida.id) : null;

  const abiertas = solicitudes.filter((s) => ESTADOS_ABIERTOS.includes(s.estado));
  const indicadores = [
    { titulo: "Total pendiente de pago", valor: formatoPesos(sumar(abiertas.map((s) => s.monto - s.pagado))), nota: `${abiertas.length} solicitud${abiertas.length === 1 ? "" : "es"} abierta${abiertas.length === 1 ? "" : "s"}` },
    { titulo: "Urgentes", valor: String(abiertas.filter((s) => s.prioridad !== "normal").length), nota: `${abiertas.filter((s) => s.prioridad === "muy_urgente").length} muy urgentes`, alerta: true },
    { titulo: "Aprobadas", valor: String(solicitudes.filter((s) => s.estado === "aprobada" || s.estado === "parcial").length), nota: "Por pagar" },
    { titulo: "Pagadas", valor: String(solicitudes.filter((s) => s.estado === "pagada").length), nota: formatoPesos(sumar(solicitudes.filter((s) => s.estado === "pagada").map((s) => s.pagado))) },
  ];
  const hayFiltros = Object.values(filtros).some(Boolean);
  const hrefVer = (numero: number | null) => {
    const q = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v));
    if (numero) q.set("ver", String(numero));
    const t = q.toString();
    return `/solicitudes-pago${t ? `?${t}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Solicitudes de pagos</h1>
          <p className="text-sm text-stone-500">
            {contabilidad
              ? "Pedidos de pago a proveedores de todo el equipo. Para organizar y hacer seguimiento: no crea movimientos en Financiero."
              : "Pedí que se le pague a un proveedor y seguí el estado de tus pedidos."}
          </p>
        </div>
        <NuevaSolicitud opciones={opciones} />
      </div>

      <Novedades lista={novedades} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {indicadores.map((i) => (
          <div key={i.titulo} className={`tarjeta p-4 ${i.alerta && i.valor !== "0" ? "border-red-300 bg-red-50" : ""}`}>
            <p className="text-xs uppercase tracking-wide text-stone-500">{i.titulo}</p>
            <p className={`mt-1 font-mono text-xl font-semibold ${i.alerta && i.valor !== "0" ? "text-red-700" : ""}`}>{i.valor}</p>
            <p className="text-xs text-stone-500">{i.nota}</p>
          </div>
        ))}
      </div>

      <form className="tarjeta grid grid-cols-2 gap-2 p-3 text-sm sm:grid-cols-4 2xl:grid-cols-8">
        <select name="empresa" defaultValue={filtros.empresa} aria-label="Empresa" className="campo">
          <option value="">Empresa: todas</option>
          {EMPRESAS.map((e) => (
            <option key={e} value={e}>{NOMBRE_EMPRESA[e]}</option>
          ))}
        </select>
        <select name="estado" defaultValue={filtros.estado} aria-label="Estado" className="campo">
          <option value="">Estado: todos</option>
          <option value="abiertas">Abiertas (sin resolver o pagar)</option>
          {ESTADOS_PAGO.map((e) => (
            <option key={e} value={e}>{NOMBRE_ESTADO_PAGO[e]}</option>
          ))}
        </select>
        <select name="prioridad" defaultValue={filtros.prioridad} aria-label="Prioridad" className="campo">
          <option value="">Prioridad: todas</option>
          {PRIORIDADES_PAGO.map((x) => (
            <option key={x} value={x}>{NOMBRE_PRIORIDAD_PAGO[x]}</option>
          ))}
        </select>
        <select name="evento" defaultValue={filtros.evento} aria-label="Evento" className="campo">
          <option value="">Evento: todos</option>
          {opciones.eventos.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre} · {formatoFecha(e.fecha)}</option>
          ))}
        </select>
        <input name="proveedor" defaultValue={filtros.proveedor} placeholder="Proveedor" aria-label="Proveedor" className="campo" />
        <input type="date" name="desde" defaultValue={filtros.desde} aria-label="Desde" title="Desde" className="campo" />
        <input type="date" name="hasta" defaultValue={filtros.hasta} aria-label="Hasta" title="Hasta" className="campo" />
        <div className="flex gap-2">
          <button type="submit" className="boton flex-1 py-1.5 text-sm">Filtrar</button>
          {hayFiltros && <Link href="/solicitudes-pago" className="boton-secundario py-1.5 text-sm">×</Link>}
        </div>
      </form>

      {solicitudes.length === 0 ? (
        <p className="tarjeta text-center text-sm text-stone-500">
          {hayFiltros ? "No hay solicitudes con estos filtros." : "Todavía no hay solicitudes de pago. Creá la primera con “+ Nueva solicitud de pago”."}
        </p>
      ) : (
        <div className="tarjeta overflow-x-auto p-0">
          <table className="tabla-movil w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Solicitante</th>
                <th className="px-3 py-2">Empresa</th>
                <th className="px-3 py-2">Proveedor</th>
                <th className="px-3 py-2">Evento</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2">Alias / CBU</th>
                <th className="px-3 py-2">Prioridad</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {solicitudes.map((s) => {
                const abierta = ESTADOS_ABIERTOS.includes(s.estado);
                const fondo = abierta && s.prioridad === "muy_urgente" ? "bg-red-50" : abierta && s.prioridad === "urgente" ? "bg-amber-50" : "";
                const abiertaDetalle = elegida?.id === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr className={`${fondo} ${abiertaDetalle ? "outline outline-2 -outline-offset-2 outline-stone-400" : ""}`}>
                      <td className="whitespace-nowrap px-3 py-2">
                        {formatoFecha(s.creado_en.slice(0, 10))}
                        <span className="block text-[11px] text-stone-400">#{s.numero}</span>
                      </td>
                      <td className="px-3 py-2">{s.solicitante ?? "—"}</td>
                      <td className="px-3 py-2"><EtiquetaEmpresa empresa={s.empresa} /></td>
                      <td className="px-3 py-2 font-medium">{s.proveedor}</td>
                      <td className="px-3 py-2">{s.evento ?? <span className="text-stone-400">Sin evento</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                        {formatoPesos(s.monto)}
                        {s.estado === "parcial" && <span className="block text-[11px] text-amber-800">falta {formatoPesos(Math.round((s.monto - s.pagado) * 100) / 100)}</span>}
                      </td>
                      <td className="max-w-[12rem] break-words px-3 py-2 font-mono text-xs">{s.datos_bancarios}</td>
                      <td className="px-3 py-2">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_PRIORIDAD_PAGO[s.prioridad]}`}>{NOMBRE_PRIORIDAD_PAGO[s.prioridad]}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO_PAGO[s.estado]}`}>{NOMBRE_ESTADO_PAGO[s.estado]}</span>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={hrefVer(abiertaDetalle ? null : s.numero)} scroll={false} className="whitespace-nowrap text-sm font-medium underline">
                          {abiertaDetalle ? "Cerrar" : contabilidad && abierta ? "Gestionar" : "Ver"}
                        </Link>
                      </td>
                    </tr>
                    {abiertaDetalle && detalle && (
                      <tr>
                        <td colSpan={10} className="bg-stone-50 px-3 py-3">
                          <DetalleSolicitud
                            key={`${s.id}-${s.estado}-${s.pagado}`}
                            s={s}
                            pagos={detalle.pagos}
                            historial={detalle.historial}
                            opciones={opciones}
                            contabilidad={contabilidad}
                            esMia={s.solicitado_por === usuario.id}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
