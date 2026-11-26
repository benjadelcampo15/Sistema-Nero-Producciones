import "server-only";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { EMPRESAS, type Empresa } from "@/lib/empresas";
import { ESTADOS_MOVIMIENTO } from "@/lib/financiero/tipos";
import { hoy } from "@/lib/formato";
import { calcularCuadro, type Mov } from "./calculo";

const CAMPOS = "id, tipo, monto, fecha, estado, descripcion, contraparte, categoria_id, evento_id, categoria:categorias(nombre), evento:eventos(nombre)";
type Fila = Omit<Mov, "categoria" | "evento" | "monto"> & { monto: number | string; categoria: { nombre: string } | null; evento: { nombre: string } | null };

/**
 * Movimientos de Financiero de una empresa: los fechados del año y del
 * anterior (para comparar) y todos los sin fecha. Lo eliminado no cuenta.
 * Se lee en tandas (PostgREST devuelve hasta 1000 por vez).
 */
export async function movimientosCuadro(empresa: Empresa, anio: number): Promise<Mov[]> {
  const supabase = await crearClienteServidor();
  const leer = async (armar: () => ReturnType<typeof base>) => {
    const filas: Fila[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await armar().range(desde, desde + 999);
      if (error) throw new Error(`No se pudieron leer los movimientos: ${error.message}`);
      filas.push(...((data ?? []) as unknown as Fila[]));
      if (!data || data.length < 1000) break;
    }
    return filas;
  };
  const base = () => supabase.from("transacciones").select(CAMPOS).eq("empresa", empresa).is("eliminado_en", null).order("id");
  const [fechados, sinFecha] = await Promise.all([
    leer(() => base().gte("fecha", `${anio - 1}-01-01`).lte("fecha", `${anio}-12-31`)),
    leer(() => base().is("fecha", null)),
  ]);
  return [...fechados, ...sinFecha].map((m) => ({
    ...m,
    monto: Number(m.monto),
    categoria: m.categoria?.nombre ?? "Sin categoría",
    evento: m.evento?.nombre ?? null,
  }));
}

const esquema = z.object({
  empresa: z.enum(EMPRESAS).catch("nero"),
  anio: z.coerce.number().int().min(2000).max(2100).catch(() => Number(hoy().slice(0, 4))),
  estado: z.enum([...ESTADOS_MOVIMIENTO, "todos"]).catch("real"),
  categoria: z.union([z.uuid(), z.literal("sin")]).optional().catch(undefined),
  evento: z.union([z.uuid(), z.literal("sin")]).optional().catch(undefined),
});
export type FiltrosCuadro = z.infer<typeof esquema>;

/** Filtros desde la URL (por defecto: Nero, el año actual, lo REAL). */
export function leerFiltrosCuadro(p: Record<string, string | string[] | undefined>): FiltrosCuadro {
  const plano = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v || undefined]));
  return esquema.parse({ empresa: plano.empresa, anio: plano.anio ?? hoy().slice(0, 4), estado: plano.estado ?? "real", categoria: plano.categoria, evento: plano.evento });
}

/** El cuadro listo para mostrar (o para el PDF): siempre con datos frescos de Financiero. */
export async function obtenerCuadro(f: FiltrosCuadro) {
  const movimientos = await movimientosCuadro(f.empresa, f.anio);
  return { cuadro: calcularCuadro(movimientos, { ...f, hoy: hoy() }), movimientos };
}
