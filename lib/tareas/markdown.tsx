import { Fragment, type ReactNode } from "react";

/**
 * Formato simple para descripciones y comentarios (estilo Trello / Markdown):
 * # títulos, **negrita**, *cursiva*, `código`, listas con - o 1., enlaces
 * [texto](https://…) o pegados, y @menciones. Se arma con elementos de React
 * (nunca HTML crudo), así que no hay forma de inyectar código.
 */
export function Formato({ texto, nombres = [] }: { texto: string; nombres?: string[] }) {
  const bloques: ReactNode[] = [];
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let k = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    const titulo = /^(#{1,3})\s+(.*)$/.exec(l);
    if (titulo) {
      const nivel = titulo[1].length;
      const clase = nivel === 1 ? "text-lg font-bold" : nivel === 2 ? "text-base font-bold" : "font-semibold";
      bloques.push(<p key={k++} className={`${clase} mt-2`}>{enLinea(titulo[2], nombres)}</p>);
      i++;
      continue;
    }
    if (/^\s*[-*•]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lineas.length && /^\s*[-*•]\s+/.test(lineas[i])) items.push(lineas[i++].replace(/^\s*[-*•]\s+/, ""));
      bloques.push(
        <ul key={k++} className="ml-5 list-disc space-y-0.5">
          {items.map((t, j) => (
            <li key={j}>{enLinea(t, nombres)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lineas.length && /^\s*\d+[.)]\s+/.test(lineas[i])) items.push(lineas[i++].replace(/^\s*\d+[.)]\s+/, ""));
      bloques.push(
        <ol key={k++} className="ml-5 list-decimal space-y-0.5">
          {items.map((t, j) => (
            <li key={j}>{enLinea(t, nombres)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(l)) {
      bloques.push(<hr key={k++} className="my-2 border-stone-300" />);
      i++;
      continue;
    }
    if (!l.trim()) {
      i++;
      continue;
    }
    // Párrafo: líneas seguidas hasta una vacía o un bloque.
    const parrafo: string[] = [];
    while (i < lineas.length && lineas[i].trim() && !/^(#{1,3}\s|\s*[-*•]\s|\s*\d+[.)]\s|\s*(---|\*\*\*)\s*$)/.test(lineas[i])) parrafo.push(lineas[i++]);
    bloques.push(
      <p key={k++}>
        {parrafo.map((t, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {enLinea(t, nombres)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="space-y-2 break-words text-sm leading-relaxed">{bloques}</div>;
}

const URL_SEGURA = /^(https?:\/\/|mailto:)/i;

/** Formato dentro de una línea. */
function enLinea(texto: string, nombres: string[]): ReactNode[] {
  const salida: ReactNode[] = [];
  const menciones = nombres.length ? nombres.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|") : null;
  const patron = new RegExp(
    [
      String.raw`\[([^\]]+)\]\(([^)\s]+)\)`, // [texto](url)
      String.raw`(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])`, // url suelta
      String.raw`\*\*([^*]+)\*\*`, // **negrita**
      String.raw`(?:^|(?<=\s))\*([^*\s][^*]*)\*`, // *cursiva*
      String.raw`(?:^|(?<=\s))_([^_\s][^_]*)_`, // _cursiva_
      "`([^`]+)`", // `código`
      menciones ? `@(${menciones})` : null,
    ]
      .filter(Boolean)
      .join("|"),
    "g",
  );
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = patron.exec(texto))) {
    if (m.index > ultimo) salida.push(texto.slice(ultimo, m.index));
    const [entero, eTexto, eUrl, url, negrita, cursiva1, cursiva2, codigo, mencion] = m;
    if (eTexto && eUrl) {
      salida.push(
        URL_SEGURA.test(eUrl) ? (
          <a key={k++} href={eUrl} target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">
            {eTexto}
          </a>
        ) : (
          entero
        ),
      );
    } else if (url) {
      salida.push(
        <a key={k++} href={url} target="_blank" rel="noopener noreferrer" className="break-all text-sky-700 underline">
          {url}
        </a>,
      );
    } else if (negrita) salida.push(<strong key={k++}>{negrita}</strong>);
    else if (cursiva1 || cursiva2) salida.push(<em key={k++}>{cursiva1 || cursiva2}</em>);
    else if (codigo) salida.push(<code key={k++} className="rounded bg-stone-200 px-1 font-mono text-[0.85em]">{codigo}</code>);
    else if (mencion) salida.push(<span key={k++} className="rounded bg-sky-100 px-0.5 font-medium text-sky-800">@{mencion}</span>);
    else salida.push(entero);
    ultimo = m.index + entero.length;
  }
  if (ultimo < texto.length) salida.push(texto.slice(ultimo));
  return salida;
}

/** Al pegar desde un documento (Word, Google Docs, una web): HTML → este formato. */
export function htmlAFormato(html: string): string {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const recorrer = (n: Node, lista?: { ordenada: boolean; i: number }): string => {
    if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? "").replace(/\s+/g, " ");
    if (n.nodeType !== Node.ELEMENT_NODE) return "";
    const el = n as HTMLElement;
    const hijos = (l?: { ordenada: boolean; i: number }) => [...el.childNodes].map((c) => recorrer(c, l)).join("");
    const estilo = el.getAttribute("style") ?? "";
    switch (el.tagName) {
      case "B":
      case "STRONG": {
        const t = hijos().trim();
        return t ? `**${t}** ` : "";
      }
      case "I":
      case "EM": {
        const t = hijos().trim();
        return t ? `*${t}* ` : "";
      }
      case "A": {
        const href = el.getAttribute("href") ?? "";
        const t = hijos().trim();
        return URL_SEGURA.test(href) ? (t && t !== href ? `[${t}](${href})` : href) : t;
      }
      case "H1":
        return `\n# ${hijos().trim()}\n`;
      case "H2":
        return `\n## ${hijos().trim()}\n`;
      case "H3":
      case "H4":
        return `\n### ${hijos().trim()}\n`;
      case "BR":
        return "\n";
      case "UL":
        return `\n${[...el.children].map((c) => `- ${recorrer(c).trim()}`).join("\n")}\n`;
      case "OL":
        return `\n${[...el.children].map((c, j) => `${j + 1}. ${recorrer(c).trim()}`).join("\n")}\n`;
      case "P":
      case "DIV":
        return `\n${hijos().trim()}\n`;
      case "SPAN":
        return /font-weight:\s*(bold|[6-9]00)/.test(estilo) && hijos().trim() ? `**${hijos().trim()}** ` : hijos(lista);
      case "STYLE":
      case "SCRIPT":
      case "META":
        return "";
      default:
        return hijos(lista);
    }
  };
  return recorrer(doc.body)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
