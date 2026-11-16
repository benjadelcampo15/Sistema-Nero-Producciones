"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { guardarPreferencias, marcarNotificaciones } from "@/lib/tareas/acciones-tarjeta";
import type { Notificacion, Preferencias } from "@/lib/notificaciones/consultas";

const ICONO: Record<string, string> = { asignacion: "👤", mencion: "@", comentario: "💬", cambio: "✎", vencimiento: "🕒" };
const fecha = (iso: string) => new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

export function ListaNotificaciones({ lista, preferencias, conCorreo, email }: { lista: Notificacion[]; preferencias: Preferencias; conCorreo: boolean; email: string }) {
  const router = useRouter();
  const [items, setItems] = useState(lista);
  const [ver, setVer] = useState<"nuevas" | "todas">(lista.some((n) => !n.leida) ? "nuevas" : "todas");
  const [pref, setPref] = useState(preferencias);
  const [verPref, setVerPref] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const nuevas = items.filter((n) => !n.leida);
  const mostradas = ver === "nuevas" ? nuevas : items;

  const abrir = (n: Notificacion) =>
    iniciar(async () => {
      if (!n.leida) {
        setItems((l) => l.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
        await marcarNotificaciones([n.id]);
      }
      if (n.href) router.push(n.href);
      else router.refresh();
    });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">🔔 Notificaciones</h1>
        <div className="flex gap-2">
          {nuevas.length > 0 && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() =>
                iniciar(async () => {
                  setItems((l) => l.map((x) => ({ ...x, leida: true })));
                  await marcarNotificaciones("todas");
                  router.refresh();
                })
              }
              className="boton-secundario"
            >
              Marcar todas como leídas
            </button>
          )}
          <button type="button" onClick={() => setVerPref(!verPref)} className="boton-secundario">
            ⚙ Preferencias
          </button>
        </div>
      </div>

      {verPref && (
        <section className="tarjeta space-y-3">
          <h2 className="font-semibold">Qué avisos querés recibir</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["asignaciones", "Cuando me asignan una tarjeta"],
                ["menciones", "Cuando me mencionan en un comentario"],
                ["comentarios", "Comentarios en tarjetas que sigo"],
                ["cambios", "Cambios en tarjetas que sigo (movidas, fechas, completadas)"],
                ["vencimientos", "Vencimientos próximos y tareas vencidas"],
              ] as const
            ).map(([k, n]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={pref[k]} onChange={(e) => setPref({ ...pref, [k]: e.target.checked })} className="h-4 w-4" />
                {n}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pref.correo} onChange={(e) => setPref({ ...pref, correo: e.target.checked })} className="h-4 w-4" />
            También por correo a {email} (asignaciones, menciones, comentarios y vencimientos)
          </label>
          {!conCorreo && <p className="text-xs text-amber-800">El envío de correos todavía no está configurado en este Planix: por ahora llegan solo acá.</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pendiente}
              onClick={() =>
                iniciar(async () => {
                  const r = await guardarPreferencias(pref);
                  setMensaje(r.error ?? "Preferencias guardadas");
                })
              }
              className="boton"
            >
              Guardar preferencias
            </button>
            {mensaje && <span className="text-sm text-stone-600">{mensaje}</span>}
          </div>
        </section>
      )}

      <div className="flex gap-1 rounded-lg bg-stone-200/70 p-1 text-sm">
        <button type="button" onClick={() => setVer("nuevas")} className={`flex-1 rounded px-3 py-1.5 ${ver === "nuevas" ? "bg-white font-medium shadow-sm" : ""}`}>
          Nuevas ({nuevas.length})
        </button>
        <button type="button" onClick={() => setVer("todas")} className={`flex-1 rounded px-3 py-1.5 ${ver === "todas" ? "bg-white font-medium shadow-sm" : ""}`}>
          Todas
        </button>
      </div>

      {mostradas.length === 0 ? (
        <p className="tarjeta text-center text-sm text-stone-500">{ver === "nuevas" ? "No tenés notificaciones nuevas." : "Todavía no hay notificaciones."}</p>
      ) : (
        <ul className="tarjeta divide-y divide-stone-100 p-0">
          {mostradas.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => abrir(n)} className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-stone-50 ${n.leida ? "" : "bg-sky-50/60"}`}>
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm">{ICONO[n.tipo ?? ""] ?? "🔔"}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${n.leida ? "" : "font-semibold"}`}>{n.titulo}</span>
                  {n.detalle && <span className="block truncate text-sm text-stone-600">{n.detalle}</span>}
                  <span className="block text-xs text-stone-500">{fecha(n.creado_en)}</span>
                </span>
                {!n.leida && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-600" aria-label="Sin leer" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
