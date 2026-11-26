-- PROPUESTAS DE PAGO: planificar qué pagos se pueden hacer con el dinero
-- disponible. Es una herramienta de planificación: no crea movimientos en
-- Financiero, no toca cuentas corrientes, saldos bancarios ni el estado de las
-- Solicitudes de pagos (de ahí solo se copian los datos).
-- Permisos: Financiero 'ver' para consultar; 'editar' para armar, aprobar y finalizar.

create table if not exists public.propuestas_pago (
  id              uuid primary key default gen_random_uuid(),
  numero          bigint generated always as identity unique,
  empresa         text not null check (empresa in ('nero', 'ruta')),
  nombre          text not null check (length(trim(nombre)) > 0),
  fecha           date not null default current_date,
  disponible      numeric(15, 2) not null default 0 check (disponible >= 0),
  observaciones   text,
  estado          text not null default 'borrador' check (estado in ('borrador', 'aprobada', 'finalizada')),
  -- Evita crear dos veces la misma propuesta si el formulario se envía repetido.
  clave_envio     uuid unique,
  creado_por      uuid references public.perfiles (id) default auth.uid(),
  creado_en       timestamptz not null default now(),
  actualizado_por uuid references public.perfiles (id) default auth.uid(),
  -- También es la versión: si otro guardó en el medio, no se pisa en silencio.
  actualizado_en  timestamptz not null default clock_timestamp(),
  eliminado_en    timestamptz
);
create index if not exists propuestas_pago_lista_idx on public.propuestas_pago (empresa, fecha desc) where eliminado_en is null;

create table if not exists public.propuestas_pago_items (
  id              uuid primary key default gen_random_uuid(),
  propuesta_id    uuid not null references public.propuestas_pago (id) on delete cascade,
  orden           integer not null default 0,
  proveedor       text not null check (length(trim(proveedor)) > 0),
  detalle         text,
  evento_id       uuid references public.eventos (id) on delete set null,
  -- Deuda total de referencia (opcional) e importe que se incluye en esta propuesta (puede ser parcial).
  adeudado        numeric(15, 2) check (adeudado is null or adeudado >= 0),
  importe         numeric(15, 2) not null check (importe >= 0),
  alias_cbu       text,
  prioridad       text not null default 'normal' check (prioridad in ('normal', 'urgente', 'muy_urgente')),
  observaciones   text,
  -- Si vino de Solicitudes de pagos: la solicitud (no se modifica) y quién la pidió.
  solicitud_id    uuid references public.solicitudes_pago (id) on delete set null,
  solicitante     text,
  constraint propuestas_pago_items_solicitud_unica unique (propuesta_id, solicitud_id)
);
create index if not exists propuestas_pago_items_propuesta_idx on public.propuestas_pago_items (propuesta_id, orden);

create table if not exists public.propuestas_pago_historial (
  id            uuid primary key default gen_random_uuid(),
  propuesta_id  uuid not null references public.propuestas_pago (id) on delete cascade,
  accion        text not null,
  detalle       text,
  usuario_id    uuid references public.perfiles (id) default auth.uid(),
  creado_en     timestamptz not null default now()
);
create index if not exists propuestas_pago_historial_idx on public.propuestas_pago_historial (propuesta_id, creado_en);

do $$
declare t text;
begin
  foreach t in array array['propuestas_pago', 'propuestas_pago_items'] loop
    execute format('drop trigger if exists %1$s_auditoria on public.%1$s', t);
    execute format('create trigger %1$s_auditoria after insert or update or delete on public.%1$s for each row execute function public.registrar_auditoria()', t);
  end loop;
end $$;

-- ─── Permisos: se lee con Financiero 'ver'; los cambios van por las funciones ──
alter table public.propuestas_pago enable row level security;
alter table public.propuestas_pago_items enable row level security;
alter table public.propuestas_pago_historial enable row level security;

drop policy if exists propuestas_pago_ver on public.propuestas_pago;
create policy propuestas_pago_ver on public.propuestas_pago for select to authenticated
  using (public.tiene_permiso('financiero', 'ver'));
