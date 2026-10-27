-- Dos financieros: Nero y Ruta. Cada movimiento es de una empresa; el cashflow suma los dos.
alter table public.transacciones
  add column if not exists empresa text not null default 'nero';

alter table public.transacciones drop constraint if exists transacciones_empresa_check;
alter table public.transacciones
  add constraint transacciones_empresa_check check (empresa in ('nero', 'ruta'));

create index if not exists transacciones_empresa_fecha_idx on public.transacciones (empresa, fecha);
