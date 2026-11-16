-- Tareas: tableros tipo Trello (espacios de trabajo, tableros, listas y tarjetas).
-- Módulo independiente: no se relaciona con Eventos, Financiero ni Contabilidad.

create table if not exists public.tareas_espacios (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null check (length(trim(nombre)) between 1 and 80),
  descripcion  text,
  creado_por   uuid references public.perfiles (id) default auth.uid(),
  creado_en    timestamptz not null default now()
);

create table if not exists public.tareas_espacio_miembros (
  espacio_id  uuid not null references public.tareas_espacios (id) on delete cascade,
  usuario_id  uuid not null references public.perfiles (id) on delete cascade,
  rol         text not null default 'miembro' check (rol in ('admin', 'miembro')),
  primary key (espacio_id, usuario_id)
);

create table if not exists public.tareas_tableros (
  id              uuid primary key default gen_random_uuid(),
  espacio_id      uuid not null references public.tareas_espacios (id) on delete cascade,
  nombre          text not null check (length(trim(nombre)) between 1 and 120),
  descripcion     text,
  -- 'c:<color>' o 'img:<ruta en storage>'
  fondo           text not null default 'c:azul',
  -- privado: solo sus integrantes; espacio: todos los del espacio de trabajo.
  visibilidad     text not null default 'espacio' check (visibilidad in ('privado', 'espacio')),
  archivado       boolean not null default false,
  creado_por      uuid references public.perfiles (id) default auth.uid(),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists tareas_tableros_espacio_idx on public.tareas_tableros (espacio_id);

create table if not exists public.tareas_tablero_miembros (
  tablero_id  uuid not null references public.tareas_tableros (id) on delete cascade,
  usuario_id  uuid not null references public.perfiles (id) on delete cascade,
  rol         text not null default 'miembro' check (rol in ('admin', 'miembro', 'observador')),
  primary key (tablero_id, usuario_id)
);
create index if not exists tareas_tablero_miembros_usuario_idx on public.tareas_tablero_miembros (usuario_id);

create table if not exists public.tareas_listas (
  id          uuid primary key default gen_random_uuid(),
  tablero_id  uuid not null references public.tareas_tableros (id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) between 1 and 120),
  posicion    double precision not null default 0,
  archivada   boolean not null default false,
  creado_en   timestamptz not null default now()
);
create index if not exists tareas_listas_tablero_idx on public.tareas_listas (tablero_id, posicion);

create table if not exists public.tareas_tarjetas (
  id              uuid primary key default gen_random_uuid(),
  tablero_id      uuid not null references public.tareas_tableros (id) on delete cascade,
  lista_id        uuid not null references public.tareas_listas (id) on delete cascade,
  titulo          text not null check (length(trim(titulo)) between 1 and 500),
  descripcion     text,
  posicion        double precision not null default 0,
  vence           timestamptz,
  completada      boolean not null default false,
  archivada       boolean not null default false,
  creado_por      uuid references public.perfiles (id) default auth.uid(),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  -- Sube con cada cambio: sirve para no pisar cambios de otra persona.
  version         integer not null default 1
);
create index if not exists tareas_tarjetas_lista_idx on public.tareas_tarjetas (lista_id, posicion);
create index if not exists tareas_tarjetas_tablero_idx on public.tareas_tarjetas (tablero_id);

create table if not exists public.tareas_tarjeta_miembros (
  tarjeta_id  uuid not null references public.tareas_tarjetas (id) on delete cascade,
  usuario_id  uuid not null references public.perfiles (id) on delete cascade,
  primary key (tarjeta_id, usuario_id)
);
create index if not exists tareas_tarjeta_miembros_usuario_idx on public.tareas_tarjeta_miembros (usuario_id);

create table if not exists public.tareas_favoritos (
  usuario_id  uuid not null references public.perfiles (id) on delete cascade default auth.uid(),
  tablero_id  uuid not null references public.tareas_tableros (id) on delete cascade,
  primary key (usuario_id, tablero_id)
);

