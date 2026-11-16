-- Tareas (orden 2): tarjetas completas y trabajo en equipo.
-- Etiquetas, fechas de inicio y recordatorios, checklists, adjuntos, portadas,
-- comentarios con menciones, seguidores, historial de actividad y notificaciones.

alter table public.tareas_tarjetas add column if not exists inicio date;
-- Minutos antes del vencimiento para avisar (null = sin recordatorio).
alter table public.tareas_tarjetas add column if not exists recordatorio integer check (recordatorio is null or recordatorio between 0 and 20160);
-- 'c:<color>' o 'a:<id del adjunto>' (imagen).
alter table public.tareas_tarjetas add column if not exists portada text;

create table if not exists public.tareas_etiquetas (
  id          uuid primary key default gen_random_uuid(),
  tablero_id  uuid not null references public.tareas_tableros (id) on delete cascade,
  nombre      text not null default '' check (length(nombre) <= 60),
  color       text not null,
  posicion    integer not null default 0
);
create index if not exists tareas_etiquetas_tablero_idx on public.tareas_etiquetas (tablero_id);

create table if not exists public.tareas_tarjeta_etiquetas (
  tarjeta_id   uuid not null references public.tareas_tarjetas (id) on delete cascade,
  etiqueta_id  uuid not null references public.tareas_etiquetas (id) on delete cascade,
  primary key (tarjeta_id, etiqueta_id)
);

create table if not exists public.tareas_checklists (
  id          uuid primary key default gen_random_uuid(),
  tarjeta_id  uuid not null references public.tareas_tarjetas (id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) between 1 and 200),
  posicion    double precision not null default 0
);
create index if not exists tareas_checklists_tarjeta_idx on public.tareas_checklists (tarjeta_id);

create table if not exists public.tareas_checklist_items (
  id              uuid primary key default gen_random_uuid(),
  checklist_id    uuid not null references public.tareas_checklists (id) on delete cascade,
  texto           text not null check (length(trim(texto)) between 1 and 1000),
  hecho           boolean not null default false,
  posicion        double precision not null default 0,
  responsable_id  uuid references public.perfiles (id) on delete set null,
  vence           date
);
create index if not exists tareas_checklist_items_idx on public.tareas_checklist_items (checklist_id);

create table if not exists public.tareas_adjuntos (
  id          uuid primary key default gen_random_uuid(),
  tarjeta_id  uuid not null references public.tareas_tarjetas (id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) between 1 and 300),
  -- Archivo (en storage) o enlace web.
  ruta        text,
  url         text,
  mime        text,
  tamano      bigint,
  subido_por  uuid references public.perfiles (id) default auth.uid(),
  creado_en   timestamptz not null default now(),
  check ((ruta is not null) <> (url is not null))
);
create index if not exists tareas_adjuntos_tarjeta_idx on public.tareas_adjuntos (tarjeta_id);

create table if not exists public.tareas_comentarios (
  id           uuid primary key default gen_random_uuid(),
  tarjeta_id   uuid not null references public.tareas_tarjetas (id) on delete cascade,
  autor_id     uuid not null references public.perfiles (id) default auth.uid(),
  texto        text not null check (length(trim(texto)) between 1 and 10000),
  respuesta_a  uuid references public.tareas_comentarios (id) on delete set null,
  mencionados  uuid[] not null default '{}',
  creado_en    timestamptz not null default now(),
  editado_en   timestamptz
);
create index if not exists tareas_comentarios_tarjeta_idx on public.tareas_comentarios (tarjeta_id, creado_en);

create table if not exists public.tareas_seguidores (
  tarjeta_id  uuid not null references public.tareas_tarjetas (id) on delete cascade,
  usuario_id  uuid not null references public.perfiles (id) on delete cascade default auth.uid(),
  primary key (tarjeta_id, usuario_id)
);

