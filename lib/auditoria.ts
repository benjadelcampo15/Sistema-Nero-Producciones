import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";

type Registro = {
  usuarioId: string;
  accion: string;
  tabla: string;
  registroId: string;
  antes?: unknown;
  despues?: unknown;
};

/**
 * Registra una acción hecha con la clave secreta. Los triggers de auditoría
 * no ven al usuario en ese caso (auth.uid() es null), por eso se anota acá.
 */
export async function registrarAuditoria(r: Registro) {
  const { error } = await crearClienteAdmin()
    .from("auditoria")
    .insert({
      usuario_id: r.usuarioId,
      accion: r.accion,
      tabla: r.tabla,
      registro_id: r.registroId,
      antes: r.antes ?? null,
      despues: r.despues ?? null,
    });
  if (error) {
    throw new Error(`No se pudo registrar la auditoría: ${error.message}`);
  }
}
