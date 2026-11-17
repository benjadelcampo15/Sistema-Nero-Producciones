"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { EMPRESAS } from "@/lib/empresas";
import { PLANILLA_VACIA, esquemaPlanilla, planillaCopiada } from "./planilla";
import { proveedoresParaEvento } from "./cuenta-gastos";
import { exigirPermisoEvento, puedeEnEvento } from "./permiso";
import { esIngresoQuilmes } from "@/lib/quilmes/solicitudes";

const esquema = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre").max(120),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  lugar: z.string().trim().max(200),
  empresa: z.enum(EMPRESAS, "Elegí la empresa"),
  // Cerrado no: un evento cerrado pasaría a Financiero, y esto es solo un presupuesto.
  estado: z.enum(["planificado", "en_curso"]),
  modo: z.enum(["importes", "estructura"]),
});

/**
 * Crea un evento nuevo con la planilla de otro como base (presupuesto). No
 * toca el evento original ni genera movimientos en Financiero o cuentas
 * corrientes: el evento nuevo no está cerrado. La clave evita duplicar si se
 * envía dos veces.
 */
export async function duplicarPlanilla(origenId: string, datos: z.input<typeof esquema>, clave: string): Promise<{ error?: string; id?: string }> {
  const v = esquema.safeParse(datos);
  if (!v.success) return { error: v.error.issues[0].message };
  if (!z.uuid().safeParse(origenId).success || !z.uuid().safeParse(clave).success) return { error: "Datos inválidos" };
  const { usuario, tipo } = await exigirPermisoEvento(origenId, "evento", "editar");
  // En Quilmes, sin permiso de costos se copian solo las Solicitudes (no se ven ni se copian los gastos reales).
  const conPlanilla = puedeEnEvento(usuario, tipo, "costos", "editar");
  const supabase = await crearClienteServidor();

  // Mismo envío repetido: devuelve el evento que ya se creó.
  const { data: ya } = await supabase.from("eventos").select("id").eq("copia_clave", clave).maybeSingle();
  if (ya) return { id: ya.id };

  const [{ data: origen }, { data: guardada }, { data: solicitudes }] = await Promise.all([
    supabase.from("eventos").select("id, nombre").eq("id", origenId).maybeSingle(),
    conPlanilla ? supabase.from("planillas_evento").select("datos").eq("evento_id", origenId).maybeSingle() : Promise.resolve({ data: null }),
    tipo === "quilmes"
      ? supabase.from("quilmes_solicitudes").select("id, orden, detalle, neto, tipo_iva, iva").eq("evento_id", origenId).order("orden")
      : Promise.resolve({ data: [] as { id: string; orden: number; detalle: string; neto: number; tipo_iva: string; iva: number }[] }),
  ]);
  if (!origen) return { error: "El evento original no existe" };
  const leida = esquemaPlanilla.safeParse(guardada?.datos ?? {});
  const leidaOriginal = leida.success ? leida.data : PLANILLA_VACIA;
  // El ingreso que sale de las Solicitudes no se copia como ingreso: se vuelve a calcular en el nuevo.
  const original = { ...leidaOriginal, ingresos: leidaOriginal.ingresos.filter((i) => !esIngresoQuilmes(i.id)) };
  // Solicitudes con ids nuevos; los gastos reales quedan vinculados a la copia de su solicitud.
  const idNuevo = new Map((solicitudes ?? []).map((s) => [s.id, randomUUID()]));
  const conImportes = v.data.modo === "importes";

  // Proveedores con cuenta corriente: solo los habilitados para la empresa del evento nuevo.
  const validos = new Set((await proveedoresParaEvento(v.data.empresa)).map((p) => p.id));
  const copiada = planillaCopiada(original, v.data.modo, (id) => validos.has(id));
  const planilla = { ...copiada, gastos: copiada.gastos.map((g) => ({ ...g, solicitud_id: g.solicitud_id ? (idNuevo.get(g.solicitud_id) ?? null) : null })) };

  const { data: nuevo, error } = await supabase
    .from("eventos")
    .insert({
      nombre: v.data.nombre,
      fecha: v.data.fecha,
      lugar: v.data.lugar || null,
      empresa: v.data.empresa,
      estado: v.data.estado,
      tipo,
      notas: `Planilla duplicada de "${origen.nombre}"`,
      copiado_de: origen.id,
      copia_clave: clave,
    })
    .select("id")
    .single();
  if (error || !nuevo) {
    // Otro envío con la misma clave ganó la carrera.
    const { data: otro } = await supabase.from("eventos").select("id").eq("copia_clave", clave).maybeSingle();
    return otro ? { id: otro.id } : { error: "No se pudo crear el evento" };
  }
  if (solicitudes?.length) {
    const { error: errorSolicitudes } = await supabase.rpc("quilmes_guardar_solicitudes", {
      p_evento_id: nuevo.id,
      p_lista: solicitudes.map((s, i) => ({ id: idNuevo.get(s.id), orden: i, detalle: s.detalle, tipo_iva: s.tipo_iva, neto: conImportes ? Number(s.neto) : 0, iva: conImportes ? Number(s.iva) : 0 })),
    });
    if (errorSolicitudes) {
      await supabase.from("eventos").delete().eq("id", nuevo.id);
      return { error: "No se pudieron copiar las solicitudes" };
    }
  }
  if (conPlanilla) {
    const { error: errorPlanilla } = await supabase.from("planillas_evento").insert({ evento_id: nuevo.id, datos: planilla });
    if (errorPlanilla) {
      await supabase.from("eventos").delete().eq("id", nuevo.id);
      return { error: "No se pudo copiar la planilla" };
    }
  }
  return { id: nuevo.id };
}