drop policy if exists propuestas_pago_items_ver on public.propuestas_pago_items;
create policy propuestas_pago_items_ver on public.propuestas_pago_items for select to authenticated
  using (public.tiene_permiso('financiero', 'ver'));
drop policy if exists propuestas_pago_historial_ver on public.propuestas_pago_historial;
create policy propuestas_pago_historial_ver on public.propuestas_pago_historial for select to authenticated
  using (public.tiene_permiso('financiero', 'ver'));

revoke insert, update, delete on public.propuestas_pago, public.propuestas_pago_items, public.propuestas_pago_historial from authenticated, anon;
grant select on public.propuestas_pago, public.propuestas_pago_items, public.propuestas_pago_historial to authenticated;

-- ─── Funciones ───────────────────────────────────────────────────────────

create or replace function public.puede_editar_propuestas_pago()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.tiene_permiso('financiero', 'editar') then
    raise exception 'No tenés permiso para modificar propuestas de pago';
  end if;
end;
$$;

-- Crear (idempotente por clave de envío).
create or replace function public.crear_propuesta_pago(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_clave uuid := nullif(p ->> 'clave_envio', '')::uuid;
begin
  perform public.puede_editar_propuestas_pago();
  if v_clave is not null then
    select id into v_id from public.propuestas_pago where clave_envio = v_clave;
    if v_id is not null then return v_id; end if;
  end if;
  insert into public.propuestas_pago (empresa, nombre, fecha, disponible, observaciones, clave_envio)
  values (
    p ->> 'empresa',
    trim(p ->> 'nombre'),
    coalesce(nullif(p ->> 'fecha', '')::date, current_date),
    coalesce(nullif(p ->> 'disponible', '')::numeric, 0),
    nullif(trim(p ->> 'observaciones'), ''),
    v_clave
  )
  returning id into v_id;
  insert into public.propuestas_pago_historial (propuesta_id, accion, detalle)
  values (v_id, 'Creada', 'Disponible ' || public.texto_monto_pago(coalesce(nullif(p ->> 'disponible', '')::numeric, 0)));
  return v_id;
end;
$$;

-- Guardar la propuesta entera (datos y pagos) solo en borrador. Con p_version
-- distinta de la guardada (otro guardó en el medio) devuelve el error CONFLICTO,
-- salvo con p_forzar.
create or replace function public.guardar_propuesta_pago(p_id uuid, p jsonb, p_version timestamptz, p_forzar boolean default false)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.propuestas_pago;
  v_items jsonb := coalesce(p -> 'items', '[]'::jsonb);
  v_cambios text[] := '{}';
  v_altas int;
  v_bajas int;
  v_importes int;
  v_orden int;
  v_total_antes numeric;
  v_total numeric;
  v_nueva timestamptz;
begin
  perform public.puede_editar_propuestas_pago();
  select * into v from public.propuestas_pago where id = p_id and eliminado_en is null for update;
  if not found then raise exception 'La propuesta no existe'; end if;
  if v.estado <> 'borrador' then raise exception 'Solo se modifican las propuestas en borrador. Volvela a borrador para cambiarla.'; end if;
  if not p_forzar and p_version is distinct from v.actualizado_en then raise exception 'CONFLICTO'; end if;
  if jsonb_typeof(v_items) <> 'array' then raise exception 'Pagos inválidos'; end if;

  drop table if exists _nuevos;
  create temp table _nuevos on commit drop as
  select (x.value ->> 'id')::uuid as id,
         (x.ordinality - 1)::int as orden,
         trim(x.value ->> 'proveedor') as proveedor,
         nullif(trim(x.value ->> 'detalle'), '') as detalle,
         nullif(x.value ->> 'evento_id', '')::uuid as evento_id,
         nullif(x.value ->> 'adeudado', '')::numeric as adeudado,
         coalesce(nullif(x.value ->> 'importe', '')::numeric, 0) as importe,
         nullif(trim(x.value ->> 'alias_cbu'), '') as alias_cbu,
         coalesce(nullif(x.value ->> 'prioridad', ''), 'normal') as prioridad,
         nullif(trim(x.value ->> 'observaciones'), '') as observaciones,
         nullif(x.value ->> 'solicitud_id', '')::uuid as solicitud_id,
         nullif(trim(x.value ->> 'solicitante'), '') as solicitante
  from jsonb_array_elements(v_items) with ordinality as x(value, ordinality);

  if exists (select 1 from _nuevos where id is null) then raise exception 'Pagos inválidos'; end if;
  if exists (select solicitud_id from _nuevos where solicitud_id is not null group by solicitud_id having count(*) > 1) then
    raise exception 'La misma solicitud de pago está dos veces en la propuesta';
  end if;
  -- Un id de pago de otra propuesta no se puede reutilizar.
  if exists (select 1 from _nuevos n join public.propuestas_pago_items i on i.id = n.id where i.propuesta_id <> p_id) then
    raise exception 'Pagos inválidos';
  end if;

  -- Resumen legible de lo que cambió (para el historial).
  select count(*) into v_altas from _nuevos n where not exists (select 1 from public.propuestas_pago_items i where i.id = n.id);
  select count(*) into v_bajas from public.propuestas_pago_items i where i.propuesta_id = p_id and not exists (select 1 from _nuevos n where n.id = i.id);
  select count(*) into v_importes from _nuevos n join public.propuestas_pago_items i on i.id = n.id where i.importe is distinct from n.importe;
  select count(*) into v_orden from _nuevos n join public.propuestas_pago_items i on i.id = n.id where i.orden is distinct from n.orden;
  select coalesce(sum(importe), 0) into v_total_antes from public.propuestas_pago_items where propuesta_id = p_id;
  select coalesce(sum(importe), 0) into v_total from _nuevos;

  if v.nombre is distinct from trim(p ->> 'nombre') then v_cambios := v_cambios || ('nombre: ' || v.nombre || ' → ' || trim(p ->> 'nombre')); end if;
  if v.fecha is distinct from (p ->> 'fecha')::date then v_cambios := v_cambios || ('fecha: ' || to_char(v.fecha, 'DD/MM/YYYY') || ' → ' || to_char((p ->> 'fecha')::date, 'DD/MM/YYYY')); end if;
  if v.disponible is distinct from (p ->> 'disponible')::numeric then
    v_cambios := v_cambios || ('disponible: ' || public.texto_monto_pago(v.disponible) || ' → ' || public.texto_monto_pago((p ->> 'disponible')::numeric));
  end if;
  if coalesce(v.observaciones, '') is distinct from coalesce(trim(p ->> 'observaciones'), '') then v_cambios := v_cambios || 'observaciones'::text; end if;
  if v_altas > 0 then v_cambios := v_cambios || (v_altas || case when v_altas = 1 then ' pago agregado' else ' pagos agregados' end); end if;
  if v_bajas > 0 then v_cambios := v_cambios || (v_bajas || case when v_bajas = 1 then ' pago quitado' else ' pagos quitados' end); end if;
  if v_importes > 0 then v_cambios := v_cambios || (v_importes || case when v_importes = 1 then ' importe cambiado' else ' importes cambiados' end); end if;
  if v_orden > 0 and v_altas = 0 and v_bajas = 0 then v_cambios := v_cambios || 'orden'::text; end if;
  if v_total is distinct from v_total_antes then
    v_cambios := v_cambios || ('total propuesto: ' || public.texto_monto_pago(v_total_antes) || ' → ' || public.texto_monto_pago(v_total));
  end if;
  if cardinality(v_cambios) = 0 and not exists (
    select 1 from _nuevos n join public.propuestas_pago_items i on i.id = n.id
    where (i.proveedor, i.detalle, i.evento_id, i.adeudado, i.alias_cbu, i.prioridad, i.observaciones)
      is distinct from (n.proveedor, n.detalle, n.evento_id, n.adeudado, n.alias_cbu, n.prioridad, n.observaciones)
  ) then
    return v.actualizado_en;
  end if;
  if cardinality(v_cambios) = 0 then v_cambios := array['datos de los pagos']; end if;

  update public.propuestas_pago set
    nombre = trim(p ->> 'nombre'),
    fecha = (p ->> 'fecha')::date,
    disponible = (p ->> 'disponible')::numeric,
    observaciones = nullif(trim(p ->> 'observaciones'), ''),
    actualizado_por = auth.uid(),
    actualizado_en = clock_timestamp()
  where id = p_id
  returning actualizado_en into v_nueva;

  delete from public.propuestas_pago_items i where i.propuesta_id = p_id and not exists (select 1 from _nuevos n where n.id = i.id);
  insert into public.propuestas_pago_items (id, propuesta_id, orden, proveedor, detalle, evento_id, adeudado, importe, alias_cbu, prioridad, observaciones, solicitud_id, solicitante)
  select id, p_id, orden, proveedor, detalle, evento_id, adeudado, importe, alias_cbu, prioridad, observaciones, solicitud_id, solicitante from _nuevos
  on conflict (id) do update set
    orden = excluded.orden, proveedor = excluded.proveedor, detalle = excluded.detalle, evento_id = excluded.evento_id,
    adeudado = excluded.adeudado, importe = excluded.importe, alias_cbu = excluded.alias_cbu, prioridad = excluded.prioridad,
    observaciones = excluded.observaciones, solicitud_id = excluded.solicitud_id, solicitante = excluded.solicitante;

  insert into public.propuestas_pago_historial (propuesta_id, accion, detalle)
  values (p_id, case when p_forzar then 'Guardada (reemplazó cambios de otra persona)' else 'Guardada' end, array_to_string(v_cambios, ' · '));
  return v_nueva;
end;
$$;

-- Estados administrativos (no significan que se pagó nada).
create or replace function public.cambiar_estado_propuesta_pago(p_id uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v public.propuestas_pago;
begin
  perform public.puede_editar_propuestas_pago();
  if p_estado not in ('borrador', 'aprobada', 'finalizada') then raise exception 'Estado inválido'; end if;
  select * into v from public.propuestas_pago where id = p_id and eliminado_en is null for update;
  if not found then raise exception 'La propuesta no existe'; end if;
  if v.estado = p_estado then return; end if;
  update public.propuestas_pago set estado = p_estado, actualizado_por = auth.uid(), actualizado_en = clock_timestamp() where id = p_id;
  insert into public.propuestas_pago_historial (propuesta_id, accion, detalle)
  values (p_id,
    case p_estado when 'aprobada' then 'Aprobada' when 'finalizada' then 'Finalizada' else 'Vuelta a borrador' end,
    initcap(v.estado) || ' → ' || initcap(p_estado));
end;
$$;

-- Duplicar para armar otra alternativa: copia datos y pagos, queda en borrador.
create or replace function public.duplicar_propuesta_pago(p_id uuid, p_nombre text, p_clave uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.propuestas_pago;
  v_id uuid;
begin
  perform public.puede_editar_propuestas_pago();
  if p_clave is not null then
    select id into v_id from public.propuestas_pago where clave_envio = p_clave;
    if v_id is not null then return v_id; end if;
  end if;
  select * into v from public.propuestas_pago where id = p_id and eliminado_en is null;
  if not found then raise exception 'La propuesta no existe'; end if;
  insert into public.propuestas_pago (empresa, nombre, fecha, disponible, observaciones, clave_envio)
  values (v.empresa, coalesce(nullif(trim(p_nombre), ''), v.nombre || ' (copia)'), current_date, v.disponible, v.observaciones, p_clave)
  returning id into v_id;
  insert into public.propuestas_pago_items (propuesta_id, orden, proveedor, detalle, evento_id, adeudado, importe, alias_cbu, prioridad, observaciones, solicitud_id, solicitante)
  select v_id, orden, proveedor, detalle, evento_id, adeudado, importe, alias_cbu, prioridad, observaciones, solicitud_id, solicitante
  from public.propuestas_pago_items where propuesta_id = p_id;
  insert into public.propuestas_pago_historial (propuesta_id, accion, detalle) values (v_id, 'Creada como copia', 'De «' || v.nombre || '» (#' || v.numero || ')');
  insert into public.propuestas_pago_historial (propuesta_id, accion, detalle) values (p_id, 'Duplicada', 'Copia: «' || coalesce(nullif(trim(p_nombre), ''), v.nombre || ' (copia)') || '»');
  return v_id;
end;
$$;

-- Eliminar (queda guardada como eliminada): solo borradores.
create or replace function public.eliminar_propuesta_pago(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v public.propuestas_pago;
begin
  perform public.puede_editar_propuestas_pago();
  select * into v from public.propuestas_pago where id = p_id and eliminado_en is null for update;
  if not found then return; end if;
  if v.estado <> 'borrador' then raise exception 'Solo se eliminan propuestas en borrador'; end if;
  update public.propuestas_pago set eliminado_en = now(), actualizado_por = auth.uid(), actualizado_en = clock_timestamp() where id = p_id;
  insert into public.propuestas_pago_historial (propuesta_id, accion) values (p_id, 'Eliminada');
end;
$$;

-- Solicitudes de pagos abiertas de una empresa, para sumarlas a una propuesta (solo lectura).
create or replace function public.solicitudes_para_propuesta(p_empresa text)
returns table (id uuid, numero bigint, proveedor text, monto numeric, pagado numeric, datos_bancarios text, prioridad text,
               motivo text, estado text, evento_id uuid, evento text, solicitante text, creado_en timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.numero, s.proveedor, s.monto, s.pagado, s.datos_bancarios, s.prioridad, s.motivo, s.estado,
         s.evento_id, e.nombre, pf.nombre, s.creado_en
  from public.solicitudes_pago s
  left join public.eventos e on e.id = s.evento_id
  left join public.perfiles pf on pf.id = s.solicitado_por
  where public.tiene_permiso('financiero', 'editar')
    and s.empresa = p_empresa
    and s.estado in ('pendiente', 'aprobada', 'parcial')
  order by case s.prioridad when 'muy_urgente' then 0 when 'urgente' then 1 else 2 end, s.creado_en;
$$;

-- Nombres de quién creó y modificó cada propuesta.
create or replace function public.datos_propuestas_pago(p_ids uuid[])
returns table (id uuid, creador text, modificador text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, c.nombre, m.nombre
  from public.propuestas_pago p
  left join public.perfiles c on c.id = p.creado_por
  left join public.perfiles m on m.id = p.actualizado_por
  where p.id = any (p_ids) and public.tiene_permiso('financiero', 'ver');
$$;

create or replace function public.historial_propuesta_pago(p_id uuid)
returns table (accion text, detalle text, usuario text, creado_en timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select h.accion, h.detalle, pf.nombre, h.creado_en
  from public.propuestas_pago_historial h
  left join public.perfiles pf on pf.id = h.usuario_id
  where h.propuesta_id = p_id and public.tiene_permiso('financiero', 'ver')
  order by h.creado_en desc;
$$;

revoke execute on function public.puede_editar_propuestas_pago() from public, anon;
revoke execute on function public.crear_propuesta_pago(jsonb) from public, anon;
revoke execute on function public.guardar_propuesta_pago(uuid, jsonb, timestamptz, boolean) from public, anon;
revoke execute on function public.cambiar_estado_propuesta_pago(uuid, text) from public, anon;
revoke execute on function public.duplicar_propuesta_pago(uuid, text, uuid) from public, anon;
revoke execute on function public.eliminar_propuesta_pago(uuid) from public, anon;
revoke execute on function public.solicitudes_para_propuesta(text) from public, anon;
revoke execute on function public.datos_propuestas_pago(uuid[]) from public, anon;
revoke execute on function public.historial_propuesta_pago(uuid) from public, anon;
grant execute on function public.puede_editar_propuestas_pago() to authenticated;
grant execute on function public.crear_propuesta_pago(jsonb) to authenticated;
grant execute on function public.guardar_propuesta_pago(uuid, jsonb, timestamptz, boolean) to authenticated;
grant execute on function public.cambiar_estado_propuesta_pago(uuid, text) to authenticated;
grant execute on function public.duplicar_propuesta_pago(uuid, text, uuid) to authenticated;
grant execute on function public.eliminar_propuesta_pago(uuid) to authenticated;
grant execute on function public.solicitudes_para_propuesta(text) to authenticated;
grant execute on function public.datos_propuestas_pago(uuid[]) to authenticated;
grant execute on function public.historial_propuesta_pago(uuid) to authenticated;