create table if not exists public.tareas_recientes (
  usuario_id  uuid not null references public.perfiles (id) on delete cascade default auth.uid(),
  tablero_id  uuid not null references public.tareas_tableros (id) on delete cascade,
  visto_en    timestamptz not null default now(),
  primary key (usuario_id, tablero_id)
);

-- ─── Roles ───────────────────────────────────────────────────────────────

-- Rol del usuario actual en un espacio: 'admin', 'miembro' o null.
create or replace function public.tareas_rol_espacio(p_espacio uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not public.tiene_permiso('tareas', 'ver') then null
    when public.es_admin() then 'admin'
    else (select m.rol from public.tareas_espacio_miembros m where m.espacio_id = p_espacio and m.usuario_id = auth.uid())
  end
$$;

-- Rol del usuario actual en un tablero: 'admin', 'miembro', 'observador' o null (sin acceso).
-- Integrante del tablero: su rol. Tablero visible para el espacio: los del espacio (admin del espacio = admin).
create or replace function public.tareas_rol(p_tablero uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not public.tiene_permiso('tareas', 'ver') then null
    when public.es_admin() then 'admin'
    else coalesce(
      (select m.rol from public.tareas_tablero_miembros m where m.tablero_id = p_tablero and m.usuario_id = auth.uid()),
      (select case em.rol when 'admin' then 'admin' else 'miembro' end
         from public.tareas_tableros t
         join public.tareas_espacio_miembros em on em.espacio_id = t.espacio_id and em.usuario_id = auth.uid()
         where t.id = p_tablero and t.visibilidad = 'espacio')
    )
  end
$$;

create or replace function public.tareas_puede_editar(p_tablero uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.tareas_rol(p_tablero) in ('admin', 'miembro'), false)
$$;

revoke execute on function public.tareas_rol_espacio(uuid) from public, anon;
revoke execute on function public.tareas_rol(uuid) from public, anon;
revoke execute on function public.tareas_puede_editar(uuid) from public, anon;
grant execute on function public.tareas_rol_espacio(uuid) to authenticated;
grant execute on function public.tareas_rol(uuid) to authenticated;
grant execute on function public.tareas_puede_editar(uuid) to authenticated;

-- ─── Consistencia ───────────────────────────────────────────────────────

-- La tarjeta siempre pertenece al tablero de su lista; cada cambio sube la versión.
create or replace function public.tareas_tarjeta_consistente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select l.tablero_id into new.tablero_id from public.tareas_listas l where l.id = new.lista_id;
  if new.tablero_id is null then raise exception 'La lista no existe'; end if;
  if tg_op = 'UPDATE' then
    new.actualizado_en := now();
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;
drop trigger if exists tareas_tarjetas_consistente on public.tareas_tarjetas;
create trigger tareas_tarjetas_consistente before insert or update on public.tareas_tarjetas
  for each row execute function public.tareas_tarjeta_consistente();

create or replace function public.tareas_tablero_actualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;
drop trigger if exists tareas_tableros_actualizado on public.tareas_tableros;
create trigger tareas_tableros_actualizado before update on public.tareas_tableros
  for each row execute function public.tareas_tablero_actualizado();

-- ─── Permisos (RLS) ─────────────────────────────────────────────────────
alter table public.tareas_espacios enable row level security;
alter table public.tareas_espacio_miembros enable row level security;
alter table public.tareas_tableros enable row level security;
alter table public.tareas_tablero_miembros enable row level security;
alter table public.tareas_listas enable row level security;
alter table public.tareas_tarjetas enable row level security;
alter table public.tareas_tarjeta_miembros enable row level security;
alter table public.tareas_favoritos enable row level security;
alter table public.tareas_recientes enable row level security;

-- Espacios: los ven sus integrantes y quienes están en algún tablero del espacio.
drop policy if exists tareas_espacios_ver on public.tareas_espacios;
create policy tareas_espacios_ver on public.tareas_espacios for select to authenticated using (
  public.tareas_rol_espacio(id) is not null
  or exists (select 1 from public.tareas_tableros t where t.espacio_id = id and public.tareas_rol(t.id) is not null)
);
drop policy if exists tareas_espacios_editar on public.tareas_espacios;
create policy tareas_espacios_editar on public.tareas_espacios for update to authenticated
  using (public.tareas_rol_espacio(id) = 'admin') with check (public.tareas_rol_espacio(id) = 'admin');
drop policy if exists tareas_espacios_borrar on public.tareas_espacios;
create policy tareas_espacios_borrar on public.tareas_espacios for delete to authenticated using (public.tareas_rol_espacio(id) = 'admin');

drop policy if exists tareas_espacio_miembros_ver on public.tareas_espacio_miembros;
create policy tareas_espacio_miembros_ver on public.tareas_espacio_miembros for select to authenticated
  using (public.tareas_rol_espacio(espacio_id) is not null);
drop policy if exists tareas_espacio_miembros_editar on public.tareas_espacio_miembros;
create policy tareas_espacio_miembros_editar on public.tareas_espacio_miembros for all to authenticated
  using (public.tareas_rol_espacio(espacio_id) = 'admin') with check (public.tareas_rol_espacio(espacio_id) = 'admin');

drop policy if exists tareas_tableros_ver on public.tareas_tableros;
create policy tareas_tableros_ver on public.tareas_tableros for select to authenticated using (public.tareas_rol(id) is not null);
drop policy if exists tareas_tableros_editar on public.tareas_tableros;
create policy tareas_tableros_editar on public.tareas_tableros for update to authenticated
  using (public.tareas_rol(id) = 'admin') with check (public.tareas_rol_espacio(espacio_id) is not null);
drop policy if exists tareas_tableros_borrar on public.tareas_tableros;
create policy tareas_tableros_borrar on public.tareas_tableros for delete to authenticated using (public.tareas_rol(id) = 'admin');

drop policy if exists tareas_tablero_miembros_ver on public.tareas_tablero_miembros;
create policy tareas_tablero_miembros_ver on public.tareas_tablero_miembros for select to authenticated
  using (public.tareas_rol(tablero_id) is not null);
drop policy if exists tareas_tablero_miembros_editar on public.tareas_tablero_miembros;
create policy tareas_tablero_miembros_editar on public.tareas_tablero_miembros for all to authenticated
  using (public.tareas_rol(tablero_id) = 'admin') with check (public.tareas_rol(tablero_id) = 'admin');

drop policy if exists tareas_listas_ver on public.tareas_listas;
create policy tareas_listas_ver on public.tareas_listas for select to authenticated using (public.tareas_rol(tablero_id) is not null);
drop policy if exists tareas_listas_editar on public.tareas_listas;
create policy tareas_listas_editar on public.tareas_listas for all to authenticated
  using (public.tareas_puede_editar(tablero_id)) with check (public.tareas_puede_editar(tablero_id));

drop policy if exists tareas_tarjetas_ver on public.tareas_tarjetas;
create policy tareas_tarjetas_ver on public.tareas_tarjetas for select to authenticated using (public.tareas_rol(tablero_id) is not null);
drop policy if exists tareas_tarjetas_editar on public.tareas_tarjetas;
create policy tareas_tarjetas_editar on public.tareas_tarjetas for all to authenticated
  using (public.tareas_puede_editar(tablero_id)) with check (public.tareas_puede_editar(tablero_id));

drop policy if exists tareas_tarjeta_miembros_ver on public.tareas_tarjeta_miembros;
create policy tareas_tarjeta_miembros_ver on public.tareas_tarjeta_miembros for select to authenticated
  using (exists (select 1 from public.tareas_tarjetas t where t.id = tarjeta_id));
drop policy if exists tareas_tarjeta_miembros_editar on public.tareas_tarjeta_miembros;
create policy tareas_tarjeta_miembros_editar on public.tareas_tarjeta_miembros for all to authenticated
  using (exists (select 1 from public.tareas_tarjetas t where t.id = tarjeta_id and public.tareas_puede_editar(t.tablero_id)))
  with check (exists (select 1 from public.tareas_tarjetas t where t.id = tarjeta_id and public.tareas_puede_editar(t.tablero_id)));

drop policy if exists tareas_favoritos_propios on public.tareas_favoritos;
create policy tareas_favoritos_propios on public.tareas_favoritos for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid() and public.tareas_rol(tablero_id) is not null);
drop policy if exists tareas_recientes_propios on public.tareas_recientes;
create policy tareas_recientes_propios on public.tareas_recientes for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid() and public.tareas_rol(tablero_id) is not null);

