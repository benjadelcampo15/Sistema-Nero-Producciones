-- Tareas (orden 3): automatizaciones (reglas y botones), tareas recurrentes,
-- plantillas, importación desde Trello, búsquedas guardadas y tiempo real.

alter table public.tareas_tarjetas add column if not exists es_plantilla boolean not null default false;
alter table public.tareas_tableros add column if not exists es_plantilla boolean not null default false;

-- ─── Automatizaciones ───────────────────────────────────────────────────

-- Regla: CUANDO (disparador) → ENTONCES (acciones). Ver lib/tareas/automatizaciones.ts.
create table if not exists public.tareas_reglas (
  id                uuid primary key default gen_random_uuid(),
  tablero_id        uuid not null references public.tareas_tableros (id) on delete cascade,
  nombre            text not null check (length(trim(nombre)) between 1 and 200),
  activa            boolean not null default true,
  disparador        jsonb not null,
  acciones          jsonb not null default '[]',
  creado_por        uuid references public.perfiles (id) default auth.uid(),
  creado_en         timestamptz not null default now(),
  ejecuciones       integer not null default 0,
  ultima_ejecucion  timestamptz,
  ultimo_error      text
);
create index if not exists tareas_reglas_tablero_idx on public.tareas_reglas (tablero_id) where activa;

create table if not exists public.tareas_reglas_log (
  id          bigint generated always as identity primary key,
  regla_id    uuid references public.tareas_reglas (id) on delete cascade,
  boton_id    uuid,
  tablero_id  uuid not null references public.tareas_tableros (id) on delete cascade,
  tarjeta_id  uuid references public.tareas_tarjetas (id) on delete set null,
  ok          boolean not null,
  detalle     text,
  -- Para reglas por fecha: una sola ejecución por tarjeta y vencimiento.
  clave       text,
  creado_en   timestamptz not null default now()
);
create unique index if not exists tareas_reglas_log_clave_idx on public.tareas_reglas_log (regla_id, clave) where clave is not null;
create index if not exists tareas_reglas_log_tablero_idx on public.tareas_reglas_log (tablero_id, creado_en desc);

-- Botones de tarjeta (sobre la tarjeta abierta) y de tablero.
create table if not exists public.tareas_botones (
  id          uuid primary key default gen_random_uuid(),
  tablero_id  uuid not null references public.tareas_tableros (id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) between 1 and 80),
  ambito      text not null check (ambito in ('tarjeta', 'tablero')),
  acciones    jsonb not null default '[]',
  creado_por  uuid references public.perfiles (id) default auth.uid(),
  creado_en   timestamptz not null default now()
);

-- Tareas recurrentes: una tarjeta nueva en cada fecha que corresponde.
create table if not exists public.tareas_recurrentes (
  id           uuid primary key default gen_random_uuid(),
  tablero_id   uuid not null references public.tareas_tableros (id) on delete cascade,
  lista_id     uuid not null references public.tareas_listas (id) on delete cascade,
  titulo       text not null check (length(trim(titulo)) between 1 and 500),
  descripcion  text,
  miembros     uuid[] not null default '{}',
  etiquetas    uuid[] not null default '{}',
  -- [{"nombre": "...", "items": ["...", "..."]}]
  checklists   jsonb not null default '[]',
  frecuencia   text not null check (frecuencia in ('diaria', 'semanal', 'mensual', 'fechas')),
  -- semanal: días de la semana (0 = domingo); mensual: día del mes.
  dias         integer[] not null default '{}',
  fechas       date[] not null default '{}',
  -- Hora de vencimiento de cada tarjeta (sin hora: sin vencimiento).
  hora         time,
  activa       boolean not null default true,
  proxima      date,
  creado_por   uuid references public.perfiles (id) default auth.uid(),
  creado_en    timestamptz not null default now()
);

create table if not exists public.tareas_recurrentes_log (
  recurrente_id  uuid not null references public.tareas_recurrentes (id) on delete cascade,
  fecha          date not null,
  tarjeta_id     uuid references public.tareas_tarjetas (id) on delete set null,
  creado_en      timestamptz not null default now(),
  primary key (recurrente_id, fecha)
);

-- Importaciones desde Trello (el archivo original queda guardado).
create table if not exists public.tareas_importaciones (
  id          uuid primary key default gen_random_uuid(),
  trello_id   text,
  nombre      text not null,
  archivo     text,
  tablero_id  uuid references public.tareas_tableros (id) on delete set null,
  resumen     jsonb not null default '{}',
  usuario_id  uuid references public.perfiles (id) default auth.uid(),
  creado_en   timestamptz not null default now()
);
create index if not exists tareas_importaciones_trello_idx on public.tareas_importaciones (trello_id);

-- Búsquedas guardadas de cada usuario.
create table if not exists public.tareas_busquedas (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.perfiles (id) on delete cascade default auth.uid(),
  nombre      text not null check (length(trim(nombre)) between 1 and 80),
  filtros     jsonb not null default '{}',
  creado_en   timestamptz not null default now()
);