-- Historial de actividad (solo lectura para los usuarios: lo escriben los triggers).
create table if not exists public.tareas_actividad (
  id          bigint generated always as identity primary key,
  tablero_id  uuid not null references public.tareas_tableros (id) on delete cascade,
  tarjeta_id  uuid references public.tareas_tarjetas (id) on delete cascade,
  usuario_id  uuid references public.perfiles (id) on delete set null,
  tipo        text not null,
  detalle     jsonb not null default '{}',
  creado_en   timestamptz not null default now()
);
create index if not exists tareas_actividad_tarjeta_idx on public.tareas_actividad (tarjeta_id, creado_en desc);
create index if not exists tareas_actividad_tablero_idx on public.tareas_actividad (tablero_id, creado_en desc);

-- Preferencias de notificación (por usuario; sin fila = todo activado).
create table if not exists public.preferencias_notificaciones (
  usuario_id    uuid primary key references public.perfiles (id) on delete cascade default auth.uid(),
  asignaciones  boolean not null default true,
  menciones     boolean not null default true,
  comentarios   boolean not null default true,
  cambios       boolean not null default true,
  vencimientos  boolean not null default true,
  correo        boolean not null default true
);

-- Notificaciones: tipo, clave para no duplicar y estado del correo.
alter table public.notificaciones add column if not exists tipo text;
alter table public.notificaciones add column if not exists clave text;
alter table public.notificaciones add column if not exists correo_pendiente boolean not null default false;
alter table public.notificaciones add column if not exists correo_enviado_en timestamptz;
create unique index if not exists notificaciones_clave_idx on public.notificaciones (usuario_id, clave) where clave is not null;
create index if not exists notificaciones_correo_idx on public.notificaciones (correo_pendiente) where correo_pendiente;

-- ─── Permisos (RLS) ─────────────────────────────────────────────────────
alter table public.tareas_etiquetas enable row level security;
alter table public.tareas_tarjeta_etiquetas enable row level security;
alter table public.tareas_checklists enable row level security;
alter table public.tareas_checklist_items enable row level security;
alter table public.tareas_adjuntos enable row level security;
alter table public.tareas_comentarios enable row level security;
alter table public.tareas_seguidores enable row level security;
alter table public.tareas_actividad enable row level security;
alter table public.preferencias_notificaciones enable row level security;

