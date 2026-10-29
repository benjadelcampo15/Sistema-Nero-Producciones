/** Las dos empresas: cada movimiento, evento, factura y objetivo es de una. El cashflow suma las dos. */
export const EMPRESAS = ["nero", "ruta"] as const;
export type Empresa = (typeof EMPRESAS)[number];

/**
 * Nombres que se muestran. En la base siguen siendo "nero" y "ruta"; cada
 * instalación puede llamarlas distinto con NEXT_PUBLIC_EMPRESAS="Primera,Segunda".
 */
const [primera, segunda] = (process.env.NEXT_PUBLIC_EMPRESAS ?? "").split(",").map((n) => n.trim());
export const NOMBRE_EMPRESA: Record<Empresa, string> = { nero: primera || "Nero", ruta: segunda || "Ruta" };

/** Empresa de un parámetro de la URL o un formulario; cualquier otra cosa es la primera. */
export const leerEmpresa = (valor: unknown): Empresa => (valor === "ruta" ? "ruta" : "nero");
