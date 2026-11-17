-- QUILMES: proyectos que funcionan como eventos pero con su planilla dividida en
--   · SOLICITUDES QUILMES (precio de venta: lo que se le presupuesta al cliente)
--   · GASTOS REALES (costos internos: van en la planilla del evento, como siempre)
-- Los costos internos tienen su propio permiso (quilmes_costos) y la base lo
-- exige: sin él no se leen la planilla, los gastos ni los movimientos.

-- ─── Tipo de evento ──────────────────────────────────────────────────────
alter table public.eventos add column if not exists tipo text not null default 'evento';
alter table public.eventos drop constraint if exists eventos_tipo_check;
alter table public.eventos add constraint eventos_tipo_check check (tipo in ('evento', 'quilmes'));
create index if not exists eventos_tipo_idx on public.eventos (tipo, fecha desc);

-- Un evento no cambia de tipo (cambiaría quién puede ver sus costos).
create or replace function public.eventos_tipo_fijo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo is distinct from old.tipo then raise exception 'El tipo del evento no se puede cambiar'; end if;
  return new;
end
$$;
drop trigger if exists eventos_tipo_fijo on public.eventos;
create trigger eventos_tipo_fijo before update on public.eventos for each row execute function public.eventos_tipo_fijo();

-- ─── Permisos según el tipo ──────────────────────────────────────────────
-- parte 'evento': el proyecto en sí (Eventos o Quilmes).
-- parte 'costos': planilla, gastos, rentabilidad y movimientos (Eventos o Quilmes: costos).
create or replace function public.permiso_tipo_evento(p_tipo text, p_parte text, p_nivel public.nivel_permiso)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_tipo = 'quilmes' and p_parte = 'costos' then public.tiene_permiso('quilmes_costos', p_nivel)
    when p_tipo = 'quilmes' then public.tiene_permiso('quilmes', p_nivel)
    else public.tiene_permiso('eventos', p_nivel)
  end
$$;

create or replace function public.permiso_evento(p_evento_id uuid, p_parte text, p_nivel public.nivel_permiso)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.permiso_tipo_evento(coalesce((select e.tipo from public.eventos e where e.id = p_evento_id), 'evento'), p_parte, p_nivel)
$$;
revoke execute on function public.permiso_tipo_evento(text, text, public.nivel_permiso) from public, anon;
grant execute on function public.permiso_tipo_evento(text, text, public.nivel_permiso) to authenticated;
revoke execute on function public.permiso_evento(uuid, text, public.nivel_permiso) from public, anon;
grant execute on function public.permiso_evento(uuid, text, public.nivel_permiso) to authenticated;

-- Eventos: los Quilmes se ven y editan con el permiso de Quilmes (Financiero los sigue viendo para asociar movimientos).
drop policy if exists "eventos: ver" on public.eventos;
create policy "eventos: ver" on public.eventos for select to authenticated
  using (public.permiso_tipo_evento(tipo, 'evento', 'ver') or (select public.tiene_permiso('financiero', 'ver')));
drop policy if exists "eventos: crear" on public.eventos;
create policy "eventos: crear" on public.eventos for insert to authenticated
  with check (public.permiso_tipo_evento(tipo, 'evento', 'editar'));
drop policy if exists "eventos: editar" on public.eventos;
create policy "eventos: editar" on public.eventos for update to authenticated
  using (public.permiso_tipo_evento(tipo, 'evento', 'editar'))
  with check (public.permiso_tipo_evento(tipo, 'evento', 'editar'));

-- Planilla (ingresos, gastos reales, rentabilidad): en Quilmes, solo con el permiso de costos.
drop policy if exists "planilla evento: ver" on public.planillas_evento;
create policy "planilla evento: ver" on public.planillas_evento for select to authenticated
  using (public.permiso_evento(evento_id, 'costos', 'ver'));
drop policy if exists "planilla evento: crear" on public.planillas_evento;
create policy "planilla evento: crear" on public.planillas_evento for insert to authenticated
  with check (public.permiso_evento(evento_id, 'costos', 'editar'));
drop policy if exists "planilla evento: editar" on public.planillas_evento;
create policy "planilla evento: editar" on public.planillas_evento for update to authenticated
  using (public.permiso_evento(evento_id, 'costos', 'editar'))
  with check (public.permiso_evento(evento_id, 'costos', 'editar'));

-- Movimientos de un evento: en Quilmes, también con el permiso de costos (Financiero ve todo, como siempre).
drop policy if exists "transacciones: ver" on public.transacciones;
create policy "transacciones: ver" on public.transacciones for select to authenticated
  using (
    (select public.tiene_permiso('financiero', 'ver'))
    or (evento_id is not null and public.permiso_evento(evento_id, 'costos', 'ver'))
  );
drop policy if exists "transacciones: crear" on public.transacciones;
create policy "transacciones: crear" on public.transacciones for insert to authenticated
  with check (
    (select public.tiene_permiso('financiero', 'editar'))
    or (evento_id is not null and public.permiso_evento(evento_id, 'costos', 'editar'))
  );
