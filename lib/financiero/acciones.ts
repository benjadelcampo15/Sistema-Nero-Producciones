"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { parsearMonto } from "@/lib/formato";
import { EMPRESAS, ESTADOS_MOVIMIENTO, MEDIOS_CHEQUE, MEDIOS_PAGO, TIPOS, type EstadoMovimiento } from "./tipos";

export type EstadoFormulario = {
  error?: string;
  ok?: string;
  /** Lo que el usuario cargó, para no perderlo cuando hay un error (React resetea el form). */
  valores?: Record<string, string>;
};

function valoresDe(formData: FormData) {
  return Object.fromEntries(
    [...formData.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$")),
  ) as Record<string, string>;
}

const textoOpcional = z
  .string()
  .trim()
  .max(500)
  .transform((v) => v || null);

const esquemaTransaccion = z.object({
  empresa: z.enum(EMPRESAS, "Elegí la empresa"),
  tipo: z.enum(TIPOS, "Elegí si es ingreso o egreso"),
  // Vacía = sin fecha (no entra al cashflow hasta que se le ponga).
  fecha: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"), z.literal("")]).transform((v) => v || null),
  monto: z.string(),
  descripcion: z.string().trim().min(1, "Falta la descripción").max(200),
  categoria_id: z.uuid("Elegí una categoría"),
  evento_id: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  contraparte: textoOpcional,
  medio_pago: z.enum(MEDIOS_PAGO, "Elegí el medio de pago"),
  estado: z.enum(ESTADOS_MOVIMIENTO, "Elegí el estado"),
  // Casilla: llega "on" si está marcada y no llega si no.
  facturado: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  iva: z.string().optional().default(""),
  iibb: z.string().optional().default(""),
  notas: textoOpcional,
});

/** Solo se vuelve a pantallas propias (evita redirecciones a sitios externos). */
function destinoSeguro(valor: FormDataEntryValue | null) {
  const texto = typeof valor === "string" ? valor : "";
  return /^\/(financiero|eventos)(\/[\w-]*)*(\?[\w=&%.+-]*)?$/.test(texto) ? texto : "/financiero";
}

/** Crea (id = null) o edita una transacción. La base valida permisos con RLS. */
export async function guardarTransaccion(
  id: string | null,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuario = await obtenerUsuario();
  const valores = valoresDe(formData);

  const datos = esquemaTransaccion.safeParse(Object.fromEntries(formData));
  if (!datos.success) {
    return { error: datos.error.issues[0].message, valores };
  }
  const monto = parsearMonto(datos.data.monto);
  if (monto === null || monto <= 0) {
    return { error: "Monto inválido. Ejemplos válidos: 15000 · 15.000 · 15.000,50", valores };
  }

  const conEvento = datos.data.evento_id !== null;
  if (!puede(usuario, "financiero", "editar") && !(conEvento && puede(usuario, "eventos", "editar"))) {
    return { error: "No tenés permiso para cargar este movimiento", valores };
  }

  const iva = datos.data.iva.trim() ? parsearMonto(datos.data.iva) : null;
  const iibb = datos.data.iibb.trim() ? parsearMonto(datos.data.iibb) : null;
  if ((datos.data.iva.trim() && iva === null) || (datos.data.iibb.trim() && iibb === null)) {
    return { error: "IVA o IIBB inválido", valores };
  }

  // Cheque: con un medio de pago con cheque se carga (o actualiza) en la sección Cheques.
  const cheque = MEDIOS_CHEQUE.includes(datos.data.medio_pago) && formData.get("cargar_cheque") === "on" ? leerCheque(formData) : null;
  if (typeof cheque === "string") return { error: cheque, valores };
  if (cheque && !puede(usuario, "cheques", "editar")) {
    return { error: "Para cargar el cheque necesitás permiso de edición en Cheques", valores };
  }

  const fila = { ...datos.data, monto, iva, iibb };
  const supabase = await crearClienteServidor();
  // Con .select() se detecta cuando RLS no deja escribir (no da error, afecta 0 filas).
  const { data: escritas, error } = id
    ? await supabase.from("transacciones").update(fila).eq("id", id).is("eliminado_en", null).select("id")
    : await supabase.from("transacciones").insert(fila).select("id");

  if (error || !escritas?.length) {
    return {
      error: error?.message.includes("categoría")
        ? "La categoría no corresponde al tipo de movimiento"
        : "No se pudo guardar el movimiento",
      valores,
    };
  }

  if (cheque) {
    const { error: errorCheque } = await supabase.from("cheques").upsert(
      {
        transaccion_id: escritas[0].id,
        empresa: fila.empresa,
        tipo: fila.tipo === "egreso" ? "emitido" : "recibido",
        monto,
        contraparte: fila.contraparte || fila.descripcion,
        evento_id: fila.evento_id,
        ...cheque,
      },
      { onConflict: "transaccion_id" },
    );
    if (errorCheque) {
      // El movimiento ya quedó guardado: se vuelve a su edición para reintentar el cheque.
      redirect(`/financiero/${escritas[0].id}/editar?volver_a=${encodeURIComponent(destinoSeguro(formData.get("volver_a")))}&cheque=error`);
    }
  }

  redirect(destinoSeguro(formData.get("volver_a")));
}

/** Datos del cheque del formulario del movimiento, o el error para mostrar. */
function leerCheque(formData: FormData) {
  const texto = (campo: string, max: number) => String(formData.get(campo) ?? "").trim().slice(0, max) || null;
  const fechaPago = String(formData.get("cheque_fecha_pago") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) return "Falta la fecha de pago del cheque";
  return {
    numero: texto("cheque_numero", 40),
    banco: texto("cheque_banco", 100),
    fecha_pago: fechaPago,
    electronico: formData.get("cheque_electronico") === "on",
  };
}

/** Cambia solo el estado (real, pendiente, proyectado) desde la lista de movimientos. */
export async function cambiarEstadoMovimiento(id: string, estado: EstadoMovimiento): Promise<{ error?: string }> {
  await obtenerUsuario();
  if (!ESTADOS_MOVIMIENTO.includes(estado)) return { error: "Estado inválido" };
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("transacciones").update({ estado }).eq("id", id).is("eliminado_en", null).select("id");
  if (!data?.length) return { error: "No se pudo cambiar el estado" };
  refresh();
  return {};
}

export async function eliminarTransaccion(id: string): Promise<EstadoFormulario> {
  await obtenerUsuario();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("transacciones")
    .update({ eliminado_en: new Date().toISOString() })
    .eq("id", id)
    .is("eliminado_en", null)
    .select("id");

  if (error || !data?.length) {
    return { error: "No se pudo eliminar el movimiento" };
  }
  refresh();
  return { ok: "Movimiento eliminado" };
}

const esquemaCategoria = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre").max(60),
  tipo: z.enum(TIPOS, "Elegí el tipo"),
});