-- El tablero de una tarjeta (para las políticas).
create or replace function public.tareas_tablero_de(p_tarjeta uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tablero_id from public.tareas_tarjetas where id = p_tarjeta
$$;
revoke execute on function public.tareas_tablero_de(uuid) from public, anon;
grant execute on function public.tareas_tablero_de(uuid) to authenticated;

drop policy if exists tareas_etiquetas_ver on public.tareas_etiquetas;
create policy tareas_etiquetas_ver on public.tareas_etiquetas for select to authenticated using (public.tareas_rol(tablero_id) is not null);
drop policy if exists tareas_etiquetas_editar on public.tareas_etiquetas;
create policy tareas_etiquetas_editar on public.tareas_etiquetas for all to authenticated
  using (public.tareas_puede_editar(tablero_id)) with check (public.tareas_puede_editar(tablero_id));

do $$
declare t text;
begin
  foreach t in array array['tareas_tarjeta_etiquetas', 'tareas_checklists', 'tareas_adjuntos', 'tareas_seguidores'] loop
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format('create policy %1$s_ver on public.%1$s for select to authenticated using (public.tareas_rol(public.tareas_tablero_de(tarjeta_id)) is not null)', t);
  end loop;
end $$;

drop policy if exists tareas_tarjeta_etiquetas_editar on public.tareas_tarjeta_etiquetas;
create policy tareas_tarjeta_etiquetas_editar on public.tareas_tarjeta_etiquetas for all to authenticated
  using (public.tareas_puede_editar(public.tareas_tablero_de(tarjeta_id)))
  with check (public.tareas_puede_editar(public.tareas_tablero_de(tarjeta_id))
    and exists (select 1 from public.tareas_etiquetas e where e.id = etiqueta_id and e.tablero_id = public.tareas_tablero_de(tarjeta_id)));

drop policy if exists tareas_checklists_editar on public.tareas_checklists;
create policy tareas_checklists_editar on public.tareas_checklists for all to authenticated
  using (public.tareas_puede_editar(public.tareas_tablero_de(tarjeta_id))) with check (public.tareas_puede_editar(public.tareas_tablero_de(tarjeta_id)));

create or replace function public.tareas_tarjeta_de_checklist(p_checklist uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tarjeta_id from public.tareas_checklists where id = p_checklist
$$;
revoke execute on function public.tareas_tarjeta_de_checklist(uuid) from public, anon;
grant execute on function public.tareas_tarjeta_de_checklist(uuid) to authenticated;

drop policy if exists tareas_checklist_items_ver on public.tareas_checklist_items;
create policy tareas_checklist_items_ver on public.tareas_checklist_items for select to authenticated
  using (public.tareas_rol(public.tareas_tablero_de(public.tareas_tarjeta_de_checklist(checklist_id))) is not null);
drop policy if exists tareas_checklist_items_editar on public.tareas_checklist_items;
create policy tareas_checklist_items_editar on public.tareas_checklist_items for all to authenticated
  using (public.tareas_puede_editar(public.tareas_tablero_de(public.tareas_tarjeta_de_checklist(checklist_id))))
  with check (public.tareas_puede_editar(public.tareas_tablero_de(public.tareas_tarjeta_de_checklist(checklist_id))));

-- Adjuntos: los agregan los que editan; los borra quien lo subió o un administrador del tablero.
drop policy if exists tareas_adjuntos_agregar on public.tareas_adjuntos;
create policy tareas_adjuntos_agregar on public.tareas_adjuntos for insert to authenticated
  with check (public.tareas_puede_editar(public.tareas_tablero_de(tarjeta_id)) and subido_por = auth.uid());
drop policy if exists tareas_adjuntos_borrar on public.tareas_adjuntos;
create policy tareas_adjuntos_borrar on public.tareas_adjuntos for delete to authenticated
  using (public.tareas_puede_editar(public.tareas_tablero_de(tarjeta_id))
    and (subido_por = auth.uid() or public.tareas_rol(public.tareas_tablero_de(tarjeta_id)) = 'admin'));
drop policy if exists tareas_adjuntos_editar on public.tareas_adjuntos;
create policy tareas_adjuntos_editar on public.tareas_adjuntos for update to authenticated
  using (public.tareas_puede_editar(public.tareas_tablero_de(tarjeta_id))) with check (public.tareas_puede_editar(public.tareas_tablero_de(tarjeta_id)));

-- Comentarios: los ven los del tablero; comentan los que editan; cada uno edita los suyos (el admin puede borrar).
drop policy if exists tareas_comentarios_ver on public.tareas_comentarios;
create policy tareas_comentarios_ver on public.tareas_comentarios for select to authenticated
  using (public.tareas_rol(public.tareas_tablero_de(tarjeta_id)) is not null);
drop policy if exists tareas_comentarios_agregar on public.tareas_comentarios;
create policy tareas_comentarios_agregar on public.tareas_comentarios for insert to authenticated
  with check (autor_id = auth.uid() and public.tareas_puede_editar(public.tareas_tablero_de(tarjeta_id)));
drop policy if exists tareas_comentarios_editar on public.tareas_comentarios;
create policy tareas_comentarios_editar on public.tareas_comentarios for update to authenticated
  using (autor_id = auth.uid()) with check (autor_id = auth.uid());
drop policy if exists tareas_comentarios_borrar on public.tareas_comentarios;
create policy tareas_comentarios_borrar on public.tareas_comentarios for delete to authenticated
  using (autor_id = auth.uid() or public.tareas_rol(public.tareas_tablero_de(tarjeta_id)) = 'admin');

-- Seguir: cualquiera que vea la tarjeta (también observadores), solo para sí mismo.
drop policy if exists tareas_seguidores_propios on public.tareas_seguidores;
create policy tareas_seguidores_propios on public.tareas_seguidores for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid() and public.tareas_rol(public.tareas_tablero_de(tarjeta_id)) is not null);

drop policy if exists tareas_actividad_ver on public.tareas_actividad;
create policy tareas_actividad_ver on public.tareas_actividad for select to authenticated using (public.tareas_rol(tablero_id) is not null);

drop policy if exists preferencias_notificaciones_propias on public.preferencias_notificaciones;
create policy preferencias_notificaciones_propias on public.preferencias_notificaciones for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

grant select, insert, update, delete on
  public.tareas_etiquetas, public.tareas_tarjeta_etiquetas, public.tareas_checklists, public.tareas_checklist_items,
  public.tareas_adjuntos, public.tareas_comentarios, public.tareas_seguidores, public.preferencias_notificaciones
to authenticated;
grant select on public.tareas_actividad to authenticated;
revoke insert, update, delete on public.tareas_actividad from authenticated;

-- ─── Notificaciones ─────────────────────────────────────────────────────

-- ¿El usuario quiere este tipo de aviso? (sin preferencias guardadas: sí).
create or replace function public.quiere_aviso(p_usuario uuid, p_tipo text, p_correo boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select (case p_tipo
              when 'asignacion' then p.asignaciones
              when 'mencion' then p.menciones
              when 'comentario' then p.comentarios
              when 'cambio' then p.cambios
              when 'vencimiento' then p.vencimientos
              else true end)
           and (not p_correo or p.correo)
    from public.preferencias_notificaciones p where p.usuario_id = p_usuario
  ), true)
