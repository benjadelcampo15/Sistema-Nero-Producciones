/** Plantillas de Excel para cargar datos en la app (se descargan en Configuración → Plantillas Excel). */

export type Columna = { titulo: string; clave: string; ayuda: string; obligatoria?: boolean };

export type Plantilla = {
  id: "stock-movimientos" | "stock-productos" | "livings";
  nombre: string;
  descripcion: string;
  /** Dónde se sube el Excel completo. */
  dondeSeSube: { texto: string; href: string };
  /** Permiso necesario para que la plantilla traiga las listas de nombres actuales. */
  seccion: "stock" | "livings";
  columnas: Columna[];
  ejemplos: (string | number)[][];
};

export const PLANTILLAS: Plantilla[] = [
  {
    id: "stock-movimientos",
    nombre: "Stock: movimientos",
    descripcion: "Entradas, salidas, ajustes de inventario y transferencias entre depósitos. Una fila por movimiento.",
    dondeSeSube: { texto: "Stock → Importar Excel", href: "/stock/importar" },
    seccion: "stock",
    columnas: [
      { titulo: "Tipo", clave: "tipo", obligatoria: true, ayuda: "Entrada, Salida, Ajuste o Transferencia." },
      { titulo: "Producto", clave: "producto", obligatoria: true, ayuda: "Nombre (o código) del producto, como figura en Stock → Productos." },
      { titulo: "Depósito", clave: "deposito", obligatoria: true, ayuda: "Depósito del movimiento (en una transferencia, el de origen)." },
      { titulo: "Depósito destino", clave: "destino", ayuda: "Solo para transferencias: a qué depósito va." },
      { titulo: "Cantidad", clave: "cantidad", obligatoria: true, ayuda: "En un Ajuste va lo que se contó físicamente (la app registra la diferencia)." },
      { titulo: "Costo unitario", clave: "costo", ayuda: "Opcional, para entradas." },
      { titulo: "Fecha", clave: "fecha", ayuda: "dd/mm/aaaa. Vacía = hoy." },
      { titulo: "Evento", clave: "evento", ayuda: "Opcional: nombre del evento (por ejemplo, para salidas que se consumieron en un evento)." },
      { titulo: "Motivo", clave: "motivo", ayuda: "Opcional." },
    ],
    ejemplos: [
      ["Entrada", "Fernet Branca 750cc", "Centro", "", 24, 9500, "27/10/2026", "", "Compra"],
      ["Salida", "Fernet Branca 750cc", "Centro", "", 6, "", "28/10/2026", "Gauchito", "Consumo del evento"],
      ["Transferencia", "Fernet Branca 750cc", "Centro", "Isidris", 10, "", "28/10/2026", "", ""],
      ["Ajuste", "Fernet Branca 750cc", "Isidris", "", 9, "", "29/10/2026", "", "Conteo de inventario"],
    ],
  },
  {
    id: "stock-productos",
    nombre: "Stock: productos",
    descripcion: "Alta de productos nuevos o actualización de los que ya existen (se reconocen por el nombre).",
    dondeSeSube: { texto: "Stock → Importar Excel", href: "/stock/importar" },
    seccion: "stock",
    columnas: [
      { titulo: "Nombre", clave: "nombre", obligatoria: true, ayuda: "Nombre del producto." },
      { titulo: "Unidad", clave: "unidad", ayuda: "unidad, botella, caja, pack, kg, litro o metro. Vacía = unidad." },
      { titulo: "Código", clave: "codigo", ayuda: "Opcional (código interno o de barras)." },
      { titulo: "Stock mínimo", clave: "minimo", ayuda: "Opcional: cuando el stock baja de esto, se avisa." },
    ],
    ejemplos: [
      ["Fernet Branca 750cc", "botella", "FB750", 24],
      ["Hielo bolsa 2kg", "unidad", "", 50],
      ["Vaso trago 400cc", "pack", "VT400", 10],
    ],
  },
  {
    id: "livings",
    nombre: "Livings VIP",
    descripcion: "Livings con reserva para el plano del jardín y el salón.",
    dondeSeSube: { texto: "Livings VIP → Subir Excel", href: "/livings" },
    seccion: "livings",
    columnas: [
      { titulo: "Nombre", clave: "nombre", obligatoria: true, ayuda: "Nombre del living o de quien reserva." },
      { titulo: "Personas", clave: "personas", ayuda: "Cantidad de personas (define el tamaño del living)." },
      { titulo: "Consumición", clave: "consumicion", ayuda: "Consumición mínima en $." },
      { titulo: "Notas", clave: "notas", ayuda: "Opcional." },
      { titulo: "Lugar", clave: "lugar", ayuda: "Opcional: Jardín o Salón. Vacío = lo decide la app." },
    ],
    ejemplos: [
      ["Living Quilmes", 12, 1200000, "Sponsor", ""],
      ["Living Pérez", 8, 600000, "Cumpleaños", "Jardín"],
      ["Living Martínez", 4, 300000, "", "Salón"],
    ],
  },
];

export const plantilla = (id: string) => PLANTILLAS.find((p) => p.id === id) ?? null;

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** Columna del Excel → clave de la plantilla (por título, sin importar mayúsculas ni acentos). */
export function claveDeTitulo(p: Plantilla, titulo: string) {
  const t = normalizar(titulo);
  return p.columnas.find((c) => normalizar(c.titulo) === t || normalizar(c.clave) === t)?.clave ?? null;
}
