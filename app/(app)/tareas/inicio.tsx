"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { crearEspacio, crearTablero, editarEspacio, editarTablero, marcarFavorito, miembroEspacio } from "@/lib/tareas/acciones";
import { tableroDesde } from "@/lib/tareas/acciones-avanzadas";
import { FONDOS, fondoCss, type Espacio, type TableroResumen, type Usuario } from "@/lib/tareas/tipos";
import { Avatar, Ventana } from "./comunes";

type MiembroEspacio = { espacio_id: string; usuario_id: string; rol: "admin" | "miembro" };

export function InicioTareas({
  espacios,
  tableros,
  miembrosEspacios,
  urls,
  usuarios,
  yo,
  creaEspacios,
}: {
  espacios: Espacio[];
  tableros: TableroResumen[];
  miembrosEspacios: MiembroEspacio[];
  urls: Record<string, string>;
  usuarios: Usuario[];
  yo: string;
  creaEspacios: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [creando, setCreando] = useState<string | null>(null);
  const [espacioNuevo, setEspacioNuevo] = useState(false);
  const [administrando, setAdministrando] = useState<Espacio | null>(null);
  const [verArchivados, setVerArchivados] = useState(false);
  const q = busqueda.trim().toLowerCase();
  const visibles = tableros.filter((t) => !t.archivado && (!q || t.nombre.toLowerCase().includes(q)));
  const favoritos = visibles.filter((t) => t.favorito);
  const recientes = [...visibles].filter((t) => t.visto_en).sort((a, b) => b.visto_en!.localeCompare(a.visto_en!)).slice(0, 4);
  const archivados = tableros.filter((t) => t.archivado);
  const espaciosParaCrear = espacios.filter((e) => e.rol);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tareas</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar tableros…" aria-label="Buscar tableros" className="campo w-56" />
          {espaciosParaCrear.length > 0 && (
            <button type="button" onClick={() => setCreando(espaciosParaCrear[0].id)} className="boton">
              + Crear tablero
            </button>
          )}
          <Link href="/tareas/buscar" className="boton-secundario">☰ Tabla y búsqueda</Link>
          {espaciosParaCrear.length > 0 && (
            <Link href="/tareas/importar" className="boton-secundario">⇪ Importar desde Trello</Link>
          )}
          {creaEspacios && (
            <button type="button" onClick={() => setEspacioNuevo(true)} className="boton-secundario">
              + Espacio de trabajo
            </button>
          )}
        </div>
      </div>

      {favoritos.length > 0 && <Grupo titulo="★ Tableros favoritos" tableros={favoritos} urls={urls} />}
      {recientes.length > 0 && !q && <Grupo titulo="🕘 Vistos recientemente" tableros={recientes} urls={urls} />}

      {espacios.length === 0 && (
        <p className="tarjeta text-sm text-stone-600">
          Todavía no estás en ningún espacio de trabajo. {creaEspacios ? "Creá uno con “+ Espacio de trabajo”." : "Pedile a un administrador que te agregue."}
        </p>
      )}

      {espacios.map((e) => {
        const propios = visibles.filter((t) => t.espacio_id === e.id);
        const integrantes = miembrosEspacios.filter((m) => m.espacio_id === e.id);
        if (q && !propios.length) return null;
        return (
          <section key={e.id} className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-stone-700 to-stone-950 font-bold text-white">{e.nombre[0]?.toUpperCase()}</span>
              <h2 className="text-lg font-semibold">{e.nombre}</h2>
              <div className="flex -space-x-1.5">
                {integrantes.slice(0, 8).map((m) => (
                  <Avatar key={m.usuario_id} usuario={usuarios.find((u) => u.id === m.usuario_id)} tam={24} />
                ))}
              </div>
              {e.rol === "admin" && (
                <button type="button" onClick={() => setAdministrando(e)} className="text-sm text-stone-600 underline">
                  Integrantes y configuración
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {propios.map((t) => (
                <TarjetaTablero key={t.id} t={t} url={urls[t.fondo]} />
              ))}
              {e.rol && !q && (
                <button
                  type="button"
                  onClick={() => setCreando(e.id)}
                  className="flex h-24 items-center justify-center rounded-lg bg-stone-200/70 text-sm text-stone-700 hover:bg-stone-300"
                >
                  Crear un tablero nuevo
                </button>
              )}
            </div>
            {!propios.length && !e.rol && <p className="text-sm text-stone-500">No tenés tableros en este espacio.</p>}
          </section>
        );
      })}

      {archivados.length > 0 && (
        <section className="space-y-2">
          <button type="button" onClick={() => setVerArchivados(!verArchivados)} className="text-sm text-stone-600 underline">
            {verArchivados ? "Ocultar" : "Ver"} tableros archivados ({archivados.length})
          </button>
          {verArchivados && (
            <ul className="tarjeta divide-y divide-stone-100 p-0 text-sm">
              {archivados.map((t) => (
                <TableroArchivado key={t.id} t={t} />
              ))}
            </ul>
          )}
        </section>
      )}

      {creando && (
        <CrearTablero
          espacios={espaciosParaCrear}
          espacioInicial={creando}
          usuarios={usuarios}
          yo={yo}
          plantillas={tableros.filter((t) => t.es_plantilla)}
          cerrar={() => setCreando(null)}
        />
      )}
      {espacioNuevo && <NuevoEspacio cerrar={() => setEspacioNuevo(false)} />}
      {administrando && (
        <AdministrarEspacio espacio={administrando} miembros={miembrosEspacios.filter((m) => m.espacio_id === administrando.id)} usuarios={usuarios} cerrar={() => setAdministrando(null)} />
      )}
    </div>
  );
}

function Grupo({ titulo, tableros, urls }: { titulo: string; tableros: TableroResumen[]; urls: Record<string, string> }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tableros.map((t) => (
          <TarjetaTablero key={t.id} t={t} url={urls[t.fondo]} />
        ))}
      </div>
    </section>
  );
}

