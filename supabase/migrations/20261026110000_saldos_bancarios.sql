-- Saldos bancarios: las cuentas de la empresa (con su descubierto acordado) y
-- el saldo de cada una por fecha, cargado a mano desde el banco. El total es
-- el punto de partida del saldo final del día y del cashflow.
-- Usan el permiso de la sección Financiero.

create type public.tipo_cuenta as enum ('cuenta_corriente', 'caja_ahorro', 'billetera', 'efectivo');

create table public.cuentas_bancarias (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null check (length(trim(nombre)) > 0),
  banco           text,
  tipo            public.tipo_cuenta not null default 'cuenta_corriente',
  -- Límite de descubierto acordado (cuánto puede quedar en negativo).
  descubierto     numeric(14, 2) not null default 0 check (descubierto >= 0),
  activa          boolean not null default true,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create table public.saldos_bancarios (
  id              uuid primary key default gen_random_uuid(),
  cuenta_id       uuid not null references public.cuentas_bancarias (id) on delete cascade,
  fecha           date not null,
  -- Negativo si se está usando el descubierto.
  saldo           numeric(14, 2) not null,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  unique (cuenta_id, fecha)
);

create index saldos_bancarios_fecha_idx on public.saldos_bancarios (cuenta_id, fecha desc);

create trigger cuentas_bancarias_autoria before insert or update on public.cuentas_bancarias
  for each row execute function public.marcar_autoria();
create trigger cuentas_bancarias_auditoria after insert or update or delete on public.cuentas_bancarias
  for each row execute function public.registrar_auditoria();
create trigger saldos_bancarios_autoria before insert or update on public.saldos_bancarios
  for each row execute function public.marcar_autoria();
create trigger saldos_bancarios_auditoria after insert or update or delete on public.saldos_bancarios
  for each row execute function public.registrar_auditoria();

alter table public.cuentas_bancarias enable row level security;
alter table public.saldos_bancarios enable row level security;

create policy "cuentas: ver" on public.cuentas_bancarias for select to authenticated
  using ((select public.tiene_permiso('financiero', 'ver')));
create policy "cuentas: crear" on public.cuentas_bancarias for insert to authenticated
  with check ((select public.tiene_permiso('financiero', 'editar')));
create policy "cuentas: editar" on public.cuentas_bancarias for update to authenticated
  using ((select public.tiene_permiso('financiero', 'editar')))
  with check ((select public.tiene_permiso('financiero', 'editar')));

create policy "saldos: ver" on public.saldos_bancarios for select to authenticated
  using ((select public.tiene_permiso('financiero', 'ver')));
create policy "saldos: crear" on public.saldos_bancarios for insert to authenticated
  with check ((select public.tiene_permiso('financiero', 'editar')));
create policy "saldos: editar" on public.saldos_bancarios for update to authenticated
  using ((select public.tiene_permiso('financiero', 'editar')))
  with check ((select public.tiene_permiso('financiero', 'editar')));
create policy "saldos: borrar" on public.saldos_bancarios for delete to authenticated
  using ((select public.tiene_permiso('financiero', 'editar')));

revoke all on public.cuentas_bancarias, public.saldos_bancarios from anon;
revoke delete, truncate on public.cuentas_bancarias from authenticated;
revoke truncate on public.saldos_bancarios from authenticated;
