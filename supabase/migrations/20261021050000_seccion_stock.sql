-- Nueva sección de permisos. Va sola porque un valor nuevo de enum no se
-- puede usar en la misma transacción en que se agrega.
alter type public.seccion add value if not exists 'stock';
