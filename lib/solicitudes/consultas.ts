import "server-only";
import { cache } from "react";
import type { UsuarioActual } from "@/lib/auth/sesion";
import { EMPRESA, centralConfigurada, crearClienteCentral, esEquipoPlanix } from "./central";
import { ESTADOS_ABIERTOS, type Adjunto, type EventoSolicitud, type Solicitud } from "./tipos";

const CAMPOS =
  "id, numero, empresa, empresa_nombre, titulo, tipo, descripcion, prioridad_sugerida, estado, prioridad_interna, responsable, fecha_estimada, clasificacion, resolucion, cotizacion_monto, cotizacion_detalle, cotizacion_estado, cotizacion_respondida_por, cotizacion_respondida_en, creado_por_nombre, creado_por_email, creado_en, actualizado_en, actividad_cliente_en, actividad_equipo_en";

/** Lo que el cliente no ve de una solicitud (lo decide y lo usa el equipo de Planix). */
function paraCliente(s: Solicitud): Solicitud {
  return { ...s, prioridad_interna: null, responsable: null, clasificacion: "evaluacion" };
}

const normalizar = (s: Solicitud): Solicitud => ({ ...s, cotizacion_monto: s.cotizacion_monto === null ? null : Number(s.cotizacion_monto) });

export type Filtros = { empresa?: string; estado?: string; tipo?: string; prioridad?: string; desde?: string; hasta?: string; q?: string };

/**
 * Las solicitudes que puede ver el usuario: las de su empresa o, si es del
 * equipo de Planix, las de todas (con filtros). Con el resumen para los indicadores.
 */
export async function listarSolicitudes(usuario: UsuarioActual, filtros: Filtros = {}) {
  const equipo = esEquipoPlanix(usuario);
  const central = crearClienteCentral();
  let consulta = central.from("solicitudes").select(CAMPOS).order("numero", { ascending: false }).limit(1000);
  if (!equipo) consulta = consulta.eq("empresa", EMPRESA);
  else if (filtros.empresa) consulta = consulta.eq("empresa", filtros.empresa);
  if (filtros.estado === "abiertas") consulta = consulta.in("estado", ESTADOS_ABIERTOS);
  else if (filtros.estado) consulta = consulta.eq("estado", filtros.estado);
  if (filtros.tipo) consulta = consulta.eq("tipo", filtros.tipo);
  // Solo valores conocidos: el filtro va armado dentro del texto de la consulta.
  if (filtros.prioridad && ["baja", "media", "alta", "urgente"].includes(filtros.prioridad)) consulta = consulta.or(`prioridad_interna.eq.${filtros.prioridad},and(prioridad_interna.is.null,prioridad_sugerida.eq.${filtros.prioridad})`);
  if (filtros.desde && /^\d{4}-\d{2}-\d{2}$/.test(filtros.desde)) consulta = consulta.gte("creado_en", filtros.desde);
  if (filtros.hasta && /^\d{4}-\d{2}-\d{2}$/.test(filtros.hasta)) consulta = consulta.lte("creado_en", `${filtros.hasta}T23:59:59`);
  const { data, error } = await consulta;
  if (error) throw new Error(`No se pudieron leer las solicitudes: ${error.message}`);

  let lista = ((data ?? []) as Solicitud[]).map(normalizar);
  const q = (filtros.q ?? "").trim().toLowerCase();
  if (q) {
    const numero = Number(q.replace(/^pln-?/, ""));
    lista = lista.filter((s) => s.numero === numero || s.titulo.toLowerCase().includes(q) || s.empresa_nombre.toLowerCase().includes(q) || s.creado_por_nombre.toLowerCase().includes(q));
  }
  const vistas = await vistasDe(usuario, lista.map((s) => s.id));
  const conNovedad = (s: Solicitud) => {
    const otroLado = equipo ? s.actividad_cliente_en : s.actividad_equipo_en;
    return Boolean(otroLado && otroLado > (vistas.get(s.id) ?? ""));
  };
  return {
    equipo,
    solicitudes: lista.map((s) => ({ ...(equipo ? s : paraCliente(s)), novedad: conNovedad(s) })),
    resumen: {
      total: lista.length,
      pendientes: lista.filter((s) => ["recibida", "evaluacion", "aprobada"].includes(s.estado)).length,
      informacion: lista.filter((s) => s.estado === "informacion").length,
      desarrollo: lista.filter((s) => s.estado === "desarrollo" || s.estado === "pruebas").length,
      resueltas: lista.filter((s) => s.estado === "resuelta").length,
    },
  };
}

