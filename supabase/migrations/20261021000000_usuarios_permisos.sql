-- Fase 1: usuarios, permisos por sección y auditoría.
--
-- Las tablas solo se leen desde la app con la sesión del usuario (RLS).
-- Toda escritura pasa por Server Actions con la clave secreta, que
-- verifican antes que quien llama sea admin.

-- ─── Tipos ────────────────────────────────────────────────────────────────
create type public.seccion as enum ('financiero', 'eventos', 'facturas');

-- El orden importa: se compara con >= ('editar' incluye 'ver').
create type public.nivel_permiso as enum ('ninguno', 'ver', 'editar');

-- ─── Tablas ───────────────────────────────────────────────────────────────
create table public.perfiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  nombre                   text not null check (length(trim(nombre)) > 0),
  email                    text not null,
  es_admin                 boolean not null default false,
  activo                   boolean not null default true,
  debe_cambiar_contrasena  boolean not null default true,
  creado_en                timestamptz not null default now()
);

create table public.permisos (
  usuario_id  uuid not null references public.perfiles (id) on delete cascade,
  seccion     public.seccion not null,
  nivel       public.nivel_permiso not null default 'ninguno',
  primary key (usuario_id, seccion)
);

create table public.auditoria (
  id           bigint generated always as identity primary key,
  usuario_id   uuid references public.perfiles (id) on delete set null,
  accion       text not null,
  tabla        text not null,
  registro_id  text,
  antes        jsonb,
  despues      jsonb,
  fecha        timestamptz not null default now()
);

create index auditoria_fecha_idx on public.auditoria (fecha desc);
create index auditoria_registro_idx on public.auditoria (tabla, registro_id);

-- ─── Funciones de autorización (usadas por las políticas RLS) ─────────────

-- La sesión pasó el segundo factor (2FA).
create function public.sesion_con_mfa()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

create function public.es_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.sesion_con_mfa() and exists (
    select 1 from public.perfiles
    where id = auth.uid() and activo and es_admin
  )
$$;

-- ¿El usuario actual tiene al menos `p_nivel` en `p_seccion`?
-- Los admin tienen acceso total. Exige sesión con 2FA y usuario activo.
create function public.tiene_permiso(p_seccion public.seccion, p_nivel public.nivel_permiso)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.sesion_con_mfa() and exists (
    select 1 from public.perfiles pf
    where pf.id = auth.uid()
      and pf.activo
      and (
        pf.es_admin
        or exists (
          select 1 from public.permisos pm
          where pm.usuario_id = pf.id
            and pm.seccion = p_seccion
            and pm.nivel >= p_nivel
        )
      )
  )
$$;

revoke execute on function public.sesion_con_mfa() from public, anon;
revoke execute on function public.es_admin() from public, anon;
revoke execute on function public.tiene_permiso(public.seccion, public.nivel_permiso) from public, anon;
grant execute on function public.sesion_con_mfa() to authenticated;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.tiene_permiso(public.seccion, public.nivel_permiso) to authenticated;

-- ─── Auditoría genérica (para las tablas de las próximas fases) ───────────
create function public.registrar_auditoria()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.auditoria (usuario_id, accion, tabla, registro_id, antes, despues)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    case when tg_op = 'DELETE' then to_jsonb(old) ->> 'id' else to_jsonb(new) ->> 'id' end,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end
$$;

revoke execute on function public.registrar_auditoria() from public, anon, authenticated;

-- ─── Row Level Security ───────────────────────────────────────────────────
alter table public.perfiles  enable row level security;
alter table public.permisos  enable row level security;
alter table public.auditoria enable row level security;

-- El propio perfil se puede leer sin 2FA: el login lo necesita para saber
-- si el usuario está activo o debe cambiar la contraseña.
create policy "perfiles: el propio o admin"
  on public.perfiles for select to authenticated
  using (id = (select auth.uid()) or (select public.es_admin()));

create policy "permisos: los propios o admin"
  on public.permisos for select to authenticated
  using (
    (usuario_id = (select auth.uid()) and (select public.sesion_con_mfa()))
    or (select public.es_admin())
  );

create policy "auditoria: solo admin"
  on public.auditoria for select to authenticated
  using ((select public.es_admin()));

-- Nadie escribe desde el navegador: solo el servidor con la clave secreta.
revoke all on public.perfiles, public.permisos, public.auditoria from anon;
revoke insert, update, delete, truncate on public.perfiles, public.permisos, public.auditoria from authenticated;