grant select, insert, update, delete on
  public.tareas_espacios, public.tareas_espacio_miembros, public.tareas_tableros, public.tareas_tablero_miembros,
  public.tareas_listas, public.tareas_tarjetas, public.tareas_tarjeta_miembros, public.tareas_favoritos, public.tareas_recientes
to authenticated;
-- Espacios y tableros se crean con las funciones de abajo (dejan al creador como administrador).
revoke insert on public.tareas_espacios, public.tareas_tableros from authenticated;

-- ─── Funciones ───────────────────────────────────────────────────────────

create or replace function public.tareas_crear_espacio(p_nombre text, p_descripcion text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.tiene_permiso('tareas', 'editar') then raise exception 'No tenés permiso para crear espacios de trabajo'; end if;
  insert into public.tareas_espacios (nombre, descripcion) values (trim(p_nombre), nullif(trim(p_descripcion), '')) returning id into v_id;
  insert into public.tareas_espacio_miembros (espacio_id, usuario_id, rol) values (v_id, auth.uid(), 'admin');
  return v_id;
end;
$$;

-- Tablero nuevo con las listas iniciales; quien lo crea queda como administrador.
create or replace function public.tareas_crear_tablero(p_espacio uuid, p_nombre text, p_fondo text, p_visibilidad text, p_descripcion text, p_listas text[], p_miembros uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  i int := 0;
  v_lista text;
begin
  if public.tareas_rol_espacio(p_espacio) is null then raise exception 'No sos integrante de ese espacio de trabajo'; end if;
  insert into public.tareas_tableros (espacio_id, nombre, fondo, visibilidad, descripcion)
  values (p_espacio, trim(p_nombre), coalesce(nullif(p_fondo, ''), 'c:azul'), coalesce(nullif(p_visibilidad, ''), 'espacio'), nullif(trim(p_descripcion), ''))
  returning id into v_id;
  insert into public.tareas_tablero_miembros (tablero_id, usuario_id, rol) values (v_id, auth.uid(), 'admin');
  insert into public.tareas_tablero_miembros (tablero_id, usuario_id, rol)
  select v_id, u, 'miembro' from unnest(coalesce(p_miembros, '{}')) u
  where u <> auth.uid() and exists (select 1 from public.perfiles pf where pf.id = u and pf.activo)
  on conflict do nothing;
  foreach v_lista in array coalesce(p_listas, '{}') loop
    i := i + 1;
    insert into public.tareas_listas (tablero_id, nombre, posicion) values (v_id, v_lista, i * 1024);
  end loop;
  return v_id;
end;
$$;

-- Duplica un tablero: listas y tarjetas abiertas (sin completar), sin fechas ni historial.
create or replace function public.tareas_duplicar_tablero(p_tablero uuid, p_nombre text, p_con_tarjetas boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.tareas_tableros;
  v_id uuid;
  v_lista record;
  v_nueva uuid;
begin
  if public.tareas_rol(p_tablero) is null then raise exception 'No tenés acceso a ese tablero'; end if;
  select * into v_t from public.tareas_tableros where id = p_tablero;
  if public.tareas_rol_espacio(v_t.espacio_id) is null then raise exception 'No sos integrante del espacio de trabajo'; end if;
  insert into public.tareas_tableros (espacio_id, nombre, fondo, visibilidad, descripcion)
  values (v_t.espacio_id, trim(p_nombre), v_t.fondo, v_t.visibilidad, v_t.descripcion) returning id into v_id;
  insert into public.tareas_tablero_miembros (tablero_id, usuario_id, rol) values (v_id, auth.uid(), 'admin');
  for v_lista in select * from public.tareas_listas where tablero_id = p_tablero and not archivada order by posicion loop
    insert into public.tareas_listas (tablero_id, nombre, posicion) values (v_id, v_lista.nombre, v_lista.posicion) returning id into v_nueva;
    if p_con_tarjetas then
      insert into public.tareas_tarjetas (lista_id, tablero_id, titulo, descripcion, posicion)
      select v_nueva, v_id, c.titulo, c.descripcion, c.posicion from public.tareas_tarjetas c
      where c.lista_id = v_lista.id and not c.archivada;
    end if;
  end loop;
  return v_id;
end;
$$;

-- Duplica una lista con sus tarjetas abiertas (y responsables), a la derecha de la original.
create or replace function public.tareas_duplicar_lista(p_lista uuid, p_nombre text, p_posicion double precision)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_l public.tareas_listas;
  v_id uuid;
  v_c record;
  v_nueva uuid;
begin
  select * into v_l from public.tareas_listas where id = p_lista;
  if not found or not public.tareas_puede_editar(v_l.tablero_id) then raise exception 'No podés editar ese tablero'; end if;
  insert into public.tareas_listas (tablero_id, nombre, posicion) values (v_l.tablero_id, trim(p_nombre), p_posicion) returning id into v_id;
  for v_c in select * from public.tareas_tarjetas where lista_id = p_lista and not archivada order by posicion loop
    insert into public.tareas_tarjetas (lista_id, tablero_id, titulo, descripcion, posicion, vence)
    values (v_id, v_l.tablero_id, v_c.titulo, v_c.descripcion, v_c.posicion, v_c.vence) returning id into v_nueva;
    insert into public.tareas_tarjeta_miembros (tarjeta_id, usuario_id)
    select v_nueva, m.usuario_id from public.tareas_tarjeta_miembros m where m.tarjeta_id = v_c.id;
  end loop;
  return v_id;
end;
$$;

-- Usuarios de Planix que pueden usar Tareas (para agregarlos a tableros y tarjetas).
create or replace function public.tareas_usuarios()
returns table (id uuid, nombre text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select pf.id, pf.nombre, pf.email from public.perfiles pf
  where public.tiene_permiso('tareas', 'ver')
    and pf.activo
    and (pf.es_admin or exists (select 1 from public.permisos pm where pm.usuario_id = pf.id and pm.seccion = 'tareas' and pm.nivel in ('ver', 'editar')))
  order by pf.nombre;
$$;

revoke execute on function public.tareas_crear_espacio(text, text) from public, anon;
revoke execute on function public.tareas_crear_tablero(uuid, text, text, text, text, text[], uuid[]) from public, anon;
revoke execute on function public.tareas_duplicar_tablero(uuid, text, boolean) from public, anon;
revoke execute on function public.tareas_duplicar_lista(uuid, text, double precision) from public, anon;
revoke execute on function public.tareas_usuarios() from public, anon;
grant execute on function public.tareas_crear_espacio(text, text) to authenticated;
grant execute on function public.tareas_crear_tablero(uuid, text, text, text, text, text[], uuid[]) to authenticated;
grant execute on function public.tareas_duplicar_tablero(uuid, text, boolean) to authenticated;
grant execute on function public.tareas_duplicar_lista(uuid, text, double precision) to authenticated;
grant execute on function public.tareas_usuarios() to authenticated;

-- Fondos de tableros con imagen (los sube el servidor después de verificar permisos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tareas', 'tareas', false, 26214400, null)
on conflict (id) do nothing;

-- Espacio inicial (los administradores de Planix agregan a los integrantes).
insert into public.tareas_espacios (nombre, descripcion)
select 'RUTA', 'Tableros del equipo de Ruta'
where not exists (select 1 from public.tareas_espacios);
