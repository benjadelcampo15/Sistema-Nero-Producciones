import Link from "next/link";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { misTareas } from "@/lib/tareas/consultas";
import { COLOR_VENCIMIENTO, estadoVencimiento, fondoCss, textoVencimiento } from "@/lib/tareas/tipos";
import { SinAcceso } from "../../sin-acceso";

/** Mis tareas: las tarjetas asignadas a mí en todos los tableros. */
export default async function PaginaMisTareas() {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "tareas", "ver")) return <SinAcceso />;
  const tareas = await misTareas(usuario);
  const pendientes = tareas.filter((t) => !t.completada);
  const hechas = tareas.filter((t) => t.completada);

  const fila = (t: (typeof tareas)[number]) => {
    const estado = estadoVencimiento(t.vence, t.completada);
    return (
      <li key={t.id}>
        <Link href={`/tareas/${t.tablero_id}?tarjeta=${t.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50">
          <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: fondoCss(t.fondo) }} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className={`block break-words font-medium ${t.completada ? "text-stone-500 line-through" : ""}`}>{t.titulo}</span>
            <span className="block text-xs text-stone-500">
              {t.tablero} · {t.lista}
            </span>
          </span>
          {t.vence && estado && <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${COLOR_VENCIMIENTO[estado]}`}>🕒 {textoVencimiento(t.vence)}</span>}
        </Link>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mis tareas</h1>
        <p className="text-sm text-stone-500">Las tarjetas que tenés asignadas, de todos tus tableros. Las vencidas y las más próximas, arriba.</p>
      </div>
      {tareas.length === 0 ? (
        <p className="tarjeta text-sm text-stone-500">No tenés tarjetas asignadas.</p>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="font-semibold">Pendientes ({pendientes.length})</h2>
            {pendientes.length ? <ul className="tarjeta divide-y divide-stone-100 p-0">{pendientes.map(fila)}</ul> : <p className="text-sm text-stone-500">¡Nada pendiente!</p>}
          </section>
          {hechas.length > 0 && (
            <details>
              <summary className="cursor-pointer font-semibold">Completadas ({hechas.length})</summary>
              <ul className="tarjeta mt-2 divide-y divide-stone-100 p-0">{hechas.map(fila)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
