"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

const esquema = z
  .array(
    z.object({
      producto_id: z.uuid(),
      cantidad: z.number().min(0).max(1e9).nullable(),
      nota: z.string().trim().max(300).nullable(),
    }),
  )
  .max(1000);

/** Guarda los productos que se usan en el evento (lista para preparar; no mueve stock). */
export async function guardarStockEvento(eventoId: string, lista: unknown): Promise<{ error?: string }> {
  await exigirPermiso("stock", "editar");
  const v = esquema.safeParse(lista);
  if (!v.success || !z.uuid().safeParse(eventoId).success) return { error: "Datos inválidos" };
  if (new Set(v.data.map((i) => i.producto_id)).size !== v.data.length) return { error: "Hay un producto repetido" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_stock_evento", {
    p_evento_id: eventoId,
    p_lista: v.data.map((i, orden) => ({ ...i, nota: i.nota || null, orden })),
  });
  if (error) return { error: "No se pudo guardar la lista" };
  refresh();
  return {};
}