$$;
revoke execute on function public.quiere_aviso(uuid, text, boolean) from public, anon, authenticated;

-- Crea (o refresca, si ya existe con la misma clave) una notificación de Tareas.
create or replace function public.tareas_notificar(p_usuario uuid, p_tipo text, p_clave text, p_titulo text, p_detalle text, p_href text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_usuario is null or p_usuario is not distinct from auth.uid() then return; end if;
  if not public.quiere_aviso(p_usuario, p_tipo) then return; end if;
  if not exists (select 1 from public.perfiles where id = p_usuario and activo) then return; end if;
  insert into public.notificaciones (usuario_id, tipo, clave, titulo, detalle, href, correo_pendiente)
  values (p_usuario, p_tipo, p_clave, p_titulo, p_detalle, p_href,
          p_tipo in ('asignacion', 'mencion', 'vencimiento', 'comentario') and public.quiere_aviso(p_usuario, p_tipo, true))
  on conflict (usuario_id, clave) where clave is not null do update
    set titulo = excluded.titulo, detalle = excluded.detalle, href = excluded.href, leida = false, creado_en = now();
end;
$$;
revoke execute on function public.tareas_notificar(uuid, text, text, text, text, text) from public, anon, authenticated;

-- A quiénes les interesa una tarjeta: sus responsables y sus seguidores.
create or replace function public.tareas_interesados(p_tarjeta uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select usuario_id from public.tareas_tarjeta_miembros where tarjeta_id = p_tarjeta
  union
  select usuario_id from public.tareas_seguidores where tarjeta_id = p_tarjeta
$$;
revoke execute on function public.tareas_interesados(uuid) from public, anon, authenticated;

create or replace function public.tareas_href(p_tarjeta uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select '/tareas/' || tablero_id || '?tarjeta=' || id from public.tareas_tarjetas where id = p_tarjeta
$$;
revoke execute on function public.tareas_href(uuid) from public, anon, authenticated;

create or replace function public.nombre_usuario(p uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select nombre from public.perfiles where id = p), 'Alguien')
$$;
revoke execute on function public.nombre_usuario(uuid) from public, anon;
grant execute on function public.nombre_usuario(uuid) to authenticated;

-- ─── Historial (triggers) ───────────────────────────────────────────────

create or replace function public.tareas_registrar(p_tablero uuid, p_tarjeta uuid, p_tipo text, p_detalle jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.tareas_actividad (tablero_id, tarjeta_id, usuario_id, tipo, detalle) values (p_tablero, p_tarjeta, auth.uid(), p_tipo, coalesce(p_detalle, '{}'));
$$;
revoke execute on function public.tareas_registrar(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- Avisa un cambio a los interesados (agrupado: un aviso por tarjeta cada 10 minutos).
create or replace function public.tareas_avisar_cambio(p_tarjeta uuid, p_titulo text, p_detalle text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_u uuid;
begin
  for v_u in select * from public.tareas_interesados(p_tarjeta) loop
    perform public.tareas_notificar(v_u, 'cambio', 'cambio:' || p_tarjeta || ':' || floor(extract(epoch from now()) / 600)::bigint,
      p_titulo, p_detalle, public.tareas_href(p_tarjeta));
  end loop;
end;
$$;
revoke execute on function public.tareas_avisar_cambio(uuid, text, text) from public, anon, authenticated;

create or replace function public.tareas_actividad_tarjeta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quien text := public.nombre_usuario(auth.uid());
begin
  if tg_op = 'INSERT' then
    perform public.tareas_registrar(new.tablero_id, new.id, 'creada', jsonb_build_object('lista', (select nombre from public.tareas_listas where id = new.lista_id)));
    -- Quien crea la tarjeta la sigue.
    if auth.uid() is not null then
      insert into public.tareas_seguidores (tarjeta_id, usuario_id) values (new.id, auth.uid()) on conflict do nothing;
    end if;
    return new;
  end if;
  if new.lista_id is distinct from old.lista_id then
    perform public.tareas_registrar(new.tablero_id, new.id, 'movida', jsonb_build_object(
      'de', (select nombre from public.tareas_listas where id = old.lista_id),
      'a', (select nombre from public.tareas_listas where id = new.lista_id)));
    perform public.tareas_avisar_cambio(new.id, v_quien || ' movió "' || new.titulo || '"', 'a ' || (select nombre from public.tareas_listas where id = new.lista_id));
  end if;
  if new.vence is distinct from old.vence or new.inicio is distinct from old.inicio then
    perform public.tareas_registrar(new.tablero_id, new.id, 'fechas', jsonb_build_object('vence', new.vence, 'antes', old.vence, 'inicio', new.inicio));
    perform public.tareas_avisar_cambio(new.id, v_quien || ' cambió las fechas de "' || new.titulo || '"',
      case when new.vence is null then 'Sin vencimiento' else 'Vence ' || to_char(new.vence at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') end);
  end if;
  if new.completada is distinct from old.completada then
    perform public.tareas_registrar(new.tablero_id, new.id, case when new.completada then 'completada' else 'pendiente' end, '{}');
    perform public.tareas_avisar_cambio(new.id, v_quien || case when new.completada then ' completó "' else ' marcó como pendiente "' end || new.titulo || '"', null);
  end if;
  if new.archivada is distinct from old.archivada then
    perform public.tareas_registrar(new.tablero_id, new.id, case when new.archivada then 'archivada' else 'restaurada' end, '{}');
    perform public.tareas_avisar_cambio(new.id, v_quien || case when new.archivada then ' archivó "' else ' restauró "' end || new.titulo || '"', null);
  end if;
  if new.titulo is distinct from old.titulo then
    perform public.tareas_registrar(new.tablero_id, new.id, 'titulo', jsonb_build_object('antes', old.titulo, 'ahora', new.titulo));
  end if;
  if new.descripcion is distinct from old.descripcion then
    perform public.tareas_registrar(new.tablero_id, new.id, 'descripcion', '{}');
  end if;
  return new;
end;
$$;
drop trigger if exists tareas_tarjetas_actividad on public.tareas_tarjetas;
create trigger tareas_tarjetas_actividad after insert or update on public.tareas_tarjetas
  for each row execute function public.tareas_actividad_tarjeta();

create or replace function public.tareas_actividad_miembro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila record := case when tg_op = 'INSERT' then new else old end;
  v_t public.tareas_tarjetas;
begin
  select * into v_t from public.tareas_tarjetas where id = v_fila.tarjeta_id;
  if not found then return null; end if;
  perform public.tareas_registrar(v_t.tablero_id, v_t.id, case when tg_op = 'INSERT' then 'miembro_agregado' else 'miembro_quitado' end,
    jsonb_build_object('usuario', public.nombre_usuario(v_fila.usuario_id)));
  if tg_op = 'INSERT' then
    perform public.tareas_notificar(v_fila.usuario_id, 'asignacion', 'asignacion:' || v_t.id,
      public.nombre_usuario(auth.uid()) || ' te asignó una tarjeta', v_t.titulo, public.tareas_href(v_t.id));
  end if;
  return null;
end;
$$;
drop trigger if exists tareas_tarjeta_miembros_actividad on public.tareas_tarjeta_miembros;
create trigger tareas_tarjeta_miembros_actividad after insert or delete on public.tareas_tarjeta_miembros
  for each row execute function public.tareas_actividad_miembro();

create or replace function public.tareas_actividad_etiqueta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila record := case when tg_op = 'INSERT' then new else old end;
  v_tablero uuid := public.tareas_tablero_de(v_fila.tarjeta_id);
  v_e public.tareas_etiquetas;
begin
  if v_tablero is null then return null; end if;
  select * into v_e from public.tareas_etiquetas where id = v_fila.etiqueta_id;
  perform public.tareas_registrar(v_tablero, v_fila.tarjeta_id, case when tg_op = 'INSERT' then 'etiqueta_agregada' else 'etiqueta_quitada' end,
    jsonb_build_object('nombre', coalesce(nullif(v_e.nombre, ''), v_e.color), 'color', v_e.color));
  return null;
end;
$$;
drop trigger if exists tareas_tarjeta_etiquetas_actividad on public.tareas_tarjeta_etiquetas;
create trigger tareas_tarjeta_etiquetas_actividad after insert or delete on public.tareas_tarjeta_etiquetas
  for each row execute function public.tareas_actividad_etiqueta();

create or replace function public.tareas_actividad_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.tareas_checklists;
  v_tablero uuid;
  v_total int;
  v_hechos int;
begin
  if new.hecho is not distinct from old.hecho then return null; end if;
  select * into v_c from public.tareas_checklists where id = new.checklist_id;
  v_tablero := public.tareas_tablero_de(v_c.tarjeta_id);
  if v_tablero is null then return null; end if;
  perform public.tareas_registrar(v_tablero, v_c.tarjeta_id, case when new.hecho then 'item_hecho' else 'item_pendiente' end,
    jsonb_build_object('texto', new.texto, 'checklist', v_c.nombre));
  select count(*), count(*) filter (where hecho) into v_total, v_hechos from public.tareas_checklist_items where checklist_id = new.checklist_id;
  if new.hecho and v_total = v_hechos then
    perform public.tareas_registrar(v_tablero, v_c.tarjeta_id, 'checklist_completa', jsonb_build_object('checklist', v_c.nombre));
  end if;
  return null;
end;
$$;
drop trigger if exists tareas_checklist_items_actividad on public.tareas_checklist_items;
create trigger tareas_checklist_items_actividad after update on public.tareas_checklist_items
  for each row execute function public.tareas_actividad_item();

create or replace function public.tareas_actividad_adjunto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_tablero uuid := public.tareas_tablero_de(new.tarjeta_id);
begin
  perform public.tareas_registrar(v_tablero, new.tarjeta_id, 'adjunto', jsonb_build_object('nombre', new.nombre));
  return null;
end;
$$;
drop trigger if exists tareas_adjuntos_actividad on public.tareas_adjuntos;
create trigger tareas_adjuntos_actividad after insert on public.tareas_adjuntos
  for each row execute function public.tareas_actividad_adjunto();

-- Comentario: historial, aviso a los mencionados y a los interesados (sin duplicar).
create or replace function public.tareas_actividad_comentario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.tareas_tarjetas;
  v_u uuid;
  v_quien text := public.nombre_usuario(new.autor_id);
  v_texto text := left(new.texto, 200);
begin
  select * into v_t from public.tareas_tarjetas where id = new.tarjeta_id;
  perform public.tareas_registrar(v_t.tablero_id, v_t.id, 'comentario', jsonb_build_object('texto', v_texto));
  -- Quien comenta pasa a seguir la tarjeta.
  insert into public.tareas_seguidores (tarjeta_id, usuario_id) values (v_t.id, new.autor_id) on conflict do nothing;
  for v_u in select distinct m from unnest(new.mencionados) m loop
    if public.tareas_rol_de_usuario(v_t.tablero_id, v_u) is not null then
      perform public.tareas_notificar(v_u, 'mencion', 'mencion:' || new.id, v_quien || ' te mencionó en "' || v_t.titulo || '"', v_texto, public.tareas_href(v_t.id));
    end if;
  end loop;
  for v_u in select * from public.tareas_interesados(v_t.id) loop
    if not (v_u = any (new.mencionados)) then
      perform public.tareas_notificar(v_u, 'comentario', 'comentario:' || new.id, v_quien || ' comentó en "' || v_t.titulo || '"', v_texto, public.tareas_href(v_t.id));
    end if;
  end loop;
  return null;
end;
$$;

-- Rol de un usuario cualquiera en un tablero (para validar menciones).
create or replace function public.tareas_rol_de_usuario(p_tablero uuid, p_usuario uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.perfiles pf where pf.id = p_usuario and pf.activo
                     and (pf.es_admin or exists (select 1 from public.permisos pm where pm.usuario_id = pf.id and pm.seccion = 'tareas' and pm.nivel in ('ver', 'editar'))))
      then null
    when exists (select 1 from public.perfiles pf where pf.id = p_usuario and pf.es_admin) then 'admin'
    else coalesce(
      (select m.rol from public.tareas_tablero_miembros m where m.tablero_id = p_tablero and m.usuario_id = p_usuario),
      (select case em.rol when 'admin' then 'admin' else 'miembro' end
         from public.tareas_tableros t
         join public.tareas_espacio_miembros em on em.espacio_id = t.espacio_id and em.usuario_id = p_usuario
         where t.id = p_tablero and t.visibilidad = 'espacio'))
  end
$$;
revoke execute on function public.tareas_rol_de_usuario(uuid, uuid) from public, anon, authenticated;

drop trigger if exists tareas_comentarios_actividad on public.tareas_comentarios;
create trigger tareas_comentarios_actividad after insert on public.tareas_comentarios
  for each row execute function public.tareas_actividad_comentario();

-- Avisos de vencimiento: "vence pronto" (según el recordatorio, o 24 h) y "vencida".
-- Idempotente: cada aviso tiene su clave, nunca se repite para el mismo vencimiento.
create or replace function public.tareas_generar_vencimientos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_u uuid;
  v_n integer := 0;
begin
  for v in
    select t.id, t.titulo, t.vence, coalesce(t.recordatorio, 1440) as minutos
    from public.tareas_tarjetas t
    join public.tareas_listas l on l.id = t.lista_id
    join public.tareas_tableros b on b.id = t.tablero_id
    where t.vence is not null and not t.completada and not t.archivada and not l.archivada and not b.archivado
      and t.vence > now() - interval '7 days'
      and now() >= t.vence - make_interval(mins => coalesce(t.recordatorio, 1440))
  loop
    for v_u in select * from public.tareas_interesados(v.id) loop
      if v.vence <= now() then
        perform public.tareas_notificar(v_u, 'vencimiento', 'vencida:' || v.id || ':' || extract(epoch from v.vence)::bigint,
          'Tarea vencida: "' || v.titulo || '"', 'Venció el ' || to_char(v.vence at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'), public.tareas_href(v.id));
      else
        perform public.tareas_notificar(v_u, 'vencimiento', 'vence:' || v.id || ':' || extract(epoch from v.vence)::bigint,
          'Vence pronto: "' || v.titulo || '"', 'Vence el ' || to_char(v.vence at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'), public.tareas_href(v.id));
      end if;
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.tareas_generar_vencimientos() from public, anon;
grant execute on function public.tareas_generar_vencimientos() to authenticated;

-- ─── Copiar una tarjeta (con lo que se elija) ───────────────────────────
create or replace function public.tareas_copiar_tarjeta(
  p_tarjeta uuid, p_nuevo uuid, p_lista uuid, p_posicion double precision, p_titulo text,
  p_checklists boolean default true, p_etiquetas boolean default true, p_miembros boolean default true)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_t public.tareas_tarjetas;
  v_c record;
  v_nueva_c uuid;
begin
  select * into v_t from public.tareas_tarjetas where id = p_tarjeta;
  if not found then raise exception 'La tarjeta ya no existe'; end if;
  insert into public.tareas_tarjetas (id, lista_id, tablero_id, titulo, descripcion, posicion, vence, inicio, recordatorio, portada)
  values (p_nuevo, p_lista, p_lista, coalesce(nullif(trim(p_titulo), ''), v_t.titulo), v_t.descripcion, p_posicion, v_t.vence, v_t.inicio, v_t.recordatorio,
          case when v_t.portada like 'c:%' then v_t.portada end);
  if p_miembros then
    insert into public.tareas_tarjeta_miembros (tarjeta_id, usuario_id) select p_nuevo, usuario_id from public.tareas_tarjeta_miembros where tarjeta_id = p_tarjeta;
  end if;
  if p_etiquetas then
    insert into public.tareas_tarjeta_etiquetas (tarjeta_id, etiqueta_id)
    select p_nuevo, te.etiqueta_id from public.tareas_tarjeta_etiquetas te
    join public.tareas_etiquetas e on e.id = te.etiqueta_id
    where te.tarjeta_id = p_tarjeta and e.tablero_id = (select tablero_id from public.tareas_listas where id = p_lista);
  end if;
  if p_checklists then
    for v_c in select * from public.tareas_checklists where tarjeta_id = p_tarjeta order by posicion loop
      insert into public.tareas_checklists (tarjeta_id, nombre, posicion) values (p_nuevo, v_c.nombre, v_c.posicion) returning id into v_nueva_c;
      -- Los ítems se copian sin marcar: es una tarea nueva.
      insert into public.tareas_checklist_items (checklist_id, texto, posicion, responsable_id, vence)
      select v_nueva_c, texto, posicion, responsable_id, vence from public.tareas_checklist_items where checklist_id = v_c.id;
    end loop;
  end if;
  return p_nuevo;
end;
$$;
revoke execute on function public.tareas_copiar_tarjeta(uuid, uuid, uuid, double precision, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.tareas_copiar_tarjeta(uuid, uuid, uuid, double precision, text, boolean, boolean, boolean) to authenticated;

-- Etiquetas por defecto de los tableros (las de siempre de Trello, sin nombre).
create or replace function public.tareas_etiquetas_iniciales()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tareas_etiquetas (tablero_id, color, posicion)
  select new.id, c, i from unnest(array['verde', 'amarillo', 'naranja', 'rojo', 'violeta', 'azul']) with ordinality as x(c, i);
  return null;
end;
$$;
drop trigger if exists tareas_tableros_etiquetas on public.tareas_tableros;
create trigger tareas_tableros_etiquetas after insert on public.tareas_tableros
  for each row execute function public.tareas_etiquetas_iniciales();
insert into public.tareas_etiquetas (tablero_id, color, posicion)
select t.id, c, i from public.tareas_tableros t, unnest(array['verde', 'amarillo', 'naranja', 'rojo', 'violeta', 'azul']) with ordinality as x(c, i)
where not exists (select 1 from public.tareas_etiquetas e where e.tablero_id = t.id);
