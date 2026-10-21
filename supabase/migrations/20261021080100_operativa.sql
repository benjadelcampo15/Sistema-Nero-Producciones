-- Fase 7: Operativa de eventos (personal, formulario de inscripción y seguros).
--
-- El staff se anota por un formulario público del evento (link con token).
-- Ese formulario lo procesa el servidor con la clave secreta, así que las
-- tablas no tienen políticas para usuarios anónimos.

-- ─── Personal (registro general, uno por DNI) ─────────────────────────────
create table public.personal (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null check (length(trim(nombre)) > 0),
  apellido             text not null check (length(trim(apellido)) > 0),
  dni                  text not null unique check (dni ~ '^\d{7,8}$'),
  cuil                 text check (cuil is null or cuil ~ '^\d{11}$'),
  fecha_nacimiento     date,
  telefono             text,
  email                text,
  domicilio            text,
  contacto_emergencia  text,
  alias_cbu            text,
  notas                text,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);

-- ─── Formulario público por evento ────────────────────────────────────────
alter table public.eventos
  add column form_token text unique,
  add column form_abierto boolean not null default false;

-- ─── Pólizas de seguro por evento ─────────────────────────────────────────
create table public.polizas (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references public.eventos (id),
  aseguradora     text not null,
  numero          text,
  vigencia_desde  date,
  vigencia_hasta  date,
  archivo_path    text,
  archivo_tipo    text,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now()
);

-- ─── Convocados: quién trabaja en cada evento ─────────────────────────────
create type public.estado_convocado as enum ('inscripto', 'confirmado', 'presente', 'ausente', 'baja');
create type public.estado_seguro as enum ('pendiente', 'solicitado', 'cubierto');

create table public.convocados (
  id          uuid primary key default gen_random_uuid(),
  evento_id   uuid not null references public.eventos (id),
  persona_id  uuid not null references public.personal (id),
  puesto      text,
  estado      public.estado_convocado not null default 'inscripto',
  seguro      public.estado_seguro not null default 'pendiente',
  poliza_id   uuid references public.polizas (id),
  origen      text not null default 'formulario' check (origen in ('formulario', 'manual')),
  creado_en   timestamptz not null default now(),
  unique (evento_id, persona_id)
);

create index convocados_evento_idx on public.convocados (evento_id);

create trigger personal_auditoria after insert or update or delete on public.personal
  for each row execute function public.registrar_auditoria();
create trigger polizas_auditoria after insert or update or delete on public.polizas
  for each row execute function public.registrar_auditoria();
create trigger convocados_auditoria after insert or update or delete on public.convocados
  for each row execute function public.registrar_auditoria();

-- ─── RLS ──────────────────────────────────────────────────────────────────
alter table public.personal   enable row level security;
alter table public.polizas    enable row level security;
alter table public.convocados enable row level security;

create policy "personal: ver" on public.personal for select to authenticated
  using ((select public.tiene_permiso('operativa', 'ver')));
create policy "personal: crear" on public.personal for insert to authenticated
  with check ((select public.tiene_permiso('operativa', 'editar')));
create policy "personal: editar" on public.personal for update to authenticated
  using ((select public.tiene_permiso('operativa', 'editar')))
  with check ((select public.tiene_permiso('operativa', 'editar')));

create policy "polizas: ver" on public.polizas for select to authenticated
  using ((select public.tiene_permiso('operativa', 'ver')));
create policy "polizas: crear" on public.polizas for insert to authenticated
  with check ((select public.tiene_permiso('operativa', 'editar')));

create policy "convocados: ver" on public.convocados for select to authenticated
  using ((select public.tiene_permiso('operativa', 'ver')));
create policy "convocados: crear" on public.convocados for insert to authenticated
  with check ((select public.tiene_permiso('operativa', 'editar')));
create policy "convocados: editar" on public.convocados for update to authenticated
  using ((select public.tiene_permiso('operativa', 'editar')))
  with check ((select public.tiene_permiso('operativa', 'editar')));

-- Quien maneja la operativa necesita ver los eventos. (Abrir/cerrar el
-- formulario lo hace el servidor tras verificar el permiso, sin dar edición
-- general sobre los eventos.)
create policy "eventos: ver desde operativa" on public.eventos for select to authenticated
  using ((select public.tiene_permiso('operativa', 'ver')));

revoke all on public.personal, public.polizas, public.convocados from anon;
revoke delete, truncate on public.personal, public.polizas from authenticated;
revoke truncate on public.convocados from authenticated;
-- Quitar a alguien de un evento: se borra la convocatoria (queda en auditoría).
create policy "convocados: quitar" on public.convocados for delete to authenticated
  using ((select public.tiene_permiso('operativa', 'editar')));

-- ─── Archivos de pólizas ──────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('seguros', 'seguros', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
