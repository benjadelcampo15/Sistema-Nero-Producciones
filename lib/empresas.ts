/** Las dos empresas: cada movimiento, evento, factura y objetivo es de una. El cashflow suma las dos. */
export const EMPRESAS = ["nero", "ruta"] as const;
export type Empresa = (typeof EMPRESAS)[number];
export const NOMBRE_EMPRESA: Record<Empresa, string> = { nero: "Nero", ruta: "Ruta" };

/** Empresa de un parámetro de la URL o un formulario; cualquier otra cosa es Nero. */
export const leerEmpresa = (valor: unknown): Empresa => (valor === "ruta" ? "ruta" : "nero");
