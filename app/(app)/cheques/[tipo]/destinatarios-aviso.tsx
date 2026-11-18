"use client";

import { useState, useTransition } from "react";
import { guardarDestinatariosCheques } from "@/lib/cheques/acciones";

type Usuario = { id: string; nombre: string; email: string };

/** Quiénes reciben el mail de cheques por vencer: lo elige un administrador. */
export function DestinatariosAviso({ usuarios, elegidos, esAdmin, dias }: { usuarios: Usuario[]; elegidos: string[]; esAdmin: boolean; dias: number }) {
  const [abierto, setAbierto] = useState(false);
  const [marcados, setMarcados] = useState<string[]>(elegidos);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const nombres = usuarios.filter((u) => elegidos.includes(u.id)).map((u) => u.nombre || u.email);

  return (
    <div className="space-y-2 text-xs text-stone-500">
      <p>
        Se avisa por mail {dias} días antes de la fecha de pago de cada cheque pendiente
        {nombres.length ? (
          <>
            {" "}a <strong className="text-stone-700">{nombres.join(", ")}</strong>.
          </>
        ) : (
          " a los usuarios con acceso a Cheques."
        )}
        {esAdmin && (
          <button type="button" onClick={() => setAbierto(!abierto)} className="ml-2 underline hover:text-stone-900">
            {abierto ? "Cerrar" : "Elegir quién lo recibe"}
          </button>
        )}
      </p>
      {esAdmin && abierto && (
        <div className="tarjeta max-w-lg space-y-2 p-3 text-sm text-stone-800">
          <p className="text-xs text-stone-500">Solo las personas marcadas reciben el mail. Sin ninguna marcada, le llega a todos los que tienen acceso a Cheques.</p>
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {usuarios.map((u) => (
              <li key={u.id}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={marcados.includes(u.id)}
                    onChange={(e) => setMarcados(e.target.checked ? [...marcados, u.id] : marcados.filter((x) => x !== u.id))}
                  />
                  <span>{u.nombre || u.email}</span>
                  <span className="text-xs text-stone-500">{u.email}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pendiente}
              onClick={() =>
                iniciar(async () => {
                  const r = await guardarDestinatariosCheques(marcados);
                  setMensaje(r.error ? { tipo: "error", texto: r.error } : { tipo: "ok", texto: "Guardado" });
                  if (!r.error) setAbierto(false);
                })
              }
              className="boton py-1 text-sm"
            >
              {pendiente ? "Guardando…" : "Guardar"}
            </button>
            {mensaje && <span className={mensaje.tipo === "error" ? "text-red-700" : "text-green-700"}>{mensaje.texto}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
