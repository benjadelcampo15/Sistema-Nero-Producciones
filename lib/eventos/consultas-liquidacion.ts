import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Categoria, Liquidacion } from "./liquidacion";

/** La liquidación del evento, o null si la sección no está activada. */
export async function obtenerLiquidacion(eventoId: string): Promise<Liquidacion | null> {
  const supabase = await crearClienteServidor();
  const [{ data: l }, { data: filas }] = await Promise.all([
    supabase.from("liquidacion_evento").select("pct_nero, comida, parking").eq("evento_id", eventoId).maybeSingle(),
    supabase
      .from("liquidacion_categorias")
      .select("id, seccion, nombre, valor, stock, cantidad, multiplicador, corona, degus, gastro, activa, orden")
      .eq("evento_id", eventoId)
      .order("orden")
      .order("creado_en"),
  ]);
  if (!l) return null;
  return {
    pctNero: Number(l.pct_nero),
    comida: l.comida,
    parking: l.parking,
    categorias: (filas ?? []).map(
      (f): Categoria => ({
        id: f.id,
        seccion: f.seccion,
        nombre: f.nombre,
        valor: Number(f.valor),
        stock: f.stock,
        cantidad: f.cantidad,
        multiplicador: f.multiplicador,
        corona: Number(f.corona),
        degus: Number(f.degus),
        gastro: Number(f.gastro),
        activa: f.activa,
        orden: f.orden,
      }),
    ),
  };
}
