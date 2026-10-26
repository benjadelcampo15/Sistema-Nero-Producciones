export const SECCIONES = [
  { id: "financiero", nombre: "Financiero", href: "/financiero", grupo: "Administración" },
  { id: "facturas", nombre: "Facturas", href: "/facturas", grupo: "Administración" },
  { id: "facturar", nombre: "Facturar", href: "/facturar", grupo: "Administración" },
  { id: "cheques", nombre: "Cheques", href: "/cheques", grupo: "Administración" },
  { id: "stock", nombre: "Stock", href: "/stock", grupo: "Administración" },
  { id: "eventos", nombre: "Eventos", href: "/eventos", grupo: "Eventos" },
  { id: "presupuestos", nombre: "Presupuestos", href: "/presupuestos", grupo: "Eventos" },
  { id: "livings", nombre: "Livings VIP", href: "/livings", grupo: "Eventos" },
  { id: "operativa", nombre: "Empleados", href: "/empleados", grupo: "Eventos" },
] as const;

/**
 * Pantallas que usan el permiso de otra sección (no tienen permiso propio): se
 * muestran en el menú después de esa sección.
 */
export const PANTALLAS_EXTRA = [
  { permiso: "financiero", nombre: "Cashflow", href: "/cashflow", grupo: "Administración" },
  { permiso: "financiero", nombre: "Saldos bancarios", href: "/saldos", grupo: "Administración" },
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
  return { financiero: "ninguno", eventos: "ninguno", facturas: "ninguno", stock: "ninguno", facturar: "ninguno", presupuestos: "ninguno", cheques: "ninguno", livings: "ninguno", operativa: "ninguno" };
}
