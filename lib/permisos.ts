export const SECCIONES = [
  { id: "financiero", nombre: "Financiero", href: "/financiero" },
  { id: "objetivos", nombre: "Objetivos", href: "/objetivos" },
  { id: "facturas", nombre: "Facturas", href: "/facturas" },
  { id: "facturar", nombre: "Facturar", href: "/facturar" },
  { id: "cheques", nombre: "Cheques", href: "/cheques" },
  { id: "stock", nombre: "Stock", href: "/stock" },
  { id: "eventos", nombre: "Eventos", href: "/eventos" },
  { id: "presupuestos", nombre: "Presupuestos", href: "/presupuestos" },
  { id: "livings", nombre: "Livings VIP", href: "/livings" },
  { id: "operativa", nombre: "Empleados", href: "/empleados" },
] as const;

/**
 * Menú lateral: grupos desplegables y, en cada uno, las pantallas con el
 * permiso que hace falta para verlas (varias pantallas usan el de otra sección).
 */
export const MENU = [
  {
    grupo: "Administración",
    items: [
      { nombre: "Financiero", href: "/financiero", permiso: "financiero" },
      { nombre: "Cashflow", href: "/cashflow", permiso: "financiero" },
      { nombre: "Saldos bancarios", href: "/saldos", permiso: "financiero" },
      { nombre: "Extractos bancarios", href: "/extractos", permiso: "financiero" },
      { nombre: "Objetivos", href: "/objetivos", permiso: "objetivos" },
    ],
  },
  {
    grupo: "Contabilidad",
    items: [
      { nombre: "Proveedores", href: "/facturas", permiso: "facturas" },
      { nombre: "Clientes", href: "/facturar", permiso: "facturar" },
      { nombre: "Cheques", href: "/cheques", permiso: "cheques" },
      { nombre: "Libros contables", href: "/contabilidad", permiso: "financiero" },
    ],
  },
  {
    grupo: "Stock",
    items: [
      { nombre: "Stock", href: "/stock", permiso: "stock" },
      { nombre: "Pedidos", href: "/stock/pedidos", permiso: "stock" },
    ],
  },
  {
    grupo: "Eventos",
    items: [
      { nombre: "Eventos", href: "/eventos", permiso: "eventos" },
      { nombre: "Presupuestos", href: "/presupuestos", permiso: "presupuestos" },
      { nombre: "Livings VIP", href: "/livings", permiso: "livings" },
      { nombre: "Empleados", href: "/empleados", permiso: "operativa" },
    ],
  },
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
  return { financiero: "ninguno", eventos: "ninguno", facturas: "ninguno", stock: "ninguno", facturar: "ninguno", presupuestos: "ninguno", cheques: "ninguno", livings: "ninguno", operativa: "ninguno", objetivos: "ninguno" };
}