export async function crearCategoria(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await obtenerUsuario();
  const datos = esquemaCategoria.safeParse(Object.fromEntries(formData));
  if (!datos.success) {
    return { error: datos.error.issues[0].message };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("categorias").insert(datos.data);
  if (error) {
    return {
      error: error.code === "23505" ? "Ya existe una categoría con ese nombre" : "No se pudo crear la categoría",
    };
  }
  refresh();
  return { ok: "Categoría creada" };
}

export async function cambiarEstadoCategoria(id: string, activa: boolean): Promise<EstadoFormulario> {
  await obtenerUsuario();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("categorias").update({ activa }).eq("id", id).select("id");
  if (error || !data?.length) {
    return { error: "No se pudo actualizar la categoría" };
  }
  refresh();
  return {};
}

/**
 * Registra el pago (o cobro) de un movimiento pendiente o proyectado. Si se
 * paga todo, pasa a real con la fecha del pago. Si se paga una parte, se crea
 * un movimiento real por lo pagado y el pendiente queda por lo que falta (el
 * IVA se reparte en proporción). Así el cashflow muestra lo que de verdad salió.
 */
export async function registrarPago(id: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await obtenerUsuario();
  const valores = valoresDe(formData);
  const monto = parsearMonto(String(formData.get("monto") ?? ""));
  const fecha = String(formData.get("fecha") ?? "");
  const medio = String(formData.get("medio_pago") ?? "");
  if (monto === null || monto <= 0) return { error: "Monto inválido", valores };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida", valores };
  if (!(MEDIOS_PAGO as readonly string[]).includes(medio)) return { error: "Elegí el medio de pago", valores };

  const supabase = await crearClienteServidor();
  const { data: t } = await supabase
    .from("transacciones")
    .select("empresa, tipo, monto, iva, descripcion, categoria_id, evento_id, contraparte, facturado, notas, estado")
    .eq("id", id)
    .is("eliminado_en", null)
    .maybeSingle();
  if (!t) return { error: "Movimiento no encontrado", valores };
  if (t.estado === "real") return { error: "Este movimiento ya está pagado", valores };
  const total = Number(t.monto);
  if (monto > total + 0.005) return { error: `El pago no puede superar el monto pendiente (${total.toLocaleString("es-AR")})`, valores };

  const fechaTexto = fecha.split("-").reverse().join("/");
  const nota = (n: string | null, agregado: string) => [n, agregado].filter(Boolean).join(" · ").slice(0, 500);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  if (monto >= total - 0.005) {
    // Pago total: el mismo movimiento pasa a real.
    const { data } = await supabase.from("transacciones").update({ estado: "real", fecha, medio_pago: medio }).eq("id", id).select("id");
    if (!data?.length) return { error: "No se pudo registrar el pago", valores };
  } else {
    const ivaTotal = t.iva === null ? null : Number(t.iva);
    const ivaPagado = ivaTotal === null ? null : r2((ivaTotal * monto) / total);
    const resta = r2(total - monto);
    const palabra = t.tipo === "egreso" ? "Pago" : "Cobro";
    const { error: errorNuevo } = await supabase.from("transacciones").insert({
      empresa: t.empresa,
      tipo: t.tipo,
      monto: r2(monto),
      fecha,
      descripcion: t.descripcion,
      categoria_id: t.categoria_id,
      evento_id: t.evento_id,
      contraparte: t.contraparte,
      medio_pago: medio,
      estado: "real",
      facturado: t.facturado,
      iva: ivaPagado,
      notas: `${palabra} parcial de “${t.descripcion}” (quedaron $${resta.toLocaleString("es-AR")} pendientes)`.slice(0, 500),
    });
    if (errorNuevo) return { error: "No se pudo registrar el pago", valores };
    const { data } = await supabase
      .from("transacciones")
      .update({
        monto: resta,
        iva: ivaTotal === null ? null : r2(ivaTotal - (ivaPagado ?? 0)),
        notas: nota(t.notas, `${palabra} parcial $${r2(monto).toLocaleString("es-AR")} el ${fechaTexto}`),
      })
      .eq("id", id)
      .select("id");
    if (!data?.length) return { error: "Se registró el pago pero no se pudo actualizar lo pendiente. Revisá el movimiento.", valores };
  }
  refresh();
  return { ok: "Pago registrado" };
}