drop policy if exists "transacciones: editar" on public.transacciones;
create policy "transacciones: editar" on public.transacciones for update to authenticated
  using (
    (select public.tiene_permiso('financiero', 'editar'))
    or (evento_id is not null and public.permiso_evento(evento_id, 'costos', 'editar'))
  )
  with check (
    (select public.tiene_permiso('financiero', 'editar'))
    or (evento_id is not null and public.permiso_evento(evento_id, 'costos', 'editar'))
  );

-- Las funciones de estado y sincronización con Financiero pedían "eventos: editar":
-- pasan a pedir el permiso que corresponde al tipo (en un evento común es el mismo).
do $$
declare
  f text;
  d text;
  nuevo text;
begin
  foreach f in array array[
    'public.cambiar_estado_evento(uuid, public.estado_evento)',
    'public.marcar_sync_evento(uuid, boolean, text)',
    'public.sincronizar_planilla(uuid, jsonb)',
    'public.aplicar_saldo_evento(uuid)'
  ] loop
    d := pg_get_functiondef(f::regprocedure);
    nuevo := replace(d, $r$public.tiene_permiso('eventos', 'editar')$r$, $r$public.permiso_evento(p_evento_id, 'costos', 'editar')$r$);
    if nuevo = d then raise exception 'No se encontró el control de permiso en %', f; end if;
    execute nuevo;
  end loop;
end $$;

-- ─── Solicitudes Quilmes (precio de venta) ───────────────────────────────
create table if not exists public.quilmes_solicitudes (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references public.eventos (id) on delete cascade,
  orden           integer not null default 0,
  detalle         text not null default '' check (char_length(detalle) <= 300),
  neto            numeric(14, 2) not null default 0,
  -- A21 / A105 / A27: factura con IVA; exento: factura sin IVA; sin: sin factura.
  tipo_iva        text not null default 'A21' check (tipo_iva in ('A21', 'A105', 'A27', 'exento', 'sin')),
  iva             numeric(14, 2) not null default 0,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists quilmes_solicitudes_evento_idx on public.quilmes_solicitudes (evento_id, orden);

-- Solo en eventos Quilmes.
create or replace function public.quilmes_solo_quilmes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.eventos where id = new.evento_id and tipo = 'quilmes') then
    raise exception 'Solo los eventos Quilmes tienen solicitudes y presupuestos para Quilmes';
  end if;
  return new;
end
$$;
drop trigger if exists quilmes_solicitudes_tipo on public.quilmes_solicitudes;
create trigger quilmes_solicitudes_tipo before insert or update of evento_id on public.quilmes_solicitudes for each row execute function public.quilmes_solo_quilmes();
drop trigger if exists quilmes_solicitudes_autoria on public.quilmes_solicitudes;
create trigger quilmes_solicitudes_autoria before insert or update on public.quilmes_solicitudes for each row execute function public.marcar_autoria();
drop trigger if exists quilmes_solicitudes_auditoria on public.quilmes_solicitudes;
create trigger quilmes_solicitudes_auditoria after insert or update or delete on public.quilmes_solicitudes for each row execute function public.registrar_auditoria();

alter table public.quilmes_solicitudes enable row level security;
drop policy if exists "quilmes solicitudes: ver" on public.quilmes_solicitudes;
create policy "quilmes solicitudes: ver" on public.quilmes_solicitudes for select to authenticated
  using ((select public.tiene_permiso('quilmes', 'ver')));
drop policy if exists "quilmes solicitudes: editar" on public.quilmes_solicitudes;
create policy "quilmes solicitudes: editar" on public.quilmes_solicitudes for all to authenticated
  using ((select public.tiene_permiso('quilmes', 'editar')))
  with check ((select public.tiene_permiso('quilmes', 'editar')));
revoke all on public.quilmes_solicitudes from anon;
revoke truncate on public.quilmes_solicitudes from authenticated;

