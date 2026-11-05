"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { obtenerUsuario, type UsuarioActual } from "@/lib/auth/sesion";
import { NOMBRE_CLIENTE } from "@/lib/cliente";
import { EMPRESA, crearClienteCentral, esEquipoPlanix } from "./central";
import { marcarVista } from "./consultas";
import { CLASIFICACIONES, ESTADOS, MAXIMO_ADJUNTOS, PRIORIDADES, PRIORIDADES_INTERNAS, TIPOS, TIPOS_ADJUNTO, type Solicitud } from "./tipos";

export type EstadoFormSolicitud = { error?: string; ok?: string; valores?: Record<string, string> };

const ids = <T extends { id: string }>(lista: readonly T[]) => lista.map((x) => x.id) as [string, ...string[]];

/** Los archivos que vinieron en el formulario, validados (tipo y tamaño). */
function leerArchivos(formData: FormData): { archivos: File[] } | { error: string } {
  const archivos = formData.getAll("adjuntos").filter((a): a is File => a instanceof File && a.size > 0);
  if (archivos.length > 10) return { error: "Hasta 10 archivos por vez" };
  if (archivos.reduce((t, a) => t + a.size, 0) > MAXIMO_ADJUNTOS) return { error: "Los archivos pesan más de 10 MB entre todos" };
  const malo = archivos.find((a) => !TIPOS_ADJUNTO.includes(a.type));
  if (malo) return { error: `"${malo.name}" no es de un tipo permitido (imágenes, PDF, Word, Excel, texto)` };
  return { archivos };
}

async function subirAdjuntos(solicitud: Pick<Solicitud, "id" | "empresa">, archivos: File[], eventoId: string | null, interno: boolean, usuario: UsuarioActual) {
  const central = crearClienteCentral();
  for (const archivo of archivos) {
    const nombre = archivo.name.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, "_").slice(0, 120) || "archivo";
    const path = `${solicitud.empresa}/${solicitud.id}/${randomUUID()}-${nombre}`;
    const { error } = await central.storage.from("solicitudes").upload(path, Buffer.from(await archivo.arrayBuffer()), { contentType: archivo.type });
    if (error) throw new Error(`No se pudo subir ${archivo.name}`);
    await central.from("solicitud_adjuntos").insert({ solicitud_id: solicitud.id, evento_id: eventoId, nombre, tipo: archivo.type, tamano: archivo.size, path, interno, subido_por: usuario.nombre });
  }
}

/** La solicitud si el usuario la puede tocar (su empresa, o cualquiera si es del equipo). */
async function solicitudDe(usuario: UsuarioActual, numero: number) {
  if (!Number.isInteger(numero) || numero <= 0) return null;
  let consulta = crearClienteCentral().from("solicitudes").select("*").eq("numero", numero);
  if (!esEquipoPlanix(usuario)) consulta = consulta.eq("empresa", EMPRESA);
  const { data } = await consulta.maybeSingle();
  return data as Solicitud | null;
}

const esquemaNueva = z.object({
  titulo: z.string().trim().min(3, "Poné un título (al menos 3 letras)").max(140),
  tipo: z.enum(ids(TIPOS), "Elegí el tipo"),
  descripcion: z.string().trim().min(10, "Contá un poco más qué necesitás (al menos 10 letras)").max(8000),
  prioridad_sugerida: z.enum(ids(PRIORIDADES), "Elegí la prioridad"),
});

