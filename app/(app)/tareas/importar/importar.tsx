"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importacionesPrevias, importarTrello, prepararArchivoTrello } from "@/lib/tareas/acciones-avanzadas";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { leerTrello, normalizarTrello, resumirTrello, sugerirMapeo, type TableroTrello } from "@/lib/tareas/trello";
import type { Espacio, Usuario } from "@/lib/tareas/tipos";

type Previas = Awaited<ReturnType<typeof importacionesPrevias>>;

/** Importar desde Trello: analizar, revisar, relacionar usuarios, confirmar. */
export function ImportarTrello({ espacios, usuarios }: { espacios: Espacio[]; usuarios: Usuario[] }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [tablero, setTablero] = useState<TableroTrello | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [espacio, setEspacio] = useState(espacios[0]?.id ?? "");
  const [mapeo, setMapeo] = useState<Record<string, string>>({});
  const [previas, setPrevias] = useState<Previas | null>(null);
  const [igual, setIgual] = useState(false);
  const [paso, setPaso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const analizar = async (f: File | undefined) => {
    setError(null);
    setTablero(null);
    setIgual(false);
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) return setError("El archivo pesa más de 25 MB.");
    const leido = leerTrello(await f.text());
    if (leido.error || !leido.tablero) return setError(leido.error ?? "No se pudo leer");
    setArchivo(f);
    setTablero(leido.tablero);
    setNombre(leido.tablero.name);
    setMapeo(sugerirMapeo(leido.tablero.members ?? [], usuarios));
    setPrevias(await importacionesPrevias(leido.tablero.id, leido.tablero.name));
  };

  const resumen = tablero ? resumirTrello(tablero) : null;
  const duplicado = !!previas && (previas.importaciones.length > 0 || previas.tablerosConNombre.length > 0);

  const importar = () =>
    iniciar(async () => {
      if (!tablero || !archivo || !resumen) return;
      setError(null);
      const datos = { ...normalizarTrello(tablero, mapeo, nombre), resumen: { ...resumen, archivo: archivo.name } };
      if (JSON.stringify(datos).length > 4_000_000) return setError("El tablero es demasiado grande para importarlo de una vez (más de 4 MB de datos). Probá exportarlo sin las tarjetas archivadas.");
      // 1) Se guarda el archivo original.
      setPaso("Guardando el archivo original…");
      let ruta: string | null = null;
      const p = await prepararArchivoTrello(archivo.name, archivo.size);
      if (p.ruta && p.token) {
        const { error: e } = await crearClienteNavegador().storage.from("tareas").uploadToSignedUrl(p.ruta, p.token, archivo, { contentType: "application/json" });
        if (!e) ruta = p.ruta;
      }
      // 2) Se crea todo el tablero (si algo falla, no queda nada a medias).
      setPaso("Creando el tablero…");
      const r = await importarTrello(espacio, datos, ruta);
      setPaso(null);
      if (r.error || !r.id) return setError(r.error ?? "No se pudo importar");
      router.push(`/tareas/${r.id}`);
    });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/tareas" className="text-sm text-stone-500 hover:text-stone-900">← Tableros</Link>
        <h1 className="text-2xl font-semibold">Importar desde Trello</h1>
        <p className="text-sm text-stone-500">
          En Trello abrí el tablero → Menú → <strong>Imprimir, exportar y compartir</strong> → <strong>Exportar como JSON</strong>, y elegí ese archivo acá. El tablero de Trello no se toca.
        </p>
      </div>

      <section className="tarjeta space-y-3">
        <label className="block">
          <span className="etiqueta">1. Archivo JSON de Trello</span>
          <input type="file" accept="application/json,.json" onChange={(e) => void analizar(e.target.files?.[0])} className="block w-full text-sm" />
        </label>
        {error && <p className="alerta-error">{error}</p>}
      </section>

      {tablero && resumen && (
        <>
          <section className="tarjeta space-y-3">
            <h2 className="font-semibold">2. Revisá lo que se va a importar</h2>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[
                ["Listas", `${resumen.listas}${resumen.listasArchivadas ? ` (${resumen.listasArchivadas} archivadas)` : ""}`],
                ["Tarjetas", `${resumen.tarjetas}${resumen.tarjetasArchivadas ? ` (${resumen.tarjetasArchivadas} archivadas)` : ""}`],
                ["Etiquetas", resumen.etiquetas],
                ["Checklists", `${resumen.checklists} (${resumen.items} ítems)`],
                ["Comentarios", resumen.comentarios],
                ["Adjuntos", resumen.adjuntos],
                ["Con vencimiento", resumen.conFecha],
                ["Miembros de Trello", resumen.miembros],
              ].map(([n, v]) => (
                <div key={n as string} className="rounded-lg border border-stone-200 p-2">
                  <p className="text-xs text-stone-500">{n}</p>
                  <p className="font-semibold">{v}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="etiqueta">Nombre del tablero en Planix</span>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} className="campo" />
              </label>
              <label className="block">
                <span className="etiqueta">Espacio de trabajo</span>
                <select value={espacio} onChange={(e) => setEspacio(e.target.value)} className="campo">
                  {espacios.map((e) => (
                    <option key={e.id} value={e.id}>{e.nombre}</option>
                  ))}
                </select>
              </label>
            </div>
            {resumen.noSeImporta.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-semibold">Lo que no se puede traer tal cual:</p>
                <ul className="mt-1 list-disc pl-5">
                  {resumen.noSeImporta.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {(tablero.members ?? []).length > 0 && (
            <section className="tarjeta space-y-2">
              <h2 className="font-semibold">3. Relacioná las personas de Trello con usuarios de Planix</h2>
              <p className="text-sm text-stone-500">Se sugirieron por nombre. Si alguien no está en Planix, sus tarjetas quedan sin ese responsable y sus comentarios quedan a tu nombre con su nombre original.</p>
              <table className="tabla-movil w-full text-sm">
                <thead className="text-left text-xs uppercase text-stone-500">
                  <tr>
                    <th className="py-1">En Trello</th>
                    <th className="py-1">En Planix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {(tablero.members ?? []).map((m) => (
                    <tr key={m.id}>
                      <td className="py-1.5">
                        {m.fullName} {m.username && <span className="text-stone-500">@{m.username}</span>}
                      </td>
                      <td className="py-1.5">
                        <select value={mapeo[m.id] ?? ""} onChange={(e) => setMapeo({ ...mapeo, [m.id]: e.target.value })} className={`campo py-1 text-sm ${mapeo[m.id] ? "" : "border-amber-400"}`}>
                          <option value="">— No está en Planix —</option>
                          {usuarios.map((u) => (
                            <option key={u.id} value={u.id}>{u.nombre}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="tarjeta space-y-3">
            <h2 className="font-semibold">4. Confirmar</h2>
            {duplicado && previas && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                {previas.importaciones.length > 0 && (
                  <p>
                    ⚠ Este tablero de Trello ya se importó {previas.importaciones.length === 1 ? "una vez" : `${previas.importaciones.length} veces`} (
                    {previas.importaciones.map((i) => new Date(i.creado_en).toLocaleDateString("es-AR")).join(", ")}).
                  </p>
                )}
                {previas.tablerosConNombre.length > 0 && <p>⚠ Ya hay un tablero llamado “{previas.tablerosConNombre[0].nombre}” en Planix.</p>}
                <label className="mt-2 flex items-center gap-2 font-medium">
                  <input type="checkbox" checked={igual} onChange={(e) => setIgual(e.target.checked)} className="h-4 w-4" />
                  Importar igual (se crea un tablero nuevo, no se modifica el existente)
                </label>
              </div>
            )}
            <p className="text-sm text-stone-500">Se crea un tablero nuevo con todo junto: si algo falla, no queda nada a medias. Se guarda el archivo original y quién y cuándo lo importó.</p>
            <button type="button" disabled={pendiente || !espacio || !nombre.trim() || (duplicado && !igual)} onClick={importar} className="boton">
              {pendiente ? (paso ?? "Importando…") : `Importar ${resumen.tarjetas} tarjetas`}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
