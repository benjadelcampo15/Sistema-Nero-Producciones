import { read, utils, writeFile } from "xlsx";
import { parsearMonto } from "@/lib/formato";
import { nuevoId, type Living } from "./tipos";

const COLUMNAS = {
  nombre: /nombre|living|mesa|cliente|reserva|titular/i,
  personas: /persona|cantidad|cant\b|pax|invitad|lugares/i,
  consumicion: /consum|monto|importe|m[ií]nimo|precio|\$/i,
  notas: /nota|obs|comentario/i,
};

function numero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string") return parsearMonto(valor);
  return null;
}

/**
 * Lee los livings de la primera hoja de un Excel (o CSV). Busca la fila de
 * títulos (Nombre, Personas, Consumición, Notas); si no la encuentra, toma las
 * columnas en ese orden.
 */
export async function leerLivingsDeExcel(archivo: File): Promise<{ livings: Living[]; avisos: string[] }> {
  const libro = read(await archivo.arrayBuffer());
  const hoja = libro.Sheets[libro.SheetNames[0]];
  if (!hoja) return { livings: [], avisos: ["El archivo no tiene hojas"] };
  const filas = utils.sheet_to_json<unknown[]>(hoja, { header: 1, blankrows: false });

  const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
  const iTitulos = filas.slice(0, 10).findIndex((f) => f.some((c) => COLUMNAS.nombre.test(texto(c))));
  const titulos = iTitulos >= 0 ? filas[iTitulos].map(texto) : [];
  const columna = (clave: keyof typeof COLUMNAS, porDefecto: number) => {
    const i = titulos.findIndex((t) => COLUMNAS[clave].test(t));
    return iTitulos >= 0 ? i : porDefecto;
  };
  const c = { nombre: columna("nombre", 0), personas: columna("personas", 1), consumicion: columna("consumicion", 2), notas: columna("notas", 3) };

  const livings: Living[] = [];
  const avisos: string[] = [];
  filas.slice(iTitulos + 1).forEach((fila, i) => {
    const nombre = texto(fila[c.nombre]).slice(0, 120);
    if (!nombre) return;
    const personas = c.personas >= 0 ? numero(fila[c.personas]) : null;
    const consumicion = c.consumicion >= 0 ? numero(fila[c.consumicion]) : null;
    if (c.personas >= 0 && texto(fila[c.personas]) && personas === null) avisos.push(`Fila ${iTitulos + i + 2} (${nombre}): cantidad de personas inválida`);
    if (c.consumicion >= 0 && texto(fila[c.consumicion]) && consumicion === null) avisos.push(`Fila ${iTitulos + i + 2} (${nombre}): consumición inválida`);
    livings.push({
      id: nuevoId(),
      nombre,
      personas: Math.max(0, Math.round(personas ?? 0)),
      consumicion: Math.max(0, consumicion ?? 0),
      notas: c.notas >= 0 ? texto(fila[c.notas]).slice(0, 500) || null : null,
      x: null,
      y: null,
      mozo_id: null,
    });
  });
  if (!livings.length) avisos.push("No se encontraron livings: revisá que haya una columna Nombre");
  return { livings: livings.slice(0, 1000), avisos };
}

/** Excel de ejemplo con las columnas que se leen. */
export function descargarModelo() {
  const hoja = utils.aoa_to_sheet([
    ["Nombre", "Personas", "Consumición", "Notas"],
    ["Living Quilmes", 12, 1200000, "Sponsor"],
    ["Living Trapiche", 10, 950000, "Sponsor"],
    ["Living Pérez", 8, 600000, "Cumpleaños"],
    ["Living Gómez", 6, 450000, ""],
    ["Living Saigro", 10, 800000, ""],
    ["Living Martínez", 4, 300000, ""],
    ["Living Dante Robino", 8, 700000, "Sponsor"],
    ["Living López", 6, 400000, ""],
    ["Living Fernández", 5, 350000, "Despedida"],
  ]);
  hoja["!cols"] = [{ wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 30 }];
  const libro = utils.book_new();
  utils.book_append_sheet(libro, hoja, "Livings");
  writeFile(libro, "modelo-livings.xlsx");
}