export async function crearSolicitud(_previo: EstadoFormSolicitud, formData: FormData): Promise<EstadoFormSolicitud> {
  const usuario = await obtenerUsuario();
  const valores = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const r = esquemaNueva.safeParse(valores);
  if (!r.success) return { error: r.error.issues[0].message, valores };
  const archivos = leerArchivos(formData);
  if ("error" in archivos) return { error: archivos.error, valores };

  const central = crearClienteCentral();
  const { data: nueva, error } = await central
    .from("solicitudes")
    .insert({ ...r.data, empresa: EMPRESA, empresa_nombre: NOMBRE_CLIENTE, creado_por_id: usuario.id, creado_por_nombre: usuario.nombre, creado_por_email: usuario.email })
    .select("id, numero, empresa")
    .single();
  if (error || !nueva) return { error: "No se pudo enviar la solicitud. Probá de nuevo.", valores };
  const { data: evento } = await central
    .from("solicitud_eventos")
    .insert({ solicitud_id: nueva.id, tipo: "creada", lado: "cliente", autor_nombre: usuario.nombre, autor_email: usuario.email })
    .select("id")
    .single();
  try {
    await subirAdjuntos(nueva as Solicitud, archivos.archivos, evento?.id ?? null, false, usuario);
  } catch {
    // La solicitud ya quedó: se avisa y se pueden volver a adjuntar desde su página.
    redirect(`/solicitudes/${nueva.numero}?adjuntos=error`);
  }
  // Quien la crea ya la vio.
  await central.from("solicitud_vistas").upsert({ solicitud_id: nueva.id, empresa: EMPRESA, usuario_id: usuario.id, visto_en: new Date().toISOString() });
  redirect(`/solicitudes/${nueva.numero}?creada=1`);
}

/** Comentario (del cliente o del equipo) o nota interna (solo el equipo), con adjuntos. */
export async function comentar(numero: number, _previo: EstadoFormSolicitud, formData: FormData): Promise<EstadoFormSolicitud> {
  const usuario = await obtenerUsuario();
  const equipo = esEquipoPlanix(usuario);
  const solicitud = await solicitudDe(usuario, numero);
  if (!solicitud) return { error: "La solicitud no existe" };
  const texto = String(formData.get("texto") ?? "").trim().slice(0, 8000);
  const interno = equipo && formData.get("interno") === "on";
  const archivos = leerArchivos(formData);
  if ("error" in archivos) return { error: archivos.error, valores: { texto } };
  if (!texto && !archivos.archivos.length) return { error: "Escribí algo o adjuntá un archivo", valores: { texto } };

  const central = crearClienteCentral();
  const { data: evento, error } = await central
    .from("solicitud_eventos")
    .insert({ solicitud_id: solicitud.id, tipo: interno ? "nota_interna" : archivos.archivos.length && !texto ? "adjunto" : "comentario", texto: texto || null, interno, lado: equipo ? "equipo" : "cliente", autor_nombre: usuario.nombre, autor_email: usuario.email })
    .select("id")
    .single();
  if (error || !evento) return { error: "No se pudo guardar", valores: { texto } };
  try {
    await subirAdjuntos(solicitud, archivos.archivos, evento.id, interno, usuario);
  } catch {
    return { error: "El comentario quedó, pero no se pudo subir algún archivo" };
  }
  if (!interno) {
    const ahora = new Date().toISOString();
    await central.from("solicitudes").update(equipo ? { actividad_equipo_en: ahora } : { actividad_cliente_en: ahora }).eq("id", solicitud.id);
  }
  await marcarVista(usuario, solicitud.id);
  refresh();
  return { ok: interno ? "Nota interna guardada" : "Comentario enviado" };
}

const esquemaCambios = z.object({
  estado: z.enum(ids(ESTADOS)).optional(),
  responsable: z.string().trim().max(80).optional(),
  prioridad_interna: z.union([z.enum(ids(PRIORIDADES_INTERNAS)), z.literal("")]).optional(),
  fecha_estimada: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  clasificacion: z.enum(ids(CLASIFICACIONES)).optional(),
  resolucion: z.string().trim().max(4000).optional(),
  cotizacion_monto: z.number().min(0).max(1e12).nullable().optional(),
  cotizacion_detalle: z.string().trim().max(4000).optional(),
});