alter table public.tareas_reglas enable row level security;
alter table public.tareas_reglas_log enable row level security;
alter table public.tareas_botones enable row level security;
alter table public.tareas_recurrentes enable row level security;
alter table public.tareas_recurrentes_log enable row level security;
alter table public.tareas_importaciones enable row level security;
alter table public.tareas_busquedas enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tareas_reglas', 'tareas_botones', 'tareas_recurrentes'] loop
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format('create policy %1$s_ver on public.%1$s for select to authenticated using (public.tareas_rol(tablero_id) is not null)', t);
    execute format('drop policy if exists %1$s_editar on public.%1$s', t);
    execute format('create policy %1$s_editar on public.%1$s for all to authenticated using (public.tareas_puede_editar(tablero_id)) with check (public.tareas_puede_editar(tablero_id))', t);
  end loop;
end $$;
drop policy if exists tareas_reglas_log_ver on public.tareas_reglas_log;
create policy tareas_reglas_log_ver on public.tareas_reglas_log for select to authenticated using (public.tareas_rol(tablero_id) is not null);
drop policy if exists tareas_recurrentes_log_ver on public.tareas_recurrentes_log;
create policy tareas_recurrentes_log_ver on public.tareas_recurrentes_log for select to authenticated
  using (exists (select 1 from public.tareas_recurrentes r where r.id = recurrente_id));
drop policy if exists tareas_importaciones_ver on public.tareas_importaciones;
create policy tareas_importaciones_ver on public.tareas_importaciones for select to authenticated
  using (usuario_id = auth.uid() or public.es_admin() or (tablero_id is not null and public.tareas_rol(tablero_id) is not null));
drop policy if exists tareas_busquedas_propias on public.tareas_busquedas;
create policy tareas_busquedas_propias on public.tareas_busquedas for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

grant select, insert, update, delete on public.tareas_reglas, public.tareas_botones, public.tareas_recurrentes, public.tareas_busquedas to authenticated;
grant select on public.tareas_reglas_log, public.tareas_recurrentes_log, public.tareas_importaciones to authenticated;

-- ─── Quién hizo el cambio: una persona o una automatización ─────────────

-- Durante automatizaciones, procesos programados e importaciones, el historial
-- dice "Automatización" (usuario vacío) y los avisos les llegan a todos.
create or replace function public.tareas_automatico()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('tareas.automatico', true), '') = '1'
$$;

create or replace function public.tareas_registrar(p_tablero uuid, p_tarjeta uuid, p_tipo text, p_detalle jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('tareas.importando', true), '') = '1' then return; end if;
  insert into public.tareas_actividad (tablero_id, tarjeta_id, usuario_id, tipo, detalle)
  values (p_tablero, p_tarjeta, case when public.tareas_automatico() then null else auth.uid() end, p_tipo, coalesce(p_detalle, '{}'));
