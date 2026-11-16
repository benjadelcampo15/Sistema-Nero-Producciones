/** Automatizaciones de Tareas (tipo Butler): reglas, botones y recurrentes. Compartido cliente/servidor. */

export type TipoDisparador = "movida_a" | "creada_en" | "etiqueta_agregada" | "miembro_agregado" | "checklist_completa" | "completada" | "vence_en" | "vencida";
export type Disparador = { tipo: TipoDisparador; dato?: string | null; dias?: number };

export type TipoAccion =
  | "completar"
  | "descompletar"
  | "mover"
  | "agregar_miembro"
  | "quitar_miembro"
  | "agregar_etiqueta"
  | "quitar_etiqueta"
  | "notificar"
  | "vencimiento"
  | "quitar_vencimiento"
  | "archivar";
export type Accion = { tipo: TipoAccion; lista_id?: string; arriba?: boolean; usuario_id?: string; etiqueta_id?: string; mensaje?: string; dias?: number };

export type AccionTablero =
  | { tipo: "crear_tarjeta"; lista_id: string; titulo: string; miembros?: string[] }
  | { tipo: "mover_lista"; desde: string; hacia: string }
  | { tipo: "archivar_completadas"; lista_id?: string };

export type Regla = {
  id: string;
  nombre: string;
  activa: boolean;
  disparador: Disparador;
  acciones: Accion[];
  ejecuciones: number;
  ultima_ejecucion: string | null;
  ultimo_error: string | null;
};
export type Boton = { id: string; nombre: string; ambito: "tarjeta" | "tablero"; acciones: (Accion | AccionTablero)[] };
export type Recurrente = {
  id: string;
  lista_id: string;
  titulo: string;
  descripcion: string | null;
  miembros: string[];
  etiquetas: string[];
  checklists: { nombre: string; items: string[] }[];
  frecuencia: "diaria" | "semanal" | "mensual" | "fechas";
  dias: number[];
  fechas: string[];
  hora: string | null;
  activa: boolean;
  proxima: string | null;
};
export type Ejecucion = { id: number; regla_id: string | null; boton_id: string | null; tarjeta_id: string | null; ok: boolean; detalle: string | null; creado_en: string };

export const DISPARADORES: { tipo: TipoDisparador; nombre: string; dato?: "lista" | "etiqueta" | "usuario"; dias?: boolean }[] = [
  { tipo: "movida_a", nombre: "Cuando una tarjeta se mueve a la lista…", dato: "lista" },
  { tipo: "creada_en", nombre: "Cuando se crea una tarjeta en la lista…", dato: "lista" },
  { tipo: "etiqueta_agregada", nombre: "Cuando a una tarjeta se le agrega la etiqueta…", dato: "etiqueta" },
  { tipo: "miembro_agregado", nombre: "Cuando se asigna a…", dato: "usuario" },
  { tipo: "checklist_completa", nombre: "Cuando se completa una checklist" },
  { tipo: "completada", nombre: "Cuando se marca la fecha como completada" },
  { tipo: "vence_en", nombre: "Cuando falten … días para el vencimiento", dias: true },
  { tipo: "vencida", nombre: "Cuando una tarjeta se vence" },
];

export const ACCIONES: { tipo: TipoAccion; nombre: string; dato?: "lista" | "etiqueta" | "usuario" | "notificar"; dias?: boolean }[] = [
  { tipo: "completar", nombre: "Marcar la fecha como completada" },
  { tipo: "descompletar", nombre: "Marcar como pendiente" },
  { tipo: "mover", nombre: "Mover la tarjeta a la lista…", dato: "lista" },
  { tipo: "agregar_miembro", nombre: "Asignar a…", dato: "usuario" },
  { tipo: "quitar_miembro", nombre: "Quitar a…", dato: "usuario" },
  { tipo: "agregar_etiqueta", nombre: "Agregar la etiqueta…", dato: "etiqueta" },
  { tipo: "quitar_etiqueta", nombre: "Quitar la etiqueta…", dato: "etiqueta" },
  { tipo: "notificar", nombre: "Avisar a…", dato: "notificar" },
  { tipo: "vencimiento", nombre: "Poner vencimiento en … días", dias: true },
  { tipo: "quitar_vencimiento", nombre: "Quitar el vencimiento" },
  { tipo: "archivar", nombre: "Archivar la tarjeta" },
];