function TarjetaTablero({ t, url }: { t: TableroResumen; url?: string }) {
  const [fav, setFav] = useState(t.favorito);
  const [, iniciar] = useTransition();
  return (
    <Link href={`/tareas/${t.id}`} className="group relative flex h-24 flex-col justify-between overflow-hidden rounded-lg p-3 text-white shadow-sm" style={{ background: fondoCss(t.fondo, url) }}>
      <span className="absolute inset-0 bg-black/20 transition group-hover:bg-black/35" aria-hidden />
      <span className="relative line-clamp-2 font-bold drop-shadow">{t.nombre}</span>
      <span className="relative flex items-center justify-between text-xs">
        <span>
          {t.visibilidad === "privado" ? "🔒 Privado" : ""}
          {t.es_plantilla ? " 📋 Plantilla" : ""}
        </span>
        <button
          type="button"
          aria-label={fav ? "Quitar de favoritos" : "Marcar como favorito"}
          onClick={(e) => {
            e.preventDefault();
            setFav(!fav);
            iniciar(async () => void (await marcarFavorito(t.id, !fav)));
          }}
          className={`text-lg leading-none ${fav ? "text-amber-300" : "text-white/80 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"}`}
        >
          {fav ? "★" : "☆"}
        </button>
      </span>
    </Link>
  );
}

function TableroArchivado({ t }: { t: TableroResumen }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      <span>{t.nombre}</span>
      <span className="flex gap-3">
        <Link href={`/tareas/${t.id}`} className="underline">Abrir</Link>
        <button type="button" disabled={pendiente} onClick={() => iniciar(async () => void (await editarTablero(t.id, { archivado: false })))} className="underline">
          Restaurar
        </button>
      </span>
    </li>
  );
}

