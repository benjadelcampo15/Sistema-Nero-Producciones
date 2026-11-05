/** Mientras este sistema no tiene la conexión con la base central de Planix. */
export function SinConfigurar() {
  return (
    <div className="tarjeta max-w-xl space-y-2 p-6">
      <h1 className="text-xl font-semibold">Solicitudes y mejoras</h1>
      <p className="text-sm text-stone-600">
        El Centro de Solicitudes todavía no está conectado en este sistema. Faltan las variables CENTRAL_SUPABASE_URL, CENTRAL_SUPABASE_SECRET_KEY y PLANIX_EMPRESA.
      </p>
    </div>
  );
}
