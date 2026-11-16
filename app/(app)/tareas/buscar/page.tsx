import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { buscarTarjetas, type FiltrosBusqueda } from "@/lib/tareas/consultas";
import { SinAcceso } from "../../sin-acceso";
import { TablaTareas } from "./tabla";

const texto = (v: unknown) => (typeof v === "string" ? v.slice(0, 200) : "");

/** Vista Tabla: búsqueda y edición de tarjetas de todos los tableros, con búsquedas guardadas. */
export default async function PaginaBuscar({ searchParams }: PageProps<"/tareas/buscar">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "tareas", "ver")) return <SinAcceso />;
  const p = await searchParams;
  const filtros: FiltrosBusqueda = {
    q: texto(p.q),
    tablero: texto(p.tablero),
    lista: texto(p.lista),
    responsable: texto(p.responsable),
    etiqueta: texto(p.etiqueta),
    desde: texto(p.desde),
    hasta: texto(p.hasta),
    estado: texto(p.estado),
  };
  const datos = await buscarTarjetas(filtros);
  return <TablaTareas {...datos} filtros={filtros} yo={usuario.id} />;
}
