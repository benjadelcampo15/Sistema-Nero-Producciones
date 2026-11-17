-- Secciones de permisos de Quilmes (van solas: un valor nuevo de enum no se
-- puede usar en la misma transacción en que se agrega).
--   quilmes        = proyectos Quilmes y su presupuesto comercial (Solicitudes, PDF para el cliente)
--   quilmes_costos = información interna: gastos reales, planilla, rentabilidad y movimientos
alter type public.seccion add value if not exists 'quilmes';
alter type public.seccion add value if not exists 'quilmes_costos';
