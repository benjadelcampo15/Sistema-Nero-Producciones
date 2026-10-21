import { obtenerUsuario } from "@/lib/auth/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { sinPermisos, type NivelPermiso, type Seccion } from "@/lib/permisos";
import { SinAcceso } from "../../sin-acceso";
import { FormularioNuevoUsuario } from "./formulario-nuevo";
import { FilaUsuario, type UsuarioListado } from "./fila-usuario";

export default async function PaginaUsuarios() {
  const actual = await obtenerUsuario();
  if (!actual.esAdmin) return <SinAcceso />;

  // Perfiles y permisos se leen con la sesión del admin (pasa por RLS);
  // el estado del 2FA y el último ingreso solo los tiene la API de Auth.
  const supabase = await crearClienteServidor();
  const [{ data: perfiles }, { data: permisos }, { data: auth }] = await Promise.all([
    supabase.from("perfiles").select("id, nombre, email, es_admin, activo, debe_cambiar_contrasena").order("nombre"),
    supabase.from("permisos").select("usuario_id, seccion, nivel"),
    crearClienteAdmin().auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const usuariosAuth = new Map((auth?.users ?? []).map((u) => [u.id, u]));

  const usuarios: UsuarioListado[] = (perfiles ?? []).map((p) => {
    const suyos = sinPermisos();
    for (const fila of (permisos ?? []) as { usuario_id: string; seccion: Seccion; nivel: NivelPermiso }[]) {
      if (fila.usuario_id === p.id) suyos[fila.seccion] = fila.nivel;
    }
    const authUsuario = usuariosAuth.get(p.id);
    return {
      id: p.id,
      nombre: p.nombre,
      email: p.email,
      esAdmin: p.es_admin,
      activo: p.activo,
      debeCambiarContrasena: p.debe_cambiar_contrasena,
      tiene2FA: (authUsuario?.factors ?? []).some((f) => f.status === "verified"),
      ultimoIngreso: authUsuario?.last_sign_in_at ?? null,
      permisos: suyos,
      esUsuarioActual: p.id === actual.id,
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <p className="mt-1 text-sm text-stone-600">
          Creá usuarios y asigná qué puede ver o editar cada uno en cada sección.
        </p>
      </div>

      <FormularioNuevoUsuario />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Usuarios existentes</h2>
        <div className="space-y-2">
          {usuarios.map((u) => (
            <FilaUsuario key={u.id} usuario={u} />
          ))}
        </div>
      </section>
    </div>
  );
}
