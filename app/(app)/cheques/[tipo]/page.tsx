import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerUsuario, puede } from "@/lib/auth/sesion";
import { listarCheques } from "@/lib/cheques/consultas";
import { obtenerEventosResumidos } from "@/lib/financiero/consultas";
import { DIAS_AVISO, PESTANAS, diasEntre, nombreEstado, type Cheque } from "@/lib/cheques/tipos";
import { formatoFecha, formatoPesos, hoy, sumar } from "@/lib/formato";
import { SinAcceso } from "../../sin-acceso";
import { AccionesCheque, FormularioCheque } from "./formulario-cheque";

export default async function PaginaChequesPorTipo({ params }: PageProps<"/cheques/[tipo]">) {
  const usuario = await obtenerUsuario();
  if (!puede(usuario, "cheques", "ver")) return <SinAcceso />;
  const { tipo: ruta } = await params;
  const pestana = PESTANAS.find((p) => p.ruta === ruta);
  if (!pestana) notFound();
  const tipo = pestana.tipo;
  const editable = puede(usuario, "cheques", "editar");

  const [cheques, eventos] = await Promise.all([listarCheques(tipo), editable ? obtenerEventosResumidos() : []]);
  const fechaHoy = hoy();
  const pendientes = cheques.filter((c) => c.estado === "pendiente");
  // Historial: lo último primero.
  const resto = cheques.filter((c) => c.estado !== "pendiente").reverse();
  const vencidos = pendientes.filter((c) => c.fecha_pago < fechaHoy);
  const proximos = pendientes.filter((c) => c.fecha_pago >= fechaHoy && diasEntre(fechaHoy, c.fecha_pago) <= 7);
  const total = (lista: Cheque[]) => formatoPesos(sumar(lista.map((c) => c.monto)));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Cheques</h1>

      <nav className="flex gap-1 border-b border-stone-200">
        {PESTANAS.map((p) => (
          <Link
            key={p.ruta}
            href={`/cheques/${p.ruta}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              p.ruta === ruta ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-900"
            }`}
          >
            {p.nombre}
          </Link>
        ))}
      </nav>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="tarjeta">
          <p className="text-xs uppercase tracking-wide text-stone-500">{tipo === "emitido" ? "Por debitarse" : "En cartera"}</p>
          <p className="mt-1 text-xl font-semibold">{total(pendientes)}</p>
          <p className="text-xs text-stone-500">{pendientes.length} cheque{pendientes.length === 1 ? "" : "s"}</p>
        </div>
        <div className="tarjeta">
          <p className="text-xs uppercase tracking-wide text-stone-500">Vencen en 7 días</p>
          <p className="mt-1 text-xl font-semibold">{total(proximos)}</p>
          <p className="text-xs text-stone-500">{proximos.length} cheque{proximos.length === 1 ? "" : "s"}</p>
        </div>
        <div className={`tarjeta ${vencidos.length ? "border-red-300 bg-red-50" : ""}`}>
          <p className="text-xs uppercase tracking-wide text-stone-500">Vencidos sin {tipo === "emitido" ? "debitar" : "depositar"}</p>
          <p className="mt-1 text-xl font-semibold">{total(vencidos)}</p>
          <p className="text-xs text-stone-500">{vencidos.length} cheque{vencidos.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      {editable && (
        <details className="tarjeta">
          <summary className="cursor-pointer font-semibold">+ Nuevo cheque {tipo}</summary>
          <div className="mt-4">
            <FormularioCheque tipo={tipo} eventos={eventos} />
          </div>
        </details>
      )}

      <p className="text-xs text-stone-500">
        Se avisa por mail {DIAS_AVISO} días antes de la fecha de pago de cada cheque pendiente.
      </p>

      <Lista titulo="Pendientes" cheques={pendientes} fechaHoy={fechaHoy} editable={editable} eventos={eventos} vacio="No hay cheques pendientes." />
      {resto.length > 0 && <Lista titulo="Historial" cheques={resto} fechaHoy={fechaHoy} editable={editable} eventos={eventos} />}
    </div>
  );
}

function Lista({
  titulo,
  cheques,
  fechaHoy,
  editable,
  eventos,
  vacio,
}: {
  titulo: string;
  cheques: Cheque[];
  fechaHoy: string;
  editable: boolean;
  eventos: { id: string; nombre: string; fecha: string }[];
  vacio?: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{titulo}</h2>
      <div className="tarjeta divide-y divide-stone-100 p-0">
        {cheques.length === 0 && <p className="p-6 text-center text-sm text-stone-500">{vacio}</p>}
        {cheques.map((c) => {
          const encabezado = <Encabezado c={c} fechaHoy={fechaHoy} />;
          return editable ? (
            <details key={c.id}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">{encabezado}</summary>
              <div className="space-y-4 border-t border-stone-100 bg-stone-50 px-4 py-4">
                <AccionesCheque id={c.id} tipo={c.tipo} estado={c.estado} />
                <FormularioCheque tipo={c.tipo} eventos={eventos} cheque={c} />
              </div>
            </details>
          ) : (
            <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">{encabezado}</div>
          );
        })}
      </div>
    </section>
  );
}

function Encabezado({ c, fechaHoy }: { c: Cheque; fechaHoy: string }) {
  const dias = diasEntre(fechaHoy, c.fecha_pago);
  const pendiente = c.estado === "pendiente";
  const aviso =
    !pendiente ? null : dias < 0 ? (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Vencido hace {-dias} d</span>
    ) : dias <= DIAS_AVISO ? (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        {dias === 0 ? "Vence hoy" : dias === 1 ? "Vence mañana" : `Vence en ${dias} días`}
      </span>
    ) : null;
  const detalle = [c.banco, c.numero ? `N° ${c.numero}` : null, c.electronico ? "eCheq" : null].filter(Boolean).join(" · ");

  return (
    <>
      <span className="w-24 shrink-0 font-mono text-stone-600">{formatoFecha(c.fecha_pago)}</span>
      <span className="min-w-40 flex-1">
        <span className="font-medium">{c.contraparte}</span>
        {detalle && <span className="block text-xs text-stone-500">{detalle}</span>}
        {c.evento && <span className="block text-xs text-stone-500">Evento: {c.evento.nombre}</span>}
      </span>
      {aviso}
      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">{nombreEstado(c.tipo, c.estado)}</span>
      <span className="w-32 text-right font-mono font-medium">{formatoPesos(c.monto)}</span>
    </>
  );
}
