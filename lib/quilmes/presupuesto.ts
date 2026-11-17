import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { NOMBRE_EMPRESA, type Empresa } from "@/lib/empresas";
import { tipoIva, totalSolicitud, totalesSolicitudes } from "./solicitudes";

/**
 * Lo ÚNICO que puede salir en un presupuesto para Quilmes (lista blanca). Se
 * arma campo por campo desde las Solicitudes: nunca se pasa la planilla, los
 * gastos reales, proveedores, pagos ni rentabilidad, ni el evento entero.
 */
export const esquemaDatosPresupuesto = z
  .object({
    emisor: z.string().max(200),
    razon_social: z.string().max(200).nullable(),
    evento: z.object({ nombre: z.string().max(200), fecha: z.string().max(10), lugar: z.string().max(200).nullable() }).strict(),
    items: z
      .array(
        z
          .object({
            detalle: z.string().max(300),
            neto: z.number(),
            tratamiento: z.string().max(60),
            alicuota: z.number(),
            iva: z.number(),
            total: z.number(),
          })
          .strict(),
      )
      .max(300),
    totales: z.object({ neto: z.number(), iva: z.number(), total: z.number() }).strict(),
  })
  .strict();
export type DatosPresupuesto = z.infer<typeof esquemaDatosPresupuesto>;

/** Un presupuesto listo para mostrar: los datos comerciales y su identificación. */
export type DocumentoPresupuesto = DatosPresupuesto & { numero: number | null; version: number | null; emitido_en: string | null };

/** El presupuesto comercial actual de un evento Quilmes (desde las Solicitudes guardadas). */
export async function datosPresupuesto(eventoId: string): Promise<DatosPresupuesto | null> {
  if (!/^[0-9a-f-]{36}$/i.test(eventoId)) return null;
  const supabase = await crearClienteServidor();
  const [{ data: evento }, { data: solicitudes }] = await Promise.all([
    supabase.from("eventos").select("tipo, empresa, nombre, fecha, lugar").eq("id", eventoId).maybeSingle(),
    supabase.from("quilmes_solicitudes").select("detalle, neto, tipo_iva, iva").eq("evento_id", eventoId).order("orden"),
  ]);
  if (!evento || evento.tipo !== "quilmes") return null;
  const lista = (solicitudes ?? []).map((s) => ({ detalle: s.detalle as string, neto: Number(s.neto), iva: Number(s.iva), tipo_iva: s.tipo_iva as "A21" }));
  const t = totalesSolicitudes(lista);
  return esquemaDatosPresupuesto.parse({
    emisor: NOMBRE_EMPRESA[evento.empresa as Empresa] ?? "",
    razon_social: process.env.EMISOR_RAZON_SOCIAL ?? null,
    evento: { nombre: evento.nombre, fecha: evento.fecha, lugar: evento.lugar ?? null },
    items: lista
      .filter((s) => s.detalle.trim() || s.neto)
      .map((s) => ({
        detalle: s.detalle.trim() || "Servicio",
        neto: s.neto,
        tratamiento: tipoIva(s.tipo_iva).nombre,
        alicuota: tipoIva(s.tipo_iva).iva,
        iva: s.iva,
        total: totalSolicitud(s),
      })),
    totales: { neto: t.neto, iva: t.iva, total: t.total },
  });
}

/** Huella del contenido (si no cambió, no se emite otra versión). */
export const huellaPresupuesto = (d: DatosPresupuesto) => createHash("sha256").update(JSON.stringify(d)).digest("hex");

/** Una versión emitida, tal como se emitió (validada de nuevo contra la lista blanca). */
export async function presupuestoEmitido(eventoId: string, version: number): Promise<DocumentoPresupuesto | null> {
  if (!/^[0-9a-f-]{36}$/i.test(eventoId) || !Number.isInteger(version) || version < 1) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("quilmes_presupuestos").select("numero, version, datos, emitido_en").eq("evento_id", eventoId).eq("version", version).maybeSingle();
  if (!data) return null;
  const datos = esquemaDatosPresupuesto.safeParse(data.datos);
  if (!datos.success) return null;
  return { ...datos.data, numero: Number(data.numero), version: data.version, emitido_en: data.emitido_en };
}

/** Historial de versiones emitidas (sin el contenido). */
export async function versionesPresupuesto(eventoId: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("quilmes_presupuestos").select("numero, version, total, emitido_en, emitido_por").eq("evento_id", eventoId).order("version", { ascending: false });
  const filas = data ?? [];
  const nombres = new Map<string, string>();
  await Promise.all(
    [...new Set(filas.map((f) => f.emitido_por).filter(Boolean))].map(async (id) => {
      const { data: nombre } = await supabase.rpc("nombre_usuario", { p: id });
      nombres.set(id as string, (nombre as string | null) ?? "—");
    }),
  );
  return filas.map((f) => ({ numero: Number(f.numero), version: f.version as number, total: Number(f.total), emitido_en: f.emitido_en as string, emitido_por: f.emitido_por ? (nombres.get(f.emitido_por) ?? "—") : "—" }));
}

/** Nombre del archivo: PRESUPUESTO_QUILMES_NOMBRE_EVENTO_V2.pdf */
export function nombreArchivoPresupuesto(d: Pick<DocumentoPresupuesto, "evento" | "version">) {
  const limpio = d.evento.nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `PRESUPUESTO_QUILMES_${limpio || "EVENTO"}${d.version ? `_V${d.version}` : ""}.pdf`;
}
