-- Nueva sección de permisos: Solicitudes de pagos (va sola: un valor nuevo de
-- enum no se puede usar en la misma transacción en que se agrega).
--   ver    = crear solicitudes y seguir las propias
--   editar = Contabilidad: ver todas, aprobar, rechazar y registrar pagos
alter type public.seccion add value if not exists 'pagos';
