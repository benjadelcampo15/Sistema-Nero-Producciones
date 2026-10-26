-- Empleados (personal de eventos): formulario público único que reemplaza al
-- Google Form. Un DNI nuevo se carga directo; si el DNI ya existe, lo enviado
-- queda para revisar (nadie puede cambiar los datos —por ejemplo el CBU— de
-- otra persona solo con su DNI). Lo procesa el servidor con la clave secreta.

create table if not exists public.formulario_personal (
  unico      boolean primary key default true check (unico),
  token      text not null unique,
  abierto    boolean not null default true,
  creado_en  timestamptz not null default now()
);

create table if not exists public.personal_envios (
  id          uuid primary key default gen_random_uuid(),
  persona_id  uuid references public.personal (id) on delete cascade,
  -- Lo que mandó la persona (mismos campos que personal).
  datos       jsonb not null,
  -- nuevo: se creó la persona · cambios: hay que revisar · aplicado / descartado
  estado      text not null default 'cambios' check (estado in ('nuevo', 'cambios', 'aplicado', 'descartado')),
  creado_en   timestamptz not null default now()
);
create index if not exists personal_envios_pendientes_idx on public.personal_envios (creado_en desc) where estado = 'cambios';

drop trigger if exists personal_envios_auditoria on public.personal_envios;
create trigger personal_envios_auditoria after insert or update or delete on public.personal_envios
  for each row execute function public.registrar_auditoria();

alter table public.formulario_personal enable row level security;
alter table public.personal_envios enable row level security;

drop policy if exists "formulario personal: ver" on public.formulario_personal;
create policy "formulario personal: ver" on public.formulario_personal for select to authenticated
  using ((select public.tiene_permiso('operativa', 'ver')));
drop policy if exists "formulario personal: crear" on public.formulario_personal;
create policy "formulario personal: crear" on public.formulario_personal for insert to authenticated
  with check ((select public.tiene_permiso('operativa', 'editar')));
drop policy if exists "formulario personal: editar" on public.formulario_personal;
create policy "formulario personal: editar" on public.formulario_personal for update to authenticated
  using ((select public.tiene_permiso('operativa', 'editar')))
  with check ((select public.tiene_permiso('operativa', 'editar')));

drop policy if exists "envios: ver" on public.personal_envios;
create policy "envios: ver" on public.personal_envios for select to authenticated
  using ((select public.tiene_permiso('operativa', 'ver')));
drop policy if exists "envios: editar" on public.personal_envios;
create policy "envios: editar" on public.personal_envios for update to authenticated
  using ((select public.tiene_permiso('operativa', 'editar')))
  with check ((select public.tiene_permiso('operativa', 'editar')));

-- Pólizas: también se corrigen.
drop policy if exists "polizas: editar" on public.polizas;
create policy "polizas: editar" on public.polizas for update to authenticated
  using ((select public.tiene_permiso('operativa', 'editar')))
  with check ((select public.tiene_permiso('operativa', 'editar')));

create or replace function public.marcar_actualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists personal_actualizado on public.personal;
create trigger personal_actualizado before update on public.personal
  for each row execute function public.marcar_actualizado();

revoke all on public.formulario_personal, public.personal_envios from anon;
revoke delete, truncate on public.formulario_personal, public.personal_envios from authenticated;
