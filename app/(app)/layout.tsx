import { Suspense } from "react";
import { obtenerUsuario } from "@/lib/auth/sesion";
import { salir } from "@/lib/auth/acciones";
import { PANTALLAS_EXTRA, SECCIONES } from "@/lib/permisos";
import { EnlacesMenu, type ItemMenu } from "./enlaces-menu";

export default function LayoutApp({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-stone-950 text-stone-300 md:w-60 print:hidden">
        <div className="px-5 py-5">
          <p className="text-lg font-black tracking-[0.3em] text-white">NERO</p>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Producciones</p>
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

  const items: ItemMenu[] = SECCIONES.filter((s) => usuario.permisos[s.id] !== "ninguno").flatMap((s) => [
    { href: s.href, nombre: s.nombre, grupo: s.grupo },
    ...PANTALLAS_EXTRA.filter((p) => p.permiso === s.id).map((p) => ({ href: p.href, nombre: p.nombre, grupo: p.grupo })),
  ]);
  if (usuario.esAdmin) {
    items.push({ href: "/configuracion/usuarios", nombre: "Usuarios", grupo: "Configuración" });
  }

  // Agrupados en el orden del menú; un grupo sin secciones visibles no aparece.
  const grupos = ["Administración", "Eventos", "Configuración"]
    .map((nombre) => ({ nombre, items: items.filter((i) => i.grupo === nombre) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-1 flex-col">
      <EnlacesMenu grupos={grupos} />
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
