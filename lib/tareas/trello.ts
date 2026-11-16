/**
 * Lectura de un tablero exportado de Trello (Menú → Imprimir, exportar y compartir → Exportar como JSON).
 * Todo se arma en el navegador: al servidor solo va lo necesario, ya normalizado.
 */

type TrelloMiembro = { id: string; fullName?: string; username?: string };
type TrelloEtiqueta = { id: string; name?: string; color?: string | null };
type TrelloLista = { id: string; name?: string; closed?: boolean; pos?: number };
type TrelloAdjunto = { name?: string; url?: string; isUpload?: boolean };
type TrelloTarjeta = {
  id: string;
  name?: string;
  desc?: string;
  idList: string;
  closed?: boolean;
  pos?: number;
  due?: string | null;
  start?: string | null;
  dueComplete?: boolean;
  idMembers?: string[];
  idLabels?: string[];
  attachments?: TrelloAdjunto[];
  badges?: { votes?: number };
  cover?: { idAttachment?: string | null; color?: string | null };
  customFieldItems?: unknown[];
};
type TrelloChecklist = { id: string; name?: string; idCard: string; pos?: number; checkItems?: { name?: string; state?: string; pos?: number }[] };
type TrelloAccion = { type: string; date: string; idMemberCreator?: string; memberCreator?: { fullName?: string }; data?: { text?: string; card?: { id?: string } } };
export type TableroTrello = {
  id: string;
  name: string;
  desc?: string;
  prefs?: { background?: string; backgroundColor?: string };
  members?: TrelloMiembro[];
  labels?: TrelloEtiqueta[];
  lists?: TrelloLista[];
  cards?: TrelloTarjeta[];
  checklists?: TrelloChecklist[];
  actions?: TrelloAccion[];
  customFields?: unknown[];
  pluginData?: unknown[];
};

const COLOR_ETIQUETA: Record<string, string> = { green: "verde", yellow: "amarillo", orange: "naranja", red: "rojo", purple: "violeta", blue: "azul", sky: "celeste", lime: "lima", pink: "rosa", black: "gris" };
const COLOR_FONDO: Record<string, string> = { blue: "azul", orange: "naranja", green: "verde", red: "rojo", purple: "violeta", pink: "rosa", lime: "bosque", sky: "celeste", grey: "gris" };

/** ¿Es un JSON exportado de Trello? Devuelve el tablero o un mensaje de error. */
export function leerTrello(texto: string): { tablero?: TableroTrello; error?: string } {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return { error: "El archivo no es un JSON válido. En Trello: Menú del tablero → Imprimir, exportar y compartir → Exportar como JSON." };
  }
  const t = datos as Partial<TableroTrello>;
  if (!t || typeof t !== "object" || !t.id || !t.name || !Array.isArray(t.lists) || !Array.isArray(t.cards)) {
    return { error: "El archivo no parece un tablero exportado de Trello (faltan las listas o las tarjetas)." };
  }
  return { tablero: t as TableroTrello };
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Relaciona cada miembro de Trello con un usuario de Planix por nombre (se puede cambiar a mano). */
export function sugerirMapeo(miembros: TrelloMiembro[], usuarios: { id: string; nombre: string; email: string }[]) {
  const mapa: Record<string, string> = {};
  for (const m of miembros) {
    const nombre = sinAcentos(m.fullName ?? "");
    const usuario = sinAcentos(m.username ?? "");
    const u =
      usuarios.find((x) => sinAcentos(x.nombre) === nombre) ??
      usuarios.find((x) => nombre && sinAcentos(x.nombre).split(" ")[0] === nombre.split(" ")[0] && sinAcentos(x.nombre).split(" ").at(-1) === nombre.split(" ").at(-1)) ??
      usuarios.find((x) => usuario && sinAcentos(x.email).split("@")[0] === usuario);
    mapa[m.id] = u?.id ?? "";
  }
  return mapa;
}

/** Fecha de creación de una tarjeta de Trello (va en los primeros 8 caracteres de su id). */
const creada = (id: string) => {
  const s = parseInt(id.slice(0, 8), 16);
  return Number.isFinite(s) && s > 1e9 ? new Date(s * 1000).toISOString() : null;
};