/** Crear tablero: nombre, espacio, fondo, visibilidad, descripción e integrantes. Al crearlo, se abre. */
function CrearTablero({
  espacios,
  espacioInicial,
  usuarios,
  yo,
  plantillas,
  cerrar,
}: {
  espacios: Espacio[];
  espacioInicial: string;
  usuarios: Usuario[];
  yo: string;
  plantillas: TableroResumen[];
  cerrar: () => void;
}) {
  const [plantilla, setPlantilla] = useState("");
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [espacio, setEspacio] = useState(espacioInicial);
  const [fondo, setFondo] = useState("c:azul");
  const [visibilidad, setVisibilidad] = useState<"espacio" | "privado">("espacio");
  const [descripcion, setDescripcion] = useState("");
  const [miembros, setMiembros] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <Ventana titulo="Crear tablero" cerrar={cerrar}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          iniciar(async () => {
            if (plantilla) {
              const r = await tableroDesde(plantilla, espacio, nombre, true);
              if (r.error || !r.id) return setError(r.error ?? "No se pudo crear");
              return router.push(`/tareas/${r.id}`);
            }
            const r = await crearTablero({ espacio_id: espacio, nombre, fondo, visibilidad, descripcion, miembros });
            if (r.error || !r.id) return setError(r.error ?? "No se pudo crear");
            router.push(`/tareas/${r.id}`);
          });
        }}
      >
        <div className="flex h-28 items-center justify-center rounded-lg p-3" style={{ background: fondoCss(fondo) }}>
          <div className="grid w-40 grid-cols-3 gap-1.5 opacity-90">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-14 rounded bg-white/80" />
            ))}
          </div>
        </div>
        <div>
          <p className="etiqueta">Fondo</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(FONDOS).map(([k, f]) => (
              <button
                key={k}
                type="button"
                title={f.nombre}
                aria-label={`Fondo ${f.nombre}`}
                onClick={() => setFondo(`c:${k}`)}
                className={`h-8 w-12 rounded ${fondo === `c:${k}` ? "ring-2 ring-stone-900 ring-offset-2" : ""}`}
                style={{ background: f.css }}
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-stone-500">Una imagen propia se elige después, desde el menú del tablero.</p>
        </div>
        {plantillas.length > 0 && (
          <label className="block">
            <span className="etiqueta">Empezar desde</span>
            <select value={plantilla} onChange={(e) => setPlantilla(e.target.value)} className="campo">
              <option value="">Tablero vacío (Por hacer, En proceso, En revisión, Terminado)</option>
              {plantillas.map((t) => (
                <option key={t.id} value={t.id}>Plantilla: {t.nombre}</option>
              ))}
            </select>
            {plantilla && <span className="mt-1 block text-xs text-stone-500">Copia listas, etiquetas y tarjetas con sus checklists; sin fechas, completados, responsables ni comentarios.</span>}
          </label>
        )}
        <label className="block">
          <span className="etiqueta">Título del tablero</span>
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={120} className="campo" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="etiqueta">Espacio de trabajo</span>
            <select value={espacio} onChange={(e) => setEspacio(e.target.value)} className="campo">
              {espacios.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="etiqueta">Visibilidad</span>
            <select value={visibilidad} onChange={(e) => setVisibilidad(e.target.value as "espacio" | "privado")} className="campo">
              <option value="espacio">Espacio de trabajo (todos sus integrantes)</option>
              <option value="privado">Privado (solo los integrantes del tablero)</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="etiqueta">Descripción (opcional)</span>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} maxLength={4000} className="campo" />
        </label>
        <div>
          <p className="etiqueta">Integrantes</p>
          <div className="flex flex-wrap gap-1.5">
            {usuarios
              .filter((u) => u.id !== yo)
              .map((u) => {
                const sel = miembros.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setMiembros(sel ? miembros.filter((x) => x !== u.id) : [...miembros, u.id])}
                    className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-sm ${sel ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}
                  >
                    <Avatar usuario={u} tam={22} />
                    {u.nombre}
                  </button>
                );
              })}
          </div>
          <p className="mt-1 text-xs text-stone-500">Vos quedás como administrador del tablero.</p>
        </div>
        {error && <p className="alerta-error">{error}</p>}
        <button type="submit" disabled={pendiente || !nombre.trim()} className="boton w-full">
          {pendiente ? "Creando…" : "Crear"}
        </button>
      </form>
    </Ventana>
  );
}

