import { Suspense } from "react";
import { obtenerUsuario } from "@/lib/auth/sesion";
import { salir } from "@/lib/auth/acciones";
import { MENU } from "@/lib/permisos";
import { EnlacesMenu, type GrupoMenu } from "./enlaces-menu";

export default function LayoutApp({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-stone-950 text-stone-300 md:w-60 print:hidden">
        <div className="px-5 py-5">
          <p className="text-lg font-black tracking-[0.2em] text-white">ÓRBITA</p>
          <p className="text-[10px] leading-snug text-stone-500">Toda la operación de la empresa alrededor de un mismo sistema</p>
        </div>
        <Suspense fallback={<div className="flex-1" />}>
          <Menu />
        </Suspense>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8 print:p-0">{children}</main>
    </div>
  );
}

async function Menu() {
  const usuario = await obtenerUsuario();

  // Cada grupo con las pantallas que el usuario puede ver; un grupo vacío no aparece.
  const grupos: GrupoMenu[] = MENU.map((g) => ({
    nombre: g.grupo,
    items: g.items.filter((i) => usuario.permisos[i.permiso] !== "ninguno").map(({ nombre, href }) => ({ nombre, href })),
  }));
  grupos.push({
    nombre: "Configuración",
    items: [...(usuario.esAdmin ? [{ href: "/configuracion/usuarios", nombre: "Usuarios" }] : []), { href: "/plantillas", nombre: "Plantillas Excel" }],
  });
  return (
    <div className="flex flex-1 flex-col">
      <EnlacesMenu grupos={grupos.filter((g) => g.items.length > 0)} />
      <div className="border-t border-stone-800 px-5 py-4">
        <p className="truncate text-sm font-medium text-white">{usuario.nombre}</p>
        <p className="truncate text-xs text-stone-500">{usuario.email}</p>
        <form action={salir} className="mt-3">
          <button type="submit" className="text-xs text-stone-400 hover:text-white">
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