/** Lo que administra el equipo de Planix. Cada cambio queda en el historial (los internos, ocultos al cliente). */
export async function actualizarSolicitud(numero: number, datos: z.input<typeof esquemaCambios>): Promise<{ error?: string }> {
  const usuario = await obtenerUsuario();
  if (!esEquipoPlanix(usuario)) return { error: "Solo el equipo de Planix administra las solicitudes" };
  const r = esquemaCambios.safeParse(datos);
  if (!r.success) return { error: "Datos inválidos" };
  const s = await solicitudDe(usuario, numero);
  if (!s) return { error: "La solicitud no existe" };
  const c = r.data;
  if (c.estado === "resuelta" && !(c.resolucion ?? s.resolucion)) return { error: "Para marcarla resuelta contá qué se modificó" };

  const cambios: Partial<Solicitud> = {};
  const eventos: { tipo: string; texto?: string | null; datos?: object; interno: boolean }[] = [];
  const nulo = (v: string | undefined) => (v === undefined ? undefined : v || null);
  const anotar = <K extends keyof Solicitud>(campo: K, valor: Solicitud[K] | undefined, tipo: string, interno: boolean) => {
    if (valor === undefined || valor === s[campo]) return;
    cambios[campo] = valor;
    eventos.push({ tipo, datos: { de: s[campo], a: valor }, interno });
  };
  anotar("estado", c.estado as Solicitud["estado"] | undefined, "estado", false);
  anotar("responsable", nulo(c.responsable), "responsable", true);
  anotar("prioridad_interna", nulo(c.prioridad_interna) as Solicitud["prioridad_interna"] | undefined, "prioridad", true);
  anotar("fecha_estimada", nulo(c.fecha_estimada), "fecha", false);
  anotar("clasificacion", c.clasificacion as Solicitud["clasificacion"] | undefined, "clasificacion", true);
  if (c.resolucion !== undefined && (c.resolucion || null) !== s.resolucion) {
    cambios.resolucion = c.resolucion || null;
    eventos.push({ tipo: "resolucion", texto: c.resolucion || null, interno: false });
  }
  // Una cotización nueva (o cambiada) queda pendiente de que el cliente la apruebe.
  if (c.cotizacion_monto !== undefined && (c.cotizacion_monto !== s.cotizacion_monto || (c.cotizacion_detalle ?? null) !== s.cotizacion_detalle)) {
    Object.assign(cambios, {
      cotizacion_monto: c.cotizacion_monto,
      cotizacion_detalle: c.cotizacion_detalle || null,
      cotizacion_estado: c.cotizacion_monto === null ? null : "pendiente",
      cotizacion_respondida_por: null,
      cotizacion_respondida_en: null,
    });
    eventos.push({ tipo: "cotizacion", texto: c.cotizacion_detalle || null, datos: { monto: c.cotizacion_monto }, interno: false });
  }
  if (!eventos.length) return {};
  if (eventos.some((e) => !e.interno)) cambios.actividad_equipo_en = new Date().toISOString();

  const central = crearClienteCentral();
  const { error } = await central.from("solicitudes").update(cambios).eq("id", s.id);
  if (error) return { error: "No se pudo guardar" };
  await central.from("solicitud_eventos").insert(eventos.map((e) => ({ ...e, solicitud_id: s.id, lado: "equipo", autor_nombre: usuario.nombre, autor_email: usuario.email })));
  await marcarVista(usuario, s.id);
  refresh();
  return {};
}

/** El cliente aprueba o rechaza la cotización. */
export async function responderCotizacion(numero: number, aprobar: boolean): Promise<{ error?: string }> {
  const usuario = await obtenerUsuario();
  const s = await solicitudDe(usuario, numero);
  if (!s || s.empresa !== EMPRESA) return { error: "La solicitud no existe" };
  if (s.cotizacion_estado !== "pendiente") return { error: "No hay una cotización para responder" };
  const ahora = new Date().toISOString();
  const central = crearClienteCentral();
  const { error } = await central
    .from("solicitudes")
    .update({ cotizacion_estado: aprobar ? "aprobada" : "rechazada", cotizacion_respondida_por: usuario.nombre, cotizacion_respondida_en: ahora, actividad_cliente_en: ahora })
    .eq("id", s.id)
    .eq("cotizacion_estado", "pendiente");
  if (error) return { error: "No se pudo guardar la respuesta" };
  await central.from("solicitud_eventos").insert({ solicitud_id: s.id, tipo: "cotizacion_respuesta", datos: { aprobada: aprobar, monto: s.cotizacion_monto }, lado: "cliente", autor_nombre: usuario.nombre, autor_email: usuario.email });
  refresh();
  return {};
}
