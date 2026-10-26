-- Movimientos sin fecha: los que no tienen fecha en la planilla se cargan sin
-- fecha (no se inventa una). No entran al cashflow ni a los totales por
-- período hasta que se les ponga fecha.
alter table public.transacciones alter column fecha drop not null;