-- Guarda la tabla entera de un evento (orden incluido) en una sola operación:
-- las que no vienen se borran, las demás se crean o actualizan.
create or replace function public.quilmes_guardar_solicitudes(p_evento_id uuid, p_lista jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.tiene_permiso('quilmes', 'editar') then raise exception 'No tenés permiso para editar el presupuesto de Quilmes'; end if;
  perform pg_advisory_xact_lock(hashtext('quilmes_solicitudes:' || p_evento_id));
  delete from public.quilmes_solicitudes
  where evento_id = p_evento_id
    and id not in (select (s ->> 'id')::uuid from jsonb_array_elements(p_lista) s);
  insert into public.quilmes_solicitudes (id, evento_id, orden, detalle, neto, tipo_iva, iva)
  select (s ->> 'id')::uuid, p_evento_id, (s ->> 'orden')::int, s ->> 'detalle', (s ->> 'neto')::numeric, s ->> 'tipo_iva', (s ->> 'iva')::numeric
  from jsonb_array_elements(p_lista) s
  on conflict (id) do update
    set orden = excluded.orden, detalle = excluded.detalle, neto = excluded.neto, tipo_iva = excluded.tipo_iva, iva = excluded.iva
    where public.quilmes_solicitudes.evento_id = p_evento_id
      and (public.quilmes_solicitudes.orden, public.quilmes_solicitudes.detalle, public.quilmes_solicitudes.neto, public.quilmes_solicitudes.tipo_iva, public.quilmes_solicitudes.iva)
          is distinct from (excluded.orden, excluded.detalle, excluded.neto, excluded.tipo_iva, excluded.iva);
end
$$;
revoke execute on function public.quilmes_guardar_solicitudes(uuid, jsonb) from public, anon;
grant execute on function public.quilmes_guardar_solicitudes(uuid, jsonb) to authenticated;

-- Cuántos gastos reales tiene vinculados cada solicitud (solo la cantidad, sin
-- importes): para no borrar una solicitud con costos sin que alguien decida qué hacer.
create or replace function public.quilmes_gastos_por_solicitud(p_evento_id uuid)
returns table (solicitud_id text, gastos integer)
language sql
stable
security definer
set search_path = ''
as $$
  select g ->> 'solicitud_id', count(*)::int
  from public.planillas_evento p, jsonb_array_elements(coalesce(p.datos -> 'gastos', '[]')) g
  where p.evento_id = p_evento_id
    and public.tiene_permiso('quilmes', 'ver')
    and coalesce(g ->> 'solicitud_id', '') <> ''
  group by 1
$$;
revoke execute on function public.quilmes_gastos_por_solicitud(uuid) from public, anon;
grant execute on function public.quilmes_gastos_por_solicitud(uuid) to authenticated;

-- ─── Presupuestos emitidos para Quilmes (versiones, inmutables) ──────────
-- `datos` es SOLO el contenido comercial que se mostró (lista blanca armada en
-- el servidor): nunca costos, proveedores ni rentabilidad.
create table if not exists public.quilmes_presupuestos (
  id          uuid primary key default gen_random_uuid(),
  numero      bigint generated always as identity,
  evento_id   uuid not null references public.eventos (id) on delete cascade,
  version     integer not null,
  datos       jsonb not null,
  huella      text not null,
  total       numeric(14, 2) not null,
  emitido_por uuid references public.perfiles (id) default auth.uid(),
  emitido_en  timestamptz not null default now(),
  unique (evento_id, version)
);
drop trigger if exists quilmes_presupuestos_tipo on public.quilmes_presupuestos;
create trigger quilmes_presupuestos_tipo before insert on public.quilmes_presupuestos for each row execute function public.quilmes_solo_quilmes();
drop trigger if exists quilmes_presupuestos_auditoria on public.quilmes_presupuestos;
create trigger quilmes_presupuestos_auditoria after insert or update or delete on public.quilmes_presupuestos for each row execute function public.registrar_auditoria();

alter table public.quilmes_presupuestos enable row level security;
drop policy if exists "quilmes presupuestos: ver" on public.quilmes_presupuestos;
create policy "quilmes presupuestos: ver" on public.quilmes_presupuestos for select to authenticated
  using ((select public.tiene_permiso('quilmes', 'ver')));
drop policy if exists "quilmes presupuestos: emitir" on public.quilmes_presupuestos;
create policy "quilmes presupuestos: emitir" on public.quilmes_presupuestos for insert to authenticated
  with check ((select public.tiene_permiso('quilmes', 'editar')));
-- Una versión emitida no se modifica ni se borra (conserva lo que se mostró).
revoke all on public.quilmes_presupuestos from anon;
revoke update, delete, truncate on public.quilmes_presupuestos from authenticated;

-- Emite una versión. Si el contenido es igual al de la última, devuelve esa
-- (imprimir o descargar varias veces no crea versiones repetidas).
create or replace function public.quilmes_emitir_presupuesto(p_evento_id uuid, p_datos jsonb, p_huella text, p_total numeric)
returns table (id uuid, version integer, nueva boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ultima public.quilmes_presupuestos;
begin
  if not public.tiene_permiso('quilmes', 'editar') then raise exception 'No tenés permiso para emitir presupuestos de Quilmes'; end if;
  perform pg_advisory_xact_lock(hashtext('quilmes_presupuestos:' || p_evento_id));
  select * into v_ultima from public.quilmes_presupuestos q where q.evento_id = p_evento_id order by q.version desc limit 1;
  if found and v_ultima.huella = p_huella then
    return query select v_ultima.id, v_ultima.version, false;
    return;
  end if;
  return query
    insert into public.quilmes_presupuestos (evento_id, version, datos, huella, total)
    values (p_evento_id, coalesce(v_ultima.version, 0) + 1, p_datos, p_huella, p_total)
    returning quilmes_presupuestos.id, quilmes_presupuestos.version, true;
end
$$;
revoke execute on function public.quilmes_emitir_presupuesto(uuid, jsonb, text, numeric) from public, anon;
grant execute on function public.quilmes_emitir_presupuesto(uuid, jsonb, text, numeric) to authenticated;
