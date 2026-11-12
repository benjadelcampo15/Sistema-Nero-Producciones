-- Tarjetas de crédito: un consumo puede ser de las dos empresas en partes
-- iguales ("ambas" = Nero / Ruta 50/50). Sigue siendo un solo movimiento: el
-- reparto se calcula (el centavo impar va a la primera empresa).
alter table public.tarjeta_movimientos drop constraint if exists tarjeta_movimientos_empresa_check;
alter table public.tarjeta_movimientos add constraint tarjeta_movimientos_empresa_check check (empresa in ('nero', 'ruta', 'ambas'));
alter table public.tarjeta_reglas drop constraint if exists tarjeta_reglas_empresa_check;
alter table public.tarjeta_reglas add constraint tarjeta_reglas_empresa_check check (empresa in ('nero', 'ruta', 'ambas'));