export const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

type Nombres = { lista: (id?: string | null) => string; etiqueta: (id?: string | null) => string; usuario: (id?: string | null) => string };

export function describirDisparador(d: Disparador, n: Nombres) {
  switch (d.tipo) {
    case "movida_a":
      return `Cuando una tarjeta se mueve a "${n.lista(d.dato)}"`;
    case "creada_en":
      return `Cuando se crea una tarjeta en "${n.lista(d.dato)}"`;
    case "etiqueta_agregada":
      return `Cuando se agrega la etiqueta "${n.etiqueta(d.dato)}"`;
    case "miembro_agregado":
      return d.dato ? `Cuando se asigna a ${n.usuario(d.dato)}` : "Cuando se asigna a alguien";
    case "checklist_completa":
      return "Cuando se completa una checklist";
    case "completada":
      return "Cuando se marca como completada";
    case "vence_en":
      return `Cuando falten ${d.dias ?? 1} día${d.dias === 1 ? "" : "s"} para el vencimiento`;
    case "vencida":
      return "Cuando una tarjeta se vence";
  }
}

export function describirAccion(a: Accion | AccionTablero, n: Nombres): string {
  switch (a.tipo) {
    case "completar":
      return "marcar como completada";
    case "descompletar":
      return "marcar como pendiente";
    case "mover":
      return `mover a "${n.lista(a.lista_id)}"${a.arriba ? " (arriba)" : ""}`;
    case "agregar_miembro":
      return `asignar a ${n.usuario(a.usuario_id)}`;
    case "quitar_miembro":
      return `quitar a ${n.usuario(a.usuario_id)}`;
    case "agregar_etiqueta":
      return `agregar la etiqueta "${n.etiqueta(a.etiqueta_id)}"`;
    case "quitar_etiqueta":
      return `quitar la etiqueta "${n.etiqueta(a.etiqueta_id)}"`;
    case "notificar":
      return `avisar a ${a.usuario_id === "miembros" ? "los miembros de la tarjeta" : n.usuario(a.usuario_id)}${a.mensaje ? `: "${a.mensaje}"` : ""}`;
    case "vencimiento":
      return `poner vencimiento en ${a.dias ?? 0} día${a.dias === 1 ? "" : "s"}`;
    case "quitar_vencimiento":
      return "quitar el vencimiento";
    case "archivar":
      return "archivar la tarjeta";
    case "crear_tarjeta":
      return `crear "${a.titulo}" en "${n.lista(a.lista_id)}"${a.miembros?.length ? ` asignada a ${a.miembros.map((m) => n.usuario(m)).join(", ")}` : ""}`;
    case "mover_lista":
      return `mover todas las tarjetas de "${n.lista(a.desde)}" a "${n.lista(a.hacia)}"`;
    case "archivar_completadas":
      return a.lista_id ? `archivar las completadas de "${n.lista(a.lista_id)}"` : "archivar todas las completadas";
  }
}

export function describirFrecuencia(r: Pick<Recurrente, "frecuencia" | "dias" | "fechas" | "hora">) {
  const hora = r.hora ? ` · vence ${r.hora.slice(0, 5)}` : "";
  switch (r.frecuencia) {
    case "diaria":
      return `Todos los días${hora}`;
    case "semanal":
      return r.dias.length ? `Cada ${r.dias.map((d) => DIAS_SEMANA[d]).join(", ")}${hora}` : `Cada semana${hora}`;
    case "mensual":
      return `El día ${r.dias[0] ?? 1} de cada mes${hora}`;
    case "fechas":
      return `En fechas: ${r.fechas.map((f) => f.split("-").reverse().slice(0, 2).join("/")).join(", ")}${hora}`;
  }
}
