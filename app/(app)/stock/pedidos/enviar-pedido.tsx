"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { Pedido } from "@/lib/pedidos/tipos";
import { linkPdf, textoPedido, urlWhatsApp } from "@/lib/pedidos/whatsapp";
import { IconoWhatsApp } from "@/components/icono-whatsapp";

/**
 * ¿Se puede compartir el PDF como archivo? En el celular sí (menú de compartir
 * con WhatsApp); en la compu se manda el link, que abre directo el chat del proveedor.
 */
export function puedeCompartirArchivo() {
  if (typeof navigator === "undefined" || !navigator.canShare || !window.matchMedia("(pointer: coarse)").matches) return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array()], "pedido.pdf", { type: "application/pdf" })] });
  } catch {
    return false;
  }
}
const sinSuscripcion = () => () => {};

type Props = { pedido: Pedido; urlBase: string };

function useEnvio({ pedido, urlBase }: Props) {
  const celular = useSyncExternalStore(sinSuscripcion, puedeCompartirArchivo, () => false);
  const [estado, setEstado] = useState<"listo" | "preparando" | "tocar-de-nuevo" | "error">("listo");
  const [archivo, setArchivo] = useState<File | null>(null);
  const pdf = linkPdf(urlBase, pedido);
  const whatsapp = urlWhatsApp(pedido.proveedor.telefono, textoPedido(pedido, { pdf }));

  /** Opción 1: el archivo PDF con un mensaje corto, por el menú de compartir del celular. */
  async function compartirPdf() {
    try {
      let f = archivo;
      if (!f) {
        setEstado("preparando");
        const r = await fetch(pdf);
        if (!r.ok) throw new Error("pdf");
        f = new File([await r.blob()], `Pedido ${pedido.numero} - Nero Producciones.pdf`, { type: "application/pdf" });
        setArchivo(f);
      }
      await navigator.share({ files: [f], text: textoPedido(pedido) });
      setEstado("listo");
    } catch (e) {
      // Si el navegador no dejó abrir el menú (tardó en preparar el PDF), con otro toque sale.
      if (e instanceof DOMException && e.name === "NotAllowedError") setEstado("tocar-de-nuevo");
      else if (e instanceof DOMException && e.name === "AbortError") setEstado("listo");
      else setEstado("error");
    }
  }

  /** Opción 3: abre el chat del proveedor con el mensaje corto y el link al PDF. */
  const abrirChat = () => whatsapp && window.open(whatsapp, "_blank", "noopener");

  return { celular, estado, whatsapp, pdf, compartirPdf, abrirChat, mensaje: textoPedido(pedido, { pdf }) };
}

/** Ícono chico de WhatsApp (historial de pedidos). */
export function IconoEnviarPedido(props: Props) {
  const { celular, estado, whatsapp, compartirPdf, abrirChat } = useEnvio(props);
  if (!whatsapp) {
    return (
      <Link href={`/stock/pedidos/mayoristas/${props.pedido.proveedor.id}#m_telefono`} title="Falta el WhatsApp del proveedor" className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-200 text-stone-500">
        <IconoWhatsApp className="h-4 w-4" />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={celular ? compartirPdf : abrirChat}
      disabled={estado === "preparando"}
      title={estado === "tocar-de-nuevo" ? "Tocá de nuevo para compartir el PDF" : celular ? "Enviar el PDF por WhatsApp" : "Enviar por WhatsApp"}
      aria-label="Enviar el pedido por WhatsApp"
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-50 ${estado === "tocar-de-nuevo" ? "animate-pulse bg-[#1ebe5a] ring-2 ring-[#25D366]/40" : "bg-[#25D366] hover:bg-[#1ebe5a]"}`}
    >
      <IconoWhatsApp className="h-4 w-4" />
    </button>
  );
}

/** Panel para mandar el pedido (pantalla del pedido). `destacado`: recién realizado. */
export function PanelEnviarPedido({ destacado = false, ...props }: Props & { destacado?: boolean }) {
  const { celular, estado, whatsapp, pdf, compartirPdf, abrirChat, mensaje } = useEnvio(props);
  const [copiado, setCopiado] = useState(false);
  const verde = "inline-flex items-center justify-center gap-2 rounded-md bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1ebe5a] disabled:opacity-50";

  return (
    <section className={`space-y-3 rounded-xl border p-4 ${destacado ? "border-[#25D366] bg-green-50" : "border-stone-200 bg-white"}`}>
      <div>
        <h2 className="font-semibold">{destacado ? "¡Pedido realizado! Mandáselo al proveedor" : "Enviar el pedido"}</h2>
        <p className="text-sm text-stone-600">
          {celular ? "Se manda el PDF con un mensaje corto: elegí WhatsApp y el contacto." : `Se abre el chat de ${props.pedido.proveedor.razon_social} con un mensaje corto y el link al PDF.`}
        </p>
      </div>
      {!whatsapp ? (
        <p className="text-sm text-amber-800">
          Falta el WhatsApp del proveedor.{" "}
          <Link href={`/stock/pedidos/mayoristas/${props.pedido.proveedor.id}#m_telefono`} className="font-medium underline">Cargalo en su ficha</Link>.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {celular && (
            <button type="button" onClick={compartirPdf} disabled={estado === "preparando"} className={verde}>
              <IconoWhatsApp className="h-5 w-5" />
              {estado === "preparando" ? "Preparando el PDF…" : estado === "tocar-de-nuevo" ? "Tocá de nuevo para enviar el PDF" : "Enviar PDF por WhatsApp"}
            </button>
          )}
          <button type="button" onClick={abrirChat} className={celular ? "boton-secundario" : verde}>
            <IconoWhatsApp className="h-5 w-5" />
            {celular ? "Enviar link por WhatsApp" : "Enviar por WhatsApp"}
          </button>
          <a href={pdf} target="_blank" rel="noreferrer" className="boton-secundario">Ver PDF</a>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(mensaje);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            }}
            className="text-sm text-stone-600 underline hover:text-stone-900"
          >
            {copiado ? "¡Copiado!" : "Copiar mensaje"}
          </button>
        </div>
      )}
      {estado === "error" && <p className="text-sm text-red-700">No se pudo compartir el PDF. Probá con “Enviar link por WhatsApp”.</p>}
    </section>
  );
}