/** Resumen de lo que se va a importar y de lo que no se puede traer. */
export function resumirTrello(t: TableroTrello) {
  const comentarios = (t.actions ?? []).filter((a) => a.type === "commentCard");
  const cards = t.cards ?? [];
  const noSeImporta: string[] = [];
  const subidos = cards.reduce((s, c) => s + (c.attachments ?? []).filter((a) => a.isUpload).length, 0);
  if (subidos) noSeImporta.push(`${subidos} archivo${subidos === 1 ? "" : "s"} subido${subidos === 1 ? "" : "s"} a Trello: se importan como enlace (para abrirlos hay que tener sesión en Trello).`);
  if (t.customFields?.length) noSeImporta.push(`${t.customFields.length} campo${t.customFields.length === 1 ? "" : "s"} personalizado${t.customFields.length === 1 ? "" : "s"} (Planix todavía no los tiene).`);
  const votos = cards.filter((c) => c.badges?.votes).length;
  if (votos) noSeImporta.push(`Votos de ${votos} tarjeta${votos === 1 ? "" : "s"}.`);
  const portadas = cards.filter((c) => c.cover?.idAttachment).length;
  if (portadas) noSeImporta.push(`${portadas} portada${portadas === 1 ? "" : "s"} con imagen (la imagen queda como enlace adjunto).`);
  if (t.pluginData?.length) noSeImporta.push("Datos de Power-Ups.");
  if ((t.actions ?? []).length >= 1000) noSeImporta.push("Trello exporta como mucho las últimas 1000 acciones: puede que falten comentarios viejos.");
  return {
    listas: (t.lists ?? []).length,
    listasArchivadas: (t.lists ?? []).filter((l) => l.closed).length,
    tarjetas: cards.length,
    tarjetasArchivadas: cards.filter((c) => c.closed).length,
    etiquetas: (t.labels ?? []).length,
    checklists: (t.checklists ?? []).length,
    items: (t.checklists ?? []).reduce((s, c) => s + (c.checkItems ?? []).length, 0),
    comentarios: comentarios.length,
    adjuntos: cards.reduce((s, c) => s + (c.attachments ?? []).length, 0),
    miembros: (t.members ?? []).length,
    conFecha: cards.filter((c) => c.due).length,
    noSeImporta,
  };
}

/** Arma lo que se manda al servidor (sin inventar datos: lo que falta queda vacío). */
export function normalizarTrello(t: TableroTrello, mapeo: Record<string, string>, nombre: string) {
  const miembro = (id: string) => mapeo[id] || null;
  const nombreDe = new Map((t.members ?? []).map((m) => [m.id, m.fullName || m.username || "Alguien"]));
  const comentariosDe = new Map<string, TrelloAccion[]>();
  for (const a of t.actions ?? []) {
    if (a.type !== "commentCard" || !a.data?.card?.id) continue;
    comentariosDe.set(a.data.card.id, [...(comentariosDe.get(a.data.card.id) ?? []), a]);
  }
  const checklistsDe = new Map<string, TrelloChecklist[]>();
  for (const c of t.checklists ?? []) checklistsDe.set(c.idCard, [...(checklistsDe.get(c.idCard) ?? []), c]);
  const etiquetasValidas = new Set((t.labels ?? []).map((l) => l.id));
  const colorFondo = t.prefs?.background && COLOR_FONDO[t.prefs.background] ? `c:${COLOR_FONDO[t.prefs.background]}` : "c:azul";
  const listas = [...(t.lists ?? [])].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
  const mapeados = [...new Set(Object.values(mapeo).filter(Boolean))];

  return {
    trello_id: t.id.slice(0, 64),
    nombre: nombre.trim().slice(0, 120) || t.name.slice(0, 120),
    descripcion: (t.desc ?? "").slice(0, 20000),
    fondo: colorFondo,
    miembros: mapeados,
    etiquetas: (t.labels ?? []).map((l) => ({ id: l.id, nombre: (l.name ?? "").slice(0, 60), color: COLOR_ETIQUETA[(l.color ?? "").split("_")[0]] ?? "gris" })),
    listas: listas.map((l) => ({ id: l.id, nombre: (l.name || "Lista").slice(0, 200), archivada: !!l.closed })),
    tarjetas: (t.cards ?? []).map((c) => ({
      lista: c.idList,
      titulo: (c.name || "Tarjeta").slice(0, 2000),
      descripcion: (c.desc ?? "").slice(0, 20000),
      posicion: Number.isFinite(c.pos) ? Number(c.pos) : 0,
      vence: c.due ?? null,
      inicio: c.start ? c.start.slice(0, 10) : null,
      completada: !!c.dueComplete,
      archivada: !!c.closed,
      creada: creada(c.id),
      miembros: (c.idMembers ?? []).map(miembro).filter((x): x is string => !!x),
      etiquetas: (c.idLabels ?? []).filter((l) => etiquetasValidas.has(l)),
      checklists: (checklistsDe.get(c.id) ?? [])
        .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))
        .map((ch) => ({
          nombre: (ch.name || "Checklist").slice(0, 200),
          posicion: Number(ch.pos ?? 0),
          items: (ch.checkItems ?? []).sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0)).map((i) => ({ texto: (i.name || "—").slice(0, 2000), hecho: i.state === "complete", posicion: Number(i.pos ?? 0) })),
        })),
      // Si el autor no tiene usuario en Planix, el comentario queda a nombre de quien importa, con el nombre original.
      comentarios: (comentariosDe.get(c.id) ?? [])
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((a) => {
          const autor = a.idMemberCreator ? miembro(a.idMemberCreator) : null;
          const original = a.memberCreator?.fullName || (a.idMemberCreator ? nombreDe.get(a.idMemberCreator) : null) || "Alguien";
          return { autor, texto: (autor ? a.data?.text ?? "" : `**${original}** (en Trello): ${a.data?.text ?? ""}`).slice(0, 12000), fecha: a.date };
        }),
      adjuntos: (c.attachments ?? []).filter((a) => a.url && /^https?:\/\//.test(a.url)).map((a) => ({ nombre: (a.name || a.url || "Adjunto").slice(0, 300), url: a.url!.slice(0, 2000) })),
    })),
  };
}
