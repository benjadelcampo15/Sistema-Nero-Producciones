export const SECCIONES = [
  { id: "financiero", nombre: "Financiero", href: "/financiero" },
  { id: "eventos", nombre: "Eventos", href: "/eventos" },
  { id: "facturas", nombre: "Facturas", href: "/facturas" },
  { id: "stock", nombre: "Stock", href: "/stock" },
] as const;

export type Seccion = (typeof SECCIONES)[number]["id"];

/** Ordenados de menor a mayor: 'editar' incluye 'ver'. */
export const NIVELES = ["ninguno", "ver", "editar"] as const;

export type NivelPermiso = (typeof NIVELES)[number];

export const NOMBRE_NIVEL: Record<NivelPermiso, string> = {
  ninguno: "Sin acceso",
  ver: "Ver",
  editar: "Editar",
};

export type Permisos = Record<Seccion, NivelPermiso>;

export function alcanza(nivel: NivelPermiso, requerido: NivelPermiso) {
  return NIVELES.indexOf(nivel) >= NIVELES.indexOf(requerido);
}

export function sinPermisos(): Permisos {
  return { financiero: "ninguno", eventos: "ninguno", facturas: "ninguno", stock: "ninguno" };
}