function NuevoEspacio({ cerrar }: { cerrar: () => void }) {
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <Ventana titulo="Nuevo espacio de trabajo" cerrar={cerrar}>
      <form
        className="space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            const r = await crearEspacio(nombre);
            if (r.error) setError(r.error);
            else cerrar();
          });
        }}
      >
        <label className="block">
          <span className="etiqueta">Nombre</span>
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} required className="campo" placeholder="Ej.: RUTA" />
        </label>
        {error && <p className="alerta-error">{error}</p>}
        <button type="submit" disabled={pendiente} className="boton">Crear espacio</button>
      </form>
    </Ventana>
  );
}

/** Integrantes del espacio (administrador o miembro) y nombre. */
function AdministrarEspacio({ espacio, miembros, usuarios, cerrar }: { espacio: Espacio; miembros: MiembroEspacio[]; usuarios: Usuario[]; cerrar: () => void }) {
  const [nombre, setNombre] = useState(espacio.nombre);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const correr = (f: () => Promise<{ error?: string }>) =>
    iniciar(async () => {
      const r = await f();
      setError(r.error ?? null);
    });
  const libres = usuarios.filter((u) => !miembros.some((m) => m.usuario_id === u.id));
  return (
    <Ventana titulo={`Espacio ${espacio.nombre}`} cerrar={cerrar}>
      <div className="space-y-4 p-5">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            correr(() => editarEspacio(espacio.id, nombre));
          }}
        >
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} aria-label="Nombre del espacio" className="campo" />
          <button type="submit" disabled={pendiente} className="boton-secundario">Guardar</button>
        </form>
        <div>
          <p className="etiqueta">Integrantes</p>
          <p className="mb-2 text-xs text-stone-500">Ven todos los tableros del espacio que no son privados. Los administradores gestionan integrantes y esos tableros.</p>
          <ul className="divide-y divide-stone-200 text-sm">
            {miembros.map((m) => {
              const u = usuarios.find((x) => x.id === m.usuario_id);
              return (
                <li key={m.usuario_id} className="flex items-center gap-2 py-1.5">
                  <Avatar usuario={u ?? { id: m.usuario_id, nombre: "?" }} tam={26} />
                  <span className="flex-1">{u?.nombre ?? "Usuario sin acceso a Tareas"}</span>
                  <select value={m.rol} disabled={pendiente} onChange={(e) => correr(() => miembroEspacio(espacio.id, m.usuario_id, e.target.value as "admin" | "miembro"))} className="campo w-auto py-1 text-sm">
                    <option value="admin">Administrador</option>
                    <option value="miembro">Miembro</option>
                  </select>
                  <button type="button" disabled={pendiente} onClick={() => correr(() => miembroEspacio(espacio.id, m.usuario_id, null))} className="text-xs text-red-700 underline">
                    Quitar
                  </button>
                </li>
              );
            })}
          </ul>
          {libres.length > 0 && (
            <select value="" disabled={pendiente} onChange={(e) => e.target.value && correr(() => miembroEspacio(espacio.id, e.target.value, "miembro"))} aria-label="Agregar integrante" className="campo mt-2 text-sm">
              <option value="">+ Agregar integrante…</option>
              {libres.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          )}
          <p className="mt-2 text-xs text-stone-500">Solo aparecen los usuarios de Planix con acceso a Tareas (se da en Configuración → Usuarios).</p>
        </div>
        {error && <p className="alerta-error">{error}</p>}
      </div>
    </Ventana>
  );
}