end;
$$;
revoke execute on function public.tareas_registrar(uuid, uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.tareas_notificar(p_usuario uuid, p_tipo text, p_clave text, p_titulo text, p_detalle text, p_href text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('tareas.importando', true), '') = '1' then return; end if;
  if p_usuario is null or (p_usuario is not distinct from auth.uid() and not public.tareas_automatico()) then return; end if;
  if not public.quiere_aviso(p_usuario, p_tipo) then return; end if;
  if not exists (select 1 from public.perfiles where id = p_usuario and activo) then return; end if;
  insert into public.notificaciones (usuario_id, tipo, clave, titulo, detalle, href, correo_pendiente)
  values (p_usuario, p_tipo, p_clave, p_titulo, p_detalle, p_href,
          p_tipo in ('asignacion', 'mencion', 'vencimiento', 'comentario', 'automatizacion') and public.quiere_aviso(p_usuario, p_tipo, true))
  on conflict (usuario_id, clave) where clave is not null do update
    set titulo = excluded.titulo, detalle = excluded.detalle, href = excluded.href, leida = false, creado_en = now();
end;
$$;
revoke execute on function public.tareas_notificar(uuid, text, text, text, text, text) from public, anon, authenticated;

-- ─── Motor de acciones ──────────────────────────────────────────────────

-- Aplica una lista de acciones a una tarjeta. Las listas, etiquetas y personas
-- tienen que ser del mismo tablero (si no, la acción se salta y se informa).
create or replace function public.tareas_aplicar_acciones(p_tarjeta uuid, p_acciones jsonb, p_origen text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.tareas_tarjetas;
  a jsonb;
  v_salteadas text[] := '{}';
  v_previo text := coalesce(current_setting('tareas.automatico', true), '');
  v_pos double precision;
  v_lista uuid;
  v_u uuid;
begin
  perform set_config('tareas.automatico', '1', true);
  for a in select * from jsonb_array_elements(coalesce(p_acciones, '[]')) loop
    select * into v_t from public.tareas_tarjetas where id = p_tarjeta;
    if not found then exit; end if;
    case a ->> 'tipo'
      when 'completar' then
        update public.tareas_tarjetas set completada = true where id = p_tarjeta and not completada;
      when 'descompletar' then
        update public.tareas_tarjetas set completada = false where id = p_tarjeta and completada;
      when 'archivar' then
        update public.tareas_tarjetas set archivada = true where id = p_tarjeta and not archivada;
      when 'mover' then
        v_lista := nullif(a ->> 'lista_id', '')::uuid;
        if not exists (select 1 from public.tareas_listas where id = v_lista and tablero_id = v_t.tablero_id) then
          v_salteadas := v_salteadas || 'mover (la lista ya no existe)'::text;
        elsif v_lista is distinct from v_t.lista_id then
          if coalesce((a ->> 'arriba')::boolean, false) then
            select coalesce(min(posicion), 2048) / 2 into v_pos from public.tareas_tarjetas where lista_id = v_lista and not archivada;
          else
            select coalesce(max(posicion), 0) + 1024 into v_pos from public.tareas_tarjetas where lista_id = v_lista and not archivada;
          end if;
          update public.tareas_tarjetas set lista_id = v_lista, posicion = v_pos where id = p_tarjeta;
        end if;
      when 'agregar_miembro' then
        v_u := nullif(a ->> 'usuario_id', '')::uuid;
        if public.tareas_rol_de_usuario(v_t.tablero_id, v_u) is null then
          v_salteadas := v_salteadas || 'asignar (la persona no tiene acceso al tablero)'::text;
        else
          insert into public.tareas_tarjeta_miembros (tarjeta_id, usuario_id) values (p_tarjeta, v_u) on conflict do nothing;
        end if;
      when 'quitar_miembro' then
        delete from public.tareas_tarjeta_miembros where tarjeta_id = p_tarjeta and usuario_id = nullif(a ->> 'usuario_id', '')::uuid;
      when 'agregar_etiqueta' then
        if exists (select 1 from public.tareas_etiquetas where id = nullif(a ->> 'etiqueta_id', '')::uuid and tablero_id = v_t.tablero_id) then
          insert into public.tareas_tarjeta_etiquetas (tarjeta_id, etiqueta_id) values (p_tarjeta, (a ->> 'etiqueta_id')::uuid) on conflict do nothing;
        else
          v_salteadas := v_salteadas || 'etiqueta (ya no existe)'::text;
        end if;
      when 'quitar_etiqueta' then
        delete from public.tareas_tarjeta_etiquetas where tarjeta_id = p_tarjeta and etiqueta_id = nullif(a ->> 'etiqueta_id', '')::uuid;
      when 'vencimiento' then
        update public.tareas_tarjetas
        set vence = ((now() at time zone 'America/Argentina/Buenos_Aires')::date + coalesce((a ->> 'dias')::int, 0) + coalesce((a ->> 'hora')::time, '18:00'::time)) at time zone 'America/Argentina/Buenos_Aires'
        where id = p_tarjeta;
      when 'quitar_vencimiento' then
        update public.tareas_tarjetas set vence = null where id = p_tarjeta;
      when 'notificar' then
        -- A una persona, o a los miembros de la tarjeta ("miembros").
        for v_u in
          select m.usuario_id from public.tareas_tarjeta_miembros m where m.tarjeta_id = p_tarjeta and a ->> 'usuario_id' = 'miembros'
          union
          select (case when a ->> 'usuario_id' ~ '^[0-9a-f-]{36}$' then a ->> 'usuario_id' end)::uuid
        loop
          if v_u is not null and public.tareas_rol_de_usuario(v_t.tablero_id, v_u) is not null then
            perform public.tareas_notificar(v_u, 'automatizacion', 'auto:' || p_tarjeta || ':' || md5(coalesce(a ->> 'mensaje', '') || p_origen) || ':' || floor(extract(epoch from now()) / 60)::bigint,
              coalesce(nullif(trim(a ->> 'mensaje'), ''), 'Automatización') || ': "' || v_t.titulo || '"', p_origen, public.tareas_href(p_tarjeta));
          end if;
        end loop;
      else
        v_salteadas := v_salteadas || ('acción desconocida ' || coalesce(a ->> 'tipo', ''))::text;
    end case;
  end loop;
  perform set_config('tareas.automatico', v_previo, true);
  return nullif(array_to_string(v_salteadas, '; '), '');
end;
$$;
revoke execute on function public.tareas_aplicar_acciones(uuid, jsonb, text) from public, anon, authenticated;

-- Ejecuta las reglas de un evento. Contra ciclos: hasta 3 niveles de reglas que
-- disparan reglas, y cada regla una sola vez por tarjeta en la misma operación.
create or replace function public.tareas_disparar(p_tarjeta uuid, p_evento text, p_dato uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tablero uuid;
  v_nivel int := coalesce(nullif(current_setting('tareas.nivel', true), ''), '0')::int;
  v_hechas text := coalesce(current_setting('tareas.hechas', true), '');
  r public.tareas_reglas;
  v_clave text;
  v_aviso text;
begin
  if coalesce(current_setting('tareas.importando', true), '') = '1' or v_nivel >= 3 then return; end if;
  select tablero_id into v_tablero from public.tareas_tarjetas where id = p_tarjeta;
  if v_tablero is null then return; end if;
  for r in
    select * from public.tareas_reglas
    where tablero_id = v_tablero and activa and disparador ->> 'tipo' = p_evento
      and (nullif(disparador ->> 'dato', '') is null or (disparador ->> 'dato')::uuid is not distinct from p_dato)
    order by creado_en
  loop
    v_clave := r.id || ':' || p_tarjeta;
    continue when position(v_clave in v_hechas) > 0;
    v_hechas := v_hechas || ',' || v_clave;
    perform set_config('tareas.hechas', v_hechas, true);
    perform set_config('tareas.nivel', (v_nivel + 1)::text, true);
    begin
      v_aviso := public.tareas_aplicar_acciones(p_tarjeta, r.acciones, 'Regla "' || r.nombre || '"');
      insert into public.tareas_reglas_log (regla_id, tablero_id, tarjeta_id, ok, detalle) values (r.id, v_tablero, p_tarjeta, v_aviso is null, coalesce(v_aviso, 'OK'));
      update public.tareas_reglas set ejecuciones = ejecuciones + 1, ultima_ejecucion = now(), ultimo_error = v_aviso where id = r.id;
    exception when others then
      insert into public.tareas_reglas_log (regla_id, tablero_id, tarjeta_id, ok, detalle) values (r.id, v_tablero, p_tarjeta, false, sqlerrm);
      update public.tareas_reglas set ultima_ejecucion = now(), ultimo_error = sqlerrm where id = r.id;
    end;
    perform set_config('tareas.nivel', v_nivel::text, true);
  end loop;
end;
$$;
revoke execute on function public.tareas_disparar(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.tareas_reglas_tarjeta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.tareas_disparar(new.id, 'creada_en', new.lista_id);
  else
    if new.lista_id is distinct from old.lista_id then perform public.tareas_disparar(new.id, 'movida_a', new.lista_id); end if;
    if new.completada and not old.completada then perform public.tareas_disparar(new.id, 'completada', null); end if;
  end if;
  return null;
end;
$$;
drop trigger if exists tareas_tarjetas_reglas on public.tareas_tarjetas;
create trigger tareas_tarjetas_reglas after insert or update of lista_id, completada on public.tareas_tarjetas
  for each row execute function public.tareas_reglas_tarjeta();

create or replace function public.tareas_reglas_etiqueta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tareas_disparar(new.tarjeta_id, 'etiqueta_agregada', new.etiqueta_id);
  return null;
end;
$$;
drop trigger if exists tareas_tarjeta_etiquetas_reglas on public.tareas_tarjeta_etiquetas;
create trigger tareas_tarjeta_etiquetas_reglas after insert on public.tareas_tarjeta_etiquetas
  for each row execute function public.tareas_reglas_etiqueta();

create or replace function public.tareas_reglas_miembro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tareas_disparar(new.tarjeta_id, 'miembro_agregado', new.usuario_id);
  return null;
end;
$$;
drop trigger if exists tareas_tarjeta_miembros_reglas on public.tareas_tarjeta_miembros;
create trigger tareas_tarjeta_miembros_reglas after insert on public.tareas_tarjeta_miembros
  for each row execute function public.tareas_reglas_miembro();

create or replace function public.tareas_reglas_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_tarjeta uuid;
begin
  if not new.hecho or old.hecho then return null; end if;
  if exists (select 1 from public.tareas_checklist_items where checklist_id = new.checklist_id and not hecho) then return null; end if;
  select tarjeta_id into v_tarjeta from public.tareas_checklists where id = new.checklist_id;
  perform public.tareas_disparar(v_tarjeta, 'checklist_completa', null);
  return null;
end;
$$;
drop trigger if exists tareas_checklist_items_reglas on public.tareas_checklist_items;
create trigger tareas_checklist_items_reglas after update of hecho on public.tareas_checklist_items
  for each row execute function public.tareas_reglas_item();

-- Ejecuta un botón (de tarjeta o de tablero) si el usuario puede editar el tablero.
create or replace function public.tareas_ejecutar_boton(p_boton uuid, p_tarjeta uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.tareas_botones;
  a jsonb;
  v_aviso text;
  v_id uuid;
  v_pos double precision;
  v_n int := 0;
  v_previo text := coalesce(current_setting('tareas.automatico', true), '');
begin
  select * into b from public.tareas_botones where id = p_boton;
  if not found or not public.tareas_puede_editar(b.tablero_id) then raise exception 'No podés usar este botón'; end if;
  if b.ambito = 'tarjeta' then
    if p_tarjeta is null or public.tareas_tablero_de(p_tarjeta) is distinct from b.tablero_id then raise exception 'Elegí una tarjeta de este tablero'; end if;
    v_aviso := public.tareas_aplicar_acciones(p_tarjeta, b.acciones, 'Botón "' || b.nombre || '"');
  else
    perform set_config('tareas.automatico', '1', true);
    for a in select * from jsonb_array_elements(b.acciones) loop
      case a ->> 'tipo'
        when 'crear_tarjeta' then
          if exists (select 1 from public.tareas_listas where id = (a ->> 'lista_id')::uuid and tablero_id = b.tablero_id and not archivada) then
            select coalesce(max(posicion), 0) + 1024 into v_pos from public.tareas_tarjetas where lista_id = (a ->> 'lista_id')::uuid;
            insert into public.tareas_tarjetas (lista_id, tablero_id, titulo, posicion) values ((a ->> 'lista_id')::uuid, b.tablero_id, coalesce(nullif(trim(a ->> 'titulo'), ''), 'Tarea'), v_pos) returning id into v_id;
            insert into public.tareas_tarjeta_miembros (tarjeta_id, usuario_id)
            select v_id, u::uuid from jsonb_array_elements_text(coalesce(a -> 'miembros', '[]')) u
            where public.tareas_rol_de_usuario(b.tablero_id, u::uuid) is not null on conflict do nothing;
            v_n := v_n + 1;
          end if;
        when 'mover_lista' then
          update public.tareas_tarjetas set lista_id = (a ->> 'hacia')::uuid
          where lista_id = (a ->> 'desde')::uuid and tablero_id = b.tablero_id and not archivada
            and exists (select 1 from public.tareas_listas where id = (a ->> 'hacia')::uuid and tablero_id = b.tablero_id);
          get diagnostics v_n = row_count;
        when 'archivar_completadas' then
          update public.tareas_tarjetas set archivada = true
          where tablero_id = b.tablero_id and completada and not archivada and (nullif(a ->> 'lista_id', '') is null or lista_id = (a ->> 'lista_id')::uuid);
          get diagnostics v_n = row_count;
        else null;
      end case;
    end loop;
    perform set_config('tareas.automatico', v_previo, true);
  end if;
  insert into public.tareas_reglas_log (boton_id, tablero_id, tarjeta_id, ok, detalle)
  values (b.id, b.tablero_id, p_tarjeta, v_aviso is null, 'Botón "' || b.nombre || '"' || coalesce(': ' || v_aviso, case when b.ambito = 'tablero' then ' (' || v_n || ' tarjetas)' else '' end));
  return v_aviso;
end;
$$;
revoke execute on function public.tareas_ejecutar_boton(uuid, uuid) from public, anon;
grant execute on function public.tareas_ejecutar_boton(uuid, uuid) to authenticated;

-- ─── Recurrentes ────────────────────────────────────────────────────────

-- La siguiente fecha (posterior a p_desde) que corresponde según la frecuencia.
create or replace function public.tareas_siguiente_fecha(p_frecuencia text, p_dias integer[], p_fechas date[], p_desde date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  d date;
  i int;
  v_dia int;
begin
  case p_frecuencia
    when 'diaria' then return p_desde + 1;
    when 'semanal' then
      if coalesce(array_length(p_dias, 1), 0) = 0 then return p_desde + 7; end if;
      for i in 1..7 loop
        d := p_desde + i;
        if extract(dow from d)::int = any (p_dias) then return d; end if;
      end loop;
    when 'mensual' then
      v_dia := coalesce(p_dias[1], 1);
      d := (date_trunc('month', p_desde) + make_interval(days => v_dia - 1))::date;
      if extract(month from d) <> extract(month from p_desde) then d := (date_trunc('month', p_desde) + interval '1 month - 1 day')::date; end if;
      if d > p_desde then return d; end if;
      d := (date_trunc('month', p_desde) + interval '1 month' + make_interval(days => v_dia - 1))::date;
      if extract(month from d) <> extract(month from (date_trunc('month', p_desde) + interval '1 month')) then
        d := (date_trunc('month', p_desde) + interval '2 month - 1 day')::date;
      end if;
      return d;
    when 'fechas' then
      return (select min(f) from unnest(p_fechas) f where f > p_desde);
  end case;
  return null;
end;
$$;

-- Crea las tarjetas recurrentes que tocan hoy (o la última que se pasó). Nunca duplica.
create or replace function public.tareas_generar_recurrentes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.tareas_recurrentes;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_fecha date;
  v_id uuid;
  v_pos double precision;
  v_c jsonb;
  v_ch uuid;
  v_n int := 0;
  v_previo text := coalesce(current_setting('tareas.automatico', true), '');
begin
  perform set_config('tareas.automatico', '1', true);
  for r in select * from public.tareas_recurrentes where activa and proxima is not null and proxima <= v_hoy for update skip locked loop
    -- Si quedaron fechas atrasadas, solo se crea la más reciente (no se llena el tablero de atrasadas).
    v_fecha := r.proxima;
    while public.tareas_siguiente_fecha(r.frecuencia, r.dias, r.fechas, v_fecha) <= v_hoy loop
      v_fecha := public.tareas_siguiente_fecha(r.frecuencia, r.dias, r.fechas, v_fecha);
    end loop;
    insert into public.tareas_recurrentes_log (recurrente_id, fecha) values (r.id, v_fecha) on conflict do nothing;
    if found and exists (select 1 from public.tareas_listas where id = r.lista_id and not archivada) then
      select coalesce(max(posicion), 0) + 1024 into v_pos from public.tareas_tarjetas where lista_id = r.lista_id;
      insert into public.tareas_tarjetas (lista_id, tablero_id, titulo, descripcion, posicion, vence)
      values (r.lista_id, r.tablero_id, r.titulo, r.descripcion, v_pos,
              case when r.hora is null then null else (v_fecha + r.hora) at time zone 'America/Argentina/Buenos_Aires' end)
      returning id into v_id;
      insert into public.tareas_tarjeta_miembros (tarjeta_id, usuario_id)
      select v_id, u from unnest(r.miembros) u where public.tareas_rol_de_usuario(r.tablero_id, u) is not null on conflict do nothing;
      insert into public.tareas_tarjeta_etiquetas (tarjeta_id, etiqueta_id)
      select v_id, e from unnest(r.etiquetas) e where exists (select 1 from public.tareas_etiquetas x where x.id = e and x.tablero_id = r.tablero_id) on conflict do nothing;
      for v_c in select * from jsonb_array_elements(r.checklists) loop
        insert into public.tareas_checklists (tarjeta_id, nombre, posicion) values (v_id, coalesce(nullif(trim(v_c ->> 'nombre'), ''), 'Checklist'), 1024) returning id into v_ch;
        insert into public.tareas_checklist_items (checklist_id, texto, posicion)
        select v_ch, it, ord * 1024 from jsonb_array_elements_text(coalesce(v_c -> 'items', '[]')) with ordinality as x(it, ord) where trim(it) <> '';
      end loop;
      update public.tareas_recurrentes_log set tarjeta_id = v_id where recurrente_id = r.id and fecha = v_fecha;
      v_n := v_n + 1;
    end if;
    update public.tareas_recurrentes
    set proxima = public.tareas_siguiente_fecha(r.frecuencia, r.dias, r.fechas, v_fecha),
        activa = public.tareas_siguiente_fecha(r.frecuencia, r.dias, r.fechas, v_fecha) is not null
    where id = r.id;
  end loop;
  perform set_config('tareas.automatico', v_previo, true);
  return v_n;
end;
$$;
revoke execute on function public.tareas_generar_recurrentes() from public, anon, authenticated;

-- Reglas por fecha ("cuando falten N días", "cuando venza"): una vez por tarjeta y vencimiento.
create or replace function public.tareas_reglas_fechas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.tareas_reglas;
  t record;
  v_n int := 0;
  v_aviso text;
begin
  for r in select * from public.tareas_reglas where activa and disparador ->> 'tipo' in ('vence_en', 'vencida') loop
    for t in
      select c.id, c.vence from public.tareas_tarjetas c
      join public.tareas_listas l on l.id = c.lista_id
      where c.tablero_id = r.tablero_id and c.vence is not null and not c.completada and not c.archivada and not l.archivada
        and c.vence > now() - interval '7 days'
        and case when r.disparador ->> 'tipo' = 'vencida' then c.vence <= now()
                 else c.vence > now() and c.vence - make_interval(days => coalesce((r.disparador ->> 'dias')::int, 1)) <= now() end
    loop
      insert into public.tareas_reglas_log (regla_id, tablero_id, tarjeta_id, ok, detalle, clave)
      values (r.id, r.tablero_id, t.id, true, 'Por fecha', r.disparador ->> 'tipo' || ':' || t.id || ':' || extract(epoch from t.vence)::bigint)
      on conflict (regla_id, clave) where clave is not null do nothing;
      if found then
        begin
          v_aviso := public.tareas_aplicar_acciones(t.id, r.acciones, 'Regla "' || r.nombre || '"');
          update public.tareas_reglas set ejecuciones = ejecuciones + 1, ultima_ejecucion = now(), ultimo_error = v_aviso where id = r.id;
          v_n := v_n + 1;
        exception when others then
          update public.tareas_reglas set ultima_ejecucion = now(), ultimo_error = sqlerrm where id = r.id;
          insert into public.tareas_reglas_log (regla_id, tablero_id, tarjeta_id, ok, detalle) values (r.id, r.tablero_id, t.id, false, sqlerrm);
        end;
      end if;
    end loop;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.tareas_reglas_fechas() from public, anon, authenticated;

-- Todo lo programado de Tareas (vencimientos, reglas por fecha y recurrentes).
-- Idempotente: se llama al abrir tableros, la campana y desde el cron diario.
create or replace function public.tareas_procesar_programadas()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec int;
  v_reglas int;
  v_avisos int;
begin
  perform set_config('tareas.automatico', '1', true);
  v_rec := public.tareas_generar_recurrentes();
  v_reglas := public.tareas_reglas_fechas();
  v_avisos := public.tareas_generar_vencimientos();
  return jsonb_build_object('recurrentes', v_rec, 'reglas', v_reglas, 'avisos', v_avisos);
end;
$$;
revoke execute on function public.tareas_procesar_programadas() from public, anon;
grant execute on function public.tareas_procesar_programadas() to authenticated, service_role;

-- ─── Copias y plantillas ────────────────────────────────────────────────

drop function if exists public.tareas_copiar_tarjeta(uuid, uuid, uuid, double precision, text, boolean, boolean, boolean);
create or replace function public.tareas_copiar_tarjeta(
  p_tarjeta uuid, p_nuevo uuid, p_lista uuid, p_posicion double precision, p_titulo text,
  p_checklists boolean default true, p_etiquetas boolean default true, p_miembros boolean default true, p_fechas boolean default true)
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
  values (p_nuevo, p_lista, p_lista, coalesce(nullif(trim(p_titulo), ''), v_t.titulo), v_t.descripcion, p_posicion,
          case when p_fechas then v_t.vence end, case when p_fechas then v_t.inicio end, case when p_fechas then v_t.recordatorio end,
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
      insert into public.tareas_checklist_items (checklist_id, texto, posicion, responsable_id, vence)
      select v_nueva_c, texto, posicion, responsable_id, case when p_fechas then vence end from public.tareas_checklist_items where checklist_id = v_c.id;
    end loop;
  end if;
  return p_nuevo;
end;
$$;
revoke execute on function public.tareas_copiar_tarjeta(uuid, uuid, uuid, double precision, text, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.tareas_copiar_tarjeta(uuid, uuid, uuid, double precision, text, boolean, boolean, boolean, boolean) to authenticated;

-- Copia la estructura de un tablero en otro: listas, etiquetas y tarjetas abiertas
-- con sus checklists (sin marcar). Nunca copia fechas, completadas, responsables,
-- comentarios ni adjuntos: el tablero nuevo arranca de cero.
create or replace function public.tareas_copiar_estructura(p_origen uuid, p_destino uuid, p_con_tarjetas boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lista record;
  v_nueva uuid;
  v_c record;
  v_nc uuid;
  v_ch record;
  v_nch uuid;
  v_mapa jsonb := '{}';
  v_e record;
  v_ne uuid;
begin
  delete from public.tareas_etiquetas where tablero_id = p_destino;
  for v_e in select * from public.tareas_etiquetas where tablero_id = p_origen order by posicion loop
    insert into public.tareas_etiquetas (tablero_id, nombre, color, posicion) values (p_destino, v_e.nombre, v_e.color, v_e.posicion) returning id into v_ne;
    v_mapa := v_mapa || jsonb_build_object(v_e.id::text, v_ne);
  end loop;
  for v_lista in select * from public.tareas_listas where tablero_id = p_origen and not archivada order by posicion loop
    insert into public.tareas_listas (tablero_id, nombre, posicion) values (p_destino, v_lista.nombre, v_lista.posicion) returning id into v_nueva;
    continue when not p_con_tarjetas;
    for v_c in select * from public.tareas_tarjetas where lista_id = v_lista.id and not archivada order by posicion loop
      insert into public.tareas_tarjetas (lista_id, tablero_id, titulo, descripcion, posicion, es_plantilla, portada)
      values (v_nueva, p_destino, v_c.titulo, v_c.descripcion, v_c.posicion, v_c.es_plantilla, case when v_c.portada like 'c:%' then v_c.portada end)
      returning id into v_nc;
      insert into public.tareas_tarjeta_etiquetas (tarjeta_id, etiqueta_id)
      select v_nc, (v_mapa ->> te.etiqueta_id::text)::uuid from public.tareas_tarjeta_etiquetas te
      where te.tarjeta_id = v_c.id and v_mapa ? te.etiqueta_id::text;
      for v_ch in select * from public.tareas_checklists where tarjeta_id = v_c.id order by posicion loop
        insert into public.tareas_checklists (tarjeta_id, nombre, posicion) values (v_nc, v_ch.nombre, v_ch.posicion) returning id into v_nch;
        insert into public.tareas_checklist_items (checklist_id, texto, posicion) select v_nch, texto, posicion from public.tareas_checklist_items where checklist_id = v_ch.id;
      end loop;
    end loop;
  end loop;
end;
$$;
revoke execute on function public.tareas_copiar_estructura(uuid, uuid, boolean) from public, anon, authenticated;

-- Tablero nuevo a partir de otro (plantilla o copia). Quien lo crea queda como administrador.
create or replace function public.tareas_tablero_desde(p_origen uuid, p_espacio uuid, p_nombre text, p_con_tarjetas boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.tareas_tableros;
  v_id uuid;
begin
  if public.tareas_rol(p_origen) is null then raise exception 'No tenés acceso a ese tablero'; end if;
  select * into v_o from public.tareas_tableros where id = p_origen;
  if public.tareas_rol_espacio(coalesce(p_espacio, v_o.espacio_id)) is null then raise exception 'No sos integrante de ese espacio de trabajo'; end if;
  perform set_config('tareas.importando', '1', true);
  insert into public.tareas_tableros (espacio_id, nombre, fondo, visibilidad, descripcion)
  values (coalesce(p_espacio, v_o.espacio_id), trim(p_nombre), v_o.fondo, v_o.visibilidad, v_o.descripcion) returning id into v_id;
  insert into public.tareas_tablero_miembros (tablero_id, usuario_id, rol) values (v_id, auth.uid(), 'admin');
  perform public.tareas_copiar_estructura(p_origen, v_id, p_con_tarjetas);
  perform set_config('tareas.importando', '', true);
  perform public.tareas_registrar(v_id, null, 'tablero_creado', jsonb_build_object('desde', v_o.nombre));
  return v_id;
end;
$$;
revoke execute on function public.tareas_tablero_desde(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.tareas_tablero_desde(uuid, uuid, text, boolean) to authenticated;

-- ─── Importación desde Trello ───────────────────────────────────────────

-- Recibe el tablero ya leído y normalizado en el navegador (ver lib/tareas/trello.ts)
-- y lo crea entero en una sola operación: si algo falla, no queda nada a medias.
create or replace function public.tareas_importar_trello(p_espacio uuid, p jsonb, p_archivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_l jsonb;
  v_c jsonb;
  v_ch jsonb;
  v_m jsonb;
  v_lista uuid;
  v_tarjeta uuid;
  v_check uuid;
  v_listas jsonb := '{}';
  v_etiquetas jsonb := '{}';
  v_e jsonb;
  v_ne uuid;
  v_i int;
  v_pos int := 0;
begin
  if public.tareas_rol_espacio(p_espacio) is null then raise exception 'No sos integrante de ese espacio de trabajo'; end if;
  perform set_config('tareas.importando', '1', true);
  insert into public.tareas_tableros (espacio_id, nombre, descripcion, fondo, visibilidad)
  values (p_espacio, left(trim(p ->> 'nombre'), 120), nullif(p ->> 'descripcion', ''), coalesce(nullif(p ->> 'fondo', ''), 'c:azul'), 'espacio')
  returning id into v_id;
  insert into public.tareas_tablero_miembros (tablero_id, usuario_id, rol) values (v_id, auth.uid(), 'admin');
  insert into public.tareas_tablero_miembros (tablero_id, usuario_id, rol)
  select distinct v_id, u::uuid, 'miembro' from jsonb_array_elements_text(coalesce(p -> 'miembros', '[]')) u
  where u::uuid <> auth.uid() and exists (select 1 from public.perfiles where id = u::uuid and activo)
  on conflict do nothing;
  delete from public.tareas_etiquetas where tablero_id = v_id;
  for v_e in select * from jsonb_array_elements(coalesce(p -> 'etiquetas', '[]')) loop
    v_pos := v_pos + 1;
    insert into public.tareas_etiquetas (tablero_id, nombre, color, posicion) values (v_id, left(coalesce(v_e ->> 'nombre', ''), 60), coalesce(v_e ->> 'color', 'gris'), v_pos) returning id into v_ne;
    v_etiquetas := v_etiquetas || jsonb_build_object(v_e ->> 'id', v_ne);
  end loop;
  v_i := 0;
  for v_l in select * from jsonb_array_elements(coalesce(p -> 'listas', '[]')) loop
    v_i := v_i + 1;
    insert into public.tareas_listas (tablero_id, nombre, posicion, archivada)
    values (v_id, left(coalesce(nullif(trim(v_l ->> 'nombre'), ''), 'Lista'), 120), v_i * 1024, coalesce((v_l ->> 'archivada')::boolean, false))
    returning id into v_lista;
    v_listas := v_listas || jsonb_build_object(v_l ->> 'id', v_lista);
  end loop;
  v_i := 0;
  for v_c in select * from jsonb_array_elements(coalesce(p -> 'tarjetas', '[]')) loop
    v_i := v_i + 1;
    continue when not v_listas ? (v_c ->> 'lista');
    insert into public.tareas_tarjetas (lista_id, tablero_id, titulo, descripcion, posicion, vence, inicio, completada, archivada, creado_en)
    values ((v_listas ->> (v_c ->> 'lista'))::uuid, v_id, left(coalesce(nullif(trim(v_c ->> 'titulo'), ''), 'Tarjeta'), 500), nullif(v_c ->> 'descripcion', ''),
            coalesce((v_c ->> 'posicion')::double precision, v_i * 1024), nullif(v_c ->> 'vence', '')::timestamptz, nullif(v_c ->> 'inicio', '')::date,
            coalesce((v_c ->> 'completada')::boolean, false), coalesce((v_c ->> 'archivada')::boolean, false), coalesce(nullif(v_c ->> 'creada', '')::timestamptz, now()))
    returning id into v_tarjeta;
    insert into public.tareas_tarjeta_miembros (tarjeta_id, usuario_id)
    select v_tarjeta, u::uuid from jsonb_array_elements_text(coalesce(v_c -> 'miembros', '[]')) u
    where exists (select 1 from public.perfiles where id = u::uuid and activo) on conflict do nothing;
    insert into public.tareas_tarjeta_etiquetas (tarjeta_id, etiqueta_id)
    select v_tarjeta, (v_etiquetas ->> e)::uuid from jsonb_array_elements_text(coalesce(v_c -> 'etiquetas', '[]')) e where v_etiquetas ? e on conflict do nothing;
    for v_ch in select * from jsonb_array_elements(coalesce(v_c -> 'checklists', '[]')) loop
      insert into public.tareas_checklists (tarjeta_id, nombre, posicion) values (v_tarjeta, left(coalesce(nullif(trim(v_ch ->> 'nombre'), ''), 'Checklist'), 200), coalesce((v_ch ->> 'posicion')::double precision, 1024)) returning id into v_check;
      insert into public.tareas_checklist_items (checklist_id, texto, hecho, posicion)
      select v_check, left(coalesce(nullif(trim(it ->> 'texto'), ''), '—'), 1000), coalesce((it ->> 'hecho')::boolean, false), coalesce((it ->> 'posicion')::double precision, ord * 1024)
      from jsonb_array_elements(coalesce(v_ch -> 'items', '[]')) with ordinality as x(it, ord);
    end loop;
    for v_m in select * from jsonb_array_elements(coalesce(v_c -> 'comentarios', '[]')) loop
      insert into public.tareas_comentarios (tarjeta_id, autor_id, texto, creado_en)
      values (v_tarjeta, case when exists (select 1 from public.perfiles where id = nullif(v_m ->> 'autor', '')::uuid) then (v_m ->> 'autor')::uuid else auth.uid() end,
              left(coalesce(nullif(v_m ->> 'texto', ''), '—'), 10000), coalesce(nullif(v_m ->> 'fecha', '')::timestamptz, now()));
    end loop;
    insert into public.tareas_adjuntos (tarjeta_id, nombre, url, subido_por)
    select v_tarjeta, left(coalesce(nullif(trim(a ->> 'nombre'), ''), a ->> 'url'), 300), a ->> 'url', auth.uid()
    from jsonb_array_elements(coalesce(v_c -> 'adjuntos', '[]')) a where (a ->> 'url') ~ '^https?://';
  end loop;
  insert into public.tareas_importaciones (trello_id, nombre, archivo, tablero_id, resumen)
  values (nullif(p ->> 'trello_id', ''), p ->> 'nombre', p_archivo, v_id, coalesce(p -> 'resumen', '{}'));
  perform set_config('tareas.importando', '', true);
  perform public.tareas_registrar(v_id, null, 'tablero_importado', jsonb_build_object('origen', 'Trello', 'nombre', p ->> 'nombre'));
  return v_id;
end;
$$;
revoke execute on function public.tareas_importar_trello(uuid, jsonb, text) from public, anon;
grant execute on function public.tareas_importar_trello(uuid, jsonb, text) to authenticated;

-- ─── Tiempo real ────────────────────────────────────────────────────────
-- Los cambios de tarjetas y listas se avisan a quienes tienen el tablero abierto
-- (respetando los permisos de cada uno).
alter table public.tareas_tarjetas replica identity full;
alter table public.tareas_listas replica identity full;
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['tareas_tarjetas', 'tareas_listas', 'tareas_comentarios'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