async function vistasDe(usuario: UsuarioActual, ids: string[]) {
  const vistas = new Map<string, string>();
  if (!ids.length) return vistas;
  const { data } = await crearClienteCentral().from("solicitud_vistas").select("solicitud_id, visto_en").eq("empresa", EMPRESA).eq("usuario_id", usuario.id).in("solicitud_id", ids);
  for (const v of data ?? []) vistas.set(v.solicitud_id as string, v.visto_en as string);
  return vistas;
}

/** Una solicitud, si el usuario la puede ver, con su historial y adjuntos (sin lo interno para el cliente). */
export async function obtenerSolicitud(usuario: UsuarioActual, numero: number) {
  const equipo = esEquipoPlanix(usuario);
  const central = crearClienteCentral();
  let consulta = central.from("solicitudes").select(CAMPOS).eq("numero", numero);
  if (!equipo) consulta = consulta.eq("empresa", EMPRESA);
  const { data } = await consulta.maybeSingle();
  if (!data) return null;
  const solicitud = normalizar(data as Solicitud);

  let eventos = central.from("solicitud_eventos").select("id, tipo, texto, datos, interno, lado, autor_nombre, creado_en").eq("solicitud_id", solicitud.id).order("creado_en");
  let adjuntos = central.from("solicitud_adjuntos").select("id, evento_id, nombre, tipo, tamano, interno, subido_por, creado_en").eq("solicitud_id", solicitud.id).order("creado_en");
  if (!equipo) {
    eventos = eventos.eq("interno", false);
    adjuntos = adjuntos.eq("interno", false);
  }
  const [{ data: ev }, { data: adj }] = await Promise.all([eventos, adjuntos]);
  return {
    equipo,
    solicitud: equipo ? solicitud : paraCliente(solicitud),
    eventos: (ev ?? []) as EventoSolicitud[],
    adjuntos: (adj ?? []) as Adjunto[],
  };
}

/** Cuántas solicitudes tienen novedades del otro lado desde que el usuario las vio (para el aviso del menú). */
export const cantidadNovedades = cache(async (usuario: UsuarioActual) => {
  if (!centralConfigurada()) return 0;
  try {
    const equipo = esEquipoPlanix(usuario);
    let consulta = crearClienteCentral().from("solicitudes").select("id, actividad_cliente_en, actividad_equipo_en").limit(2000);
    if (!equipo) consulta = consulta.eq("empresa", EMPRESA).not("actividad_equipo_en", "is", null);
    const { data } = await consulta;
    const filas = data ?? [];
    const vistas = await vistasDe(usuario, filas.map((f) => f.id as string));
    return filas.filter((f) => {
      const otroLado = (equipo ? f.actividad_cliente_en : f.actividad_equipo_en) as string | null;
      return otroLado && otroLado > (vistas.get(f.id as string) ?? "");
    }).length;
  } catch {
    // Si la base central no responde, el menú igual se muestra.
    return 0;
  }
});

/** Las empresas que mandaron solicitudes (filtro del equipo). */
export async function empresasConSolicitudes() {
  const { data } = await crearClienteCentral().from("solicitudes").select("empresa, empresa_nombre").limit(5000);
  const empresas = new Map<string, string>();
  for (const f of data ?? []) empresas.set(f.empresa as string, f.empresa_nombre as string);
  return [...empresas].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Marca la solicitud como vista por el usuario (apaga el aviso de novedades). */
export async function marcarVista(usuario: Pick<UsuarioActual, "id">, solicitudId: string) {
  await crearClienteCentral().from("solicitud_vistas").upsert({ solicitud_id: solicitudId, empresa: EMPRESA, usuario_id: usuario.id, visto_en: new Date().toISOString() });
}

/** Link temporal (10 minutos) a un adjunto, si el usuario lo puede ver. */
export async function urlAdjunto(usuario: UsuarioActual, adjuntoId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(adjuntoId)) return null;
  const equipo = esEquipoPlanix(usuario);
  const central = crearClienteCentral();
  const { data: adjunto } = await central.from("solicitud_adjuntos").select("path, nombre, interno, solicitud:solicitudes(empresa)").eq("id", adjuntoId).maybeSingle();
  const empresa = (adjunto?.solicitud as unknown as { empresa: string } | null)?.empresa;
  if (!adjunto || (!equipo && (empresa !== EMPRESA || adjunto.interno))) return null;
  const { data } = await central.storage.from("solicitudes").createSignedUrl(adjunto.path as string, 600, { download: adjunto.nombre as string });
  return data?.signedUrl ?? null;
}
