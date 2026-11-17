"use server";

import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { EMPRESAS } from "@/lib/empresas";
import { PLANILLA_VACIA, esquemaPlanilla, planillaCopiada } from "./planilla";
import { proveedoresParaEvento } from "./cuenta-gastos";

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
  await exigirPermiso("eventos", "editar");
  const v = esquema.safeParse(datos);
  if (!v.success) return { error: v.error.issues[0].message };
  if (!z.uuid().safeParse(origenId).success || !z.uuid().safeParse(clave).success) return { error: "Datos inválidos" };
  const supabase = await crearClienteServidor();

  // Mismo envío repetido: devuelve el evento que ya se creó.
  const { data: ya } = await supabase.from("eventos").select("id").eq("copia_clave", clave).maybeSingle();
  if (ya) return { id: ya.id };

  const [{ data: origen }, { data: guardada }] = await Promise.all([
    supabase.from("eventos").select("id, nombre").eq("id", origenId).maybeSingle(),
    supabase.from("planillas_evento").select("datos").eq("evento_id", origenId).maybeSingle(),
  ]);
  if (!origen) return { error: "El evento original no existe" };
  const leida = esquemaPlanilla.safeParse(guardada?.datos ?? {});
  const original = leida.success ? leida.data : PLANILLA_VACIA;

  // Proveedores con cuenta corriente: solo los habilitados para la empresa del evento nuevo.
  const validos = new Set((await proveedoresParaEvento(v.data.empresa)).map((p) => p.id));
  const planilla = planillaCopiada(original, v.data.modo, (id) => validos.has(id));

  const { data: nuevo, error } = await supabase
    .from("eventos")
    .insert({
      nombre: v.data.nombre,
      fecha: v.data.fecha,
      lugar: v.data.lugar || null,
      empresa: v.data.empresa,
      estado: v.data.estado,
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
  const { error: errorPlanilla } = await supabase.from("planillas_evento").insert({ evento_id: nuevo.id, datos: planilla });
  if (errorPlanilla) {
    await supabase.from("eventos").delete().eq("id", nuevo.id);
    return { error: "No se pudo copiar la planilla" };
  }
  return { id: nuevo.id };
}
