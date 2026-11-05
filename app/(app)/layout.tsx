import { Suspense } from "react";
import { obtenerUsuario } from "@/lib/auth/sesion";
import { salir } from "@/lib/auth/acciones";
import { MENU } from "@/lib/permisos";
import { LogoPlanix } from "@/components/logo-planix";
import { MODO_DEMO } from "@/lib/cliente";
import { EnlacesMenu, type GrupoMenu } from "./enlaces-menu";
import { BarraLateral } from "./barra-lateral";
import { EtiquetasTablas } from "./etiquetas-tablas";
import Link from "next/link";
import { centralConfigurada } from "@/lib/solicitudes/central";
import { cantidadNovedades } from "@/lib/solicitudes/consultas";

const encabezado = (
  <div className="px-5 py-3 md:py-5">
    <div className="flex items-center gap-2.5 text-white">
      <LogoPlanix className="h-9 w-9 shrink-0" />
      <p className="text-lg font-black tracking-[0.2em]">PLANIX</p>
    </div>
  </div>
);

export default function LayoutApp({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* En la compu la barra queda fija a la altura de la pantalla: el usuario y "Cerrar sesión" siempre se ven. */}
      <aside className="flex shrink-0 flex-col bg-stone-950 text-stone-300 md:sticky md:top-0 md:h-screen md:w-60 print:hidden">
        {/* La barra lee la pantalla actual (para la flecha de volver): mientras carga, solo el logo. */}
        <Suspense fallback={encabezado}>
          <BarraLateral encabezado={encabezado}>
            <Suspense fallback={<div className="flex-1" />}>
              <Menu />
            </Suspense>
          </BarraLateral>
        </Suspense>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8 print:p-0">
        {MODO_DEMO && (
          <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 print:hidden">
            <span className="font-semibold">Modo demo:</span> los datos son ficticios y se reinician todas las noches. Probá lo que quieras.
          </p>
        )}
        <Suspense fallback={null}>
          <AvisoSolicitudes />
        </Suspense>
        {children}
        <EtiquetasTablas />
      </main>
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
  if (centralConfigurada()) {
    grupos.push({ nombre: "Planix", items: [{ href: "/solicitudes", nombre: "Solicitudes y mejoras", aviso: await cantidadNovedades(usuario) }] });
  }
  grupos.push({
    nombre: "Configuración",
    items: [...(usuario.esAdmin ? [{ href: "/configuracion/usuarios", nombre: "Usuarios" }] : []), { href: "/plantillas", nombre: "Plantillas Excel" }],
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Si el menú no entra, se desplaza solo el menú. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EnlacesMenu grupos={grupos.filter((g) => g.items.length > 0)} />
      </div>
      <div className="shrink-0 border-t border-stone-800 px-5 py-4">
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

/** Aviso arriba de todo cuando hay novedades en el Centro de Solicitudes (se ve también en el celular). */
async function AvisoSolicitudes() {
  if (!centralConfigurada()) return null;
  const novedades = await cantidadNovedades(await obtenerUsuario());
  if (!novedades) return null;
  return (
    <Link href="/solicitudes" className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900 hover:bg-red-100 print:hidden">
      <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{novedades}</span>
      {novedades === 1 ? "Hay una novedad" : `Hay ${novedades} novedades`} en Solicitudes y mejoras →
    </Link>
  );
}
