-- Solicitudes de pagos: el equipo pide pagar a un proveedor y Contabilidad lo
-- organiza (aprueba, rechaza y registra cuándo se pagó). Es seguimiento: no
-- crea movimientos en Financiero ni toca cuentas corrientes.

create table if not exists public.solicitudes_pago (
  id                uuid primary key default gen_random_uuid(),
  numero            bigint generated always as identity unique,
  empresa           text not null check (empresa in ('nero', 'ruta')),
  proveedor_id      uuid references public.proveedores (id) on delete set null,
  proveedor         text not null check (length(trim(proveedor)) > 0),
  evento_id         uuid references public.eventos (id) on delete set null,
  monto             numeric(15, 2) not null check (monto > 0),
  datos_bancarios   text not null check (length(trim(datos_bancarios)) > 0),
  prioridad         text not null default 'normal' check (prioridad in ('normal', 'urgente', 'muy_urgente')),
  motivo            text,
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente', 'aprobada', 'parcial', 'pagada', 'rechazada', 'cancelada')),
  pagado            numeric(15, 2) not null default 0 check (pagado >= 0),
  nota_admin        text,
  -- Evita la misma solicitud dos veces si el formulario se envía repetido.
  clave_envio       uuid unique,
  solicitado_por    uuid not null references public.perfiles (id) default auth.uid(),
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  estado_por        uuid references public.perfiles (id),
  estado_en         timestamptz
);
create index if not exists solicitudes_pago_estado_idx on public.solicitudes_pago (estado, prioridad, creado_en);
create index if not exists solicitudes_pago_solicitante_idx on public.solicitudes_pago (solicitado_por);

-- Pagos registrados por Contabilidad (uno o varios: pagos parciales).
create table if not exists public.solicitudes_pago_pagos (
  id                uuid primary key default gen_random_uuid(),
  solicitud_id      uuid not null references public.solicitudes_pago (id) on delete cascade,
  fecha             date not null,
  importe           numeric(15, 2) not null check (importe > 0),
  medio             text not null check (length(trim(medio)) > 0),
  observacion       text,
  comprobante_path  text,
  registrado_por    uuid not null references public.perfiles (id) default auth.uid(),
  creado_en         timestamptz not null default now()
);
create index if not exists solicitudes_pago_pagos_solicitud_idx on public.solicitudes_pago_pagos (solicitud_id);

-- Historial legible de cada solicitud (quién hizo qué y cuándo).
create table if not exists public.solicitudes_pago_historial (
  id            uuid primary key default gen_random_uuid(),
  solicitud_id  uuid not null references public.solicitudes_pago (id) on delete cascade,
  accion        text not null,
  detalle       text,
  usuario_id    uuid references public.perfiles (id) default auth.uid(),
  creado_en     timestamptz not null default now()
);
create index if not exists solicitudes_pago_historial_idx on public.solicitudes_pago_historial (solicitud_id, creado_en);

-- Notificaciones internas (por usuario).
create table if not exists public.notificaciones (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.perfiles (id) on delete cascade,
  titulo      text not null,
  detalle     text,
  href        text,
  leida       boolean not null default false,
  creado_en   timestamptz not null default now()
);
create index if not exists notificaciones_usuario_idx on public.notificaciones (usuario_id, leida, creado_en desc);

-- Auditoría general.
do $$
declare t text;
begin
  foreach t in array array['solicitudes_pago', 'solicitudes_pago_pagos'] loop
    execute format('drop trigger if exists %1$s_auditoria on public.%1$s', t);
    execute format('create trigger %1$s_auditoria after insert or update or delete on public.%1$s for each row execute function public.registrar_auditoria()', t);
  end loop;
end $$;

-- ─── Permisos ────────────────────────────────────────────────────────────
alter table public.solicitudes_pago enable row level security;
alter table public.solicitudes_pago_pagos enable row level security;
alter table public.solicitudes_pago_historial enable row level security;
alter table public.notificaciones enable row level security;

-- Contabilidad ve todas; el resto, las propias. Los cambios van por las funciones de abajo.
drop policy if exists solicitudes_pago_ver on public.solicitudes_pago;
create policy solicitudes_pago_ver on public.solicitudes_pago for select to authenticated
  using (public.tiene_permiso('pagos', 'editar') or (solicitado_por = auth.uid() and public.tiene_permiso('pagos', 'ver')));

drop policy if exists solicitudes_pago_pagos_ver on public.solicitudes_pago_pagos;
create policy solicitudes_pago_pagos_ver on public.solicitudes_pago_pagos for select to authenticated
  using (exists (select 1 from public.solicitudes_pago s where s.id = solicitud_id));

drop policy if exists solicitudes_pago_historial_ver on public.solicitudes_pago_historial;
create policy solicitudes_pago_historial_ver on public.solicitudes_pago_historial for select to authenticated
  using (exists (select 1 from public.solicitudes_pago s where s.id = solicitud_id));

drop policy if exists notificaciones_ver on public.notificaciones;
create policy notificaciones_ver on public.notificaciones for select to authenticated using (usuario_id = auth.uid());
drop policy if exists notificaciones_leer on public.notificaciones;
create policy notificaciones_leer on public.notificaciones for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
revoke insert, update, delete on public.notificaciones from authenticated;
grant select on public.notificaciones to authenticated;
grant update (leida) on public.notificaciones to authenticated;

revoke insert, update, delete on public.solicitudes_pago, public.solicitudes_pago_pagos, public.solicitudes_pago_historial from authenticated;
grant select on public.solicitudes_pago, public.solicitudes_pago_pagos, public.solicitudes_pago_historial to authenticated;

-- ─── Funciones ───────────────────────────────────────────────────────────

-- Notifica a Contabilidad (admins y usuarios con 'editar' en pagos), menos a quien lo hizo.
create or replace function public.notificar_contabilidad_pagos(p_titulo text, p_detalle text, p_href text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notificaciones (usuario_id, titulo, detalle, href)
  select pf.id, p_titulo, p_detalle, p_href
  from public.perfiles pf
  where pf.activo
    and pf.id is distinct from auth.uid()
    and (pf.es_admin or exists (select 1 from public.permisos pm where pm.usuario_id = pf.id and pm.seccion = 'pagos' and pm.nivel = 'editar'));
$$;
revoke execute on function public.notificar_contabilidad_pagos(text, text, text) from public, anon, authenticated;

create or replace function public.notificar_solicitante_pago(p_id uuid, p_titulo text, p_detalle text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notificaciones (usuario_id, titulo, detalle, href)
  select s.solicitado_por, p_titulo, p_detalle, '/solicitudes-pago?ver=' || s.numero
  from public.solicitudes_pago s
  where s.id = p_id and s.solicitado_por is distinct from auth.uid();
$$;
revoke execute on function public.notificar_solicitante_pago(uuid, text, text) from public, anon, authenticated;

create or replace function public.texto_monto_pago(p numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select '$ ' || replace(replace(replace(to_char(p, 'FM999G999G999G990D00'), ',', '#'), '.', ','), '#', '.');
$$;

-- Crear: cualquiera con permiso 'ver' en pagos. Idempotente por clave de envío.
create or replace function public.crear_solicitud_pago(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_clave uuid := nullif(p ->> 'clave_envio', '')::uuid;
  v_s public.solicitudes_pago;
begin
  if not public.tiene_permiso('pagos', 'ver') then
    raise exception 'No tenés permiso para crear solicitudes de pago';
  end if;
  if v_clave is not null then
    select id into v_id from public.solicitudes_pago where clave_envio = v_clave;
    if v_id is not null then return v_id; end if;
  end if;

  insert into public.solicitudes_pago (empresa, proveedor_id, proveedor, evento_id, monto, datos_bancarios, prioridad, motivo, clave_envio, solicitado_por)
  values (
    p ->> 'empresa',
    nullif(p ->> 'proveedor_id', '')::uuid,
    trim(p ->> 'proveedor'),
    nullif(p ->> 'evento_id', '')::uuid,
    (p ->> 'monto')::numeric,
    trim(p ->> 'datos_bancarios'),
    coalesce(nullif(p ->> 'prioridad', ''), 'normal'),
    nullif(trim(p ->> 'motivo'), ''),
    v_clave,
    auth.uid()
  )
  returning * into v_s;

  insert into public.solicitudes_pago_historial (solicitud_id, accion, detalle)
  values (v_s.id, 'Creada', v_s.proveedor || ' · ' || public.texto_monto_pago(v_s.monto));

  perform public.notificar_contabilidad_pagos(
    case v_s.prioridad when 'muy_urgente' then 'Solicitud de pago MUY URGENTE' when 'urgente' then 'Solicitud de pago urgente' else 'Nueva solicitud de pago' end,
    v_s.proveedor || ' · ' || public.texto_monto_pago(v_s.monto) || ' · ' || upper(v_s.empresa),
    '/solicitudes-pago?ver=' || v_s.numero
  );
  return v_s.id;
end;
$$;

-- Editar: Contabilidad mientras no esté cerrada; el solicitante, solo las suyas pendientes.
create or replace function public.editar_solicitud_pago(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.solicitudes_pago;
  v_gestor boolean := public.tiene_permiso('pagos', 'editar');
  v_cambios text[] := '{}';
  v_nuevo_monto numeric := (p ->> 'monto')::numeric;
begin
  select * into v_s from public.solicitudes_pago where id = p_id for update;
  if not found then raise exception 'La solicitud no existe'; end if;
  if not v_gestor then
    if v_s.solicitado_por is distinct from auth.uid() or not public.tiene_permiso('pagos', 'ver') then
      raise exception 'Solo podés modificar tus solicitudes';
    end if;
    if v_s.estado <> 'pendiente' then
      raise exception 'Solo se modifican mientras están pendientes';
    end if;
  elsif v_s.estado in ('pagada', 'rechazada', 'cancelada') then
    raise exception 'La solicitud ya está cerrada';
  end if;
  if v_nuevo_monto < v_s.pagado then
    raise exception 'El monto no puede ser menor a lo ya pagado (%)', public.texto_monto_pago(v_s.pagado);
  end if;

  if v_s.proveedor is distinct from trim(p ->> 'proveedor') then v_cambios := v_cambios || ('proveedor: ' || v_s.proveedor || ' → ' || trim(p ->> 'proveedor')); end if;
  if v_s.empresa is distinct from p ->> 'empresa' then v_cambios := v_cambios || ('empresa: ' || upper(v_s.empresa) || ' → ' || upper(p ->> 'empresa')); end if;
  if v_s.monto is distinct from v_nuevo_monto then v_cambios := v_cambios || ('monto: ' || public.texto_monto_pago(v_s.monto) || ' → ' || public.texto_monto_pago(v_nuevo_monto)); end if;
  if v_s.datos_bancarios is distinct from trim(p ->> 'datos_bancarios') then v_cambios := v_cambios || ('alias / CBU: ' || v_s.datos_bancarios || ' → ' || trim(p ->> 'datos_bancarios')); end if;
  if v_s.prioridad is distinct from p ->> 'prioridad' then v_cambios := v_cambios || ('prioridad: ' || replace(v_s.prioridad, '_', ' ') || ' → ' || replace(p ->> 'prioridad', '_', ' ')); end if;
  if v_s.evento_id is distinct from nullif(p ->> 'evento_id', '')::uuid then v_cambios := v_cambios || 'evento'::text; end if;
  if coalesce(v_s.motivo, '') is distinct from coalesce(trim(p ->> 'motivo'), '') then v_cambios := v_cambios || 'motivo'::text; end if;
  if v_gestor and coalesce(v_s.nota_admin, '') is distinct from coalesce(trim(p ->> 'nota_admin'), '') then v_cambios := v_cambios || 'observación de Contabilidad'::text; end if;
  if cardinality(v_cambios) = 0 then return; end if;

  update public.solicitudes_pago set
    empresa = p ->> 'empresa',
    proveedor_id = nullif(p ->> 'proveedor_id', '')::uuid,
    proveedor = trim(p ->> 'proveedor'),
    evento_id = nullif(p ->> 'evento_id', '')::uuid,
    monto = v_nuevo_monto,
    datos_bancarios = trim(p ->> 'datos_bancarios'),
    prioridad = p ->> 'prioridad',
    motivo = nullif(trim(p ->> 'motivo'), ''),
    nota_admin = case when v_gestor then nullif(trim(p ->> 'nota_admin'), '') else nota_admin end,
    -- Con un monto nuevo, el estado de pago se recalcula.
    estado = case
      when estado in ('parcial', 'pagada') and pagado >= v_nuevo_monto then 'pagada'
      when estado in ('parcial', 'pagada') then 'parcial'
      else estado end,
    actualizado_en = now()
  where id = p_id;

  insert into public.solicitudes_pago_historial (solicitud_id, accion, detalle)
  values (p_id, 'Modificada', array_to_string(v_cambios, '; '));
  if v_gestor and v_s.solicitado_por is distinct from auth.uid() then
    perform public.notificar_solicitante_pago(p_id, 'Contabilidad modificó tu solicitud de pago', v_s.proveedor || ': ' || array_to_string(v_cambios, '; '));
  end if;
end;
$$;

-- Estados: Contabilidad aprueba, rechaza o vuelve a pendiente; cancelar puede también el solicitante (pendiente).
create or replace function public.cambiar_estado_solicitud_pago(p_id uuid, p_estado text, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.solicitudes_pago;
  v_gestor boolean := public.tiene_permiso('pagos', 'editar');
  v_nombre text := case p_estado when 'pendiente' then 'Pendiente' when 'aprobada' then 'Aprobada' when 'rechazada' then 'Rechazada' when 'cancelada' then 'Cancelada' end;
begin
  if v_nombre is null then raise exception 'Estado inválido'; end if;
  select * into v_s from public.solicitudes_pago where id = p_id for update;
  if not found then raise exception 'La solicitud no existe'; end if;
  if v_s.estado = p_estado then return; end if;

  if not v_gestor then
    if p_estado <> 'cancelada' or v_s.solicitado_por is distinct from auth.uid() or not public.tiene_permiso('pagos', 'ver') then
      raise exception 'Solo Contabilidad cambia el estado de las solicitudes';
    end if;
    if v_s.estado <> 'pendiente' then raise exception 'Solo se cancelan mientras están pendientes'; end if;
  end if;
  if v_s.estado = 'pagada' then raise exception 'La solicitud ya está pagada'; end if;
  if v_s.pagado > 0 and p_estado <> 'aprobada' then
    raise exception 'Tiene pagos registrados: quitá los pagos antes de cambiarla a %', lower(v_nombre);
  end if;

  update public.solicitudes_pago
  set estado = p_estado, estado_por = auth.uid(), estado_en = now(), actualizado_en = now()
  where id = p_id;
  insert into public.solicitudes_pago_historial (solicitud_id, accion, detalle)
  values (p_id, v_nombre, nullif(trim(p_nota), ''));
  perform public.notificar_solicitante_pago(
    p_id,
    'Tu solicitud de pago: ' || lower(v_nombre),
    v_s.proveedor || ' · ' || public.texto_monto_pago(v_s.monto) || coalesce(' · ' || nullif(trim(p_nota), ''), '')
  );
end;
$$;

-- Registrar un pago (total o parcial). No crea movimientos en Financiero.
create or replace function public.registrar_pago_solicitud(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.solicitudes_pago;
  v_importe numeric := (p ->> 'importe')::numeric;
  v_pagado numeric;
begin
  if not public.tiene_permiso('pagos', 'editar') then raise exception 'Solo Contabilidad registra pagos'; end if;
  select * into v_s from public.solicitudes_pago where id = p_id for update;
  if not found then raise exception 'La solicitud no existe'; end if;
  if v_s.estado in ('rechazada', 'cancelada', 'pagada') then raise exception 'La solicitud está %', v_s.estado; end if;
  if v_importe is null or v_importe <= 0 then raise exception 'El importe tiene que ser mayor a cero'; end if;

  insert into public.solicitudes_pago_pagos (solicitud_id, fecha, importe, medio, observacion, comprobante_path)
  values (p_id, (p ->> 'fecha')::date, v_importe, trim(p ->> 'medio'), nullif(trim(p ->> 'observacion'), ''), nullif(p ->> 'comprobante_path', ''));

  v_pagado := v_s.pagado + v_importe;
  update public.solicitudes_pago
  set pagado = v_pagado,
      estado = case when v_pagado >= monto then 'pagada' else 'parcial' end,
      estado_por = auth.uid(), estado_en = now(), actualizado_en = now()
  where id = p_id;

  insert into public.solicitudes_pago_historial (solicitud_id, accion, detalle)
  values (p_id, case when v_pagado >= v_s.monto then 'Pagada' else 'Pago parcial' end,
          public.texto_monto_pago(v_importe) || ' · ' || trim(p ->> 'medio') || ' · ' || to_char((p ->> 'fecha')::date, 'DD/MM/YYYY')
          || case when v_pagado < v_s.monto then ' · falta ' || public.texto_monto_pago(v_s.monto - v_pagado) else '' end);
  perform public.notificar_solicitante_pago(
    p_id,
    case when v_pagado >= v_s.monto then 'Tu solicitud de pago fue pagada' else 'Tu solicitud de pago tuvo un pago parcial' end,
    v_s.proveedor || ' · ' || public.texto_monto_pago(v_importe)
      || case when v_pagado < v_s.monto then ' (falta ' || public.texto_monto_pago(v_s.monto - v_pagado) || ')' else '' end
  );
end;
$$;

-- Quitar un pago cargado por error: vuelve a aprobada o parcial.
create or replace function public.quitar_pago_solicitud(p_pago_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.solicitudes_pago_pagos;
  v_s public.solicitudes_pago;
  v_pagado numeric;
begin
  if not public.tiene_permiso('pagos', 'editar') then raise exception 'Solo Contabilidad quita pagos'; end if;
  select * into v_p from public.solicitudes_pago_pagos where id = p_pago_id;
  if not found then raise exception 'El pago no existe'; end if;
  select * into v_s from public.solicitudes_pago where id = v_p.solicitud_id for update;
  delete from public.solicitudes_pago_pagos where id = p_pago_id;
  v_pagado := greatest(v_s.pagado - v_p.importe, 0);
  update public.solicitudes_pago
  set pagado = v_pagado,
      estado = case when v_pagado >= monto then 'pagada' when v_pagado > 0 then 'parcial' else 'aprobada' end,
      actualizado_en = now()
  where id = v_s.id;
  insert into public.solicitudes_pago_historial (solicitud_id, accion, detalle)
  values (v_s.id, 'Pago quitado', public.texto_monto_pago(v_p.importe) || ' · ' || v_p.medio || ' · ' || to_char(v_p.fecha, 'DD/MM/YYYY'));
  return v_p.comprobante_path;
end;
$$;

-- Para el formulario: proveedores y eventos (aunque el usuario no tenga acceso a esas secciones).
create or replace function public.proveedores_para_solicitud()
returns table (id uuid, nombre text, alias_cbu text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.razon_social, p.alias_cbu from public.proveedores p
  where public.tiene_permiso('pagos', 'ver') and p.activo
  order by p.razon_social;
$$;

create or replace function public.eventos_para_solicitud()
returns table (id uuid, nombre text, fecha date, empresa text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.nombre, e.fecha, e.empresa from public.eventos e
  where public.tiene_permiso('pagos', 'ver') and e.estado <> 'cancelado'
  order by e.fecha desc;
$$;

-- Nombres de solicitantes y eventos para el listado (solo de las solicitudes que el usuario ve).
create or replace function public.datos_solicitudes_pago(p_ids uuid[])
returns table (id uuid, solicitante text, evento text, estado_por text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, sp.nombre, e.nombre, ep.nombre
  from public.solicitudes_pago s
  left join public.perfiles sp on sp.id = s.solicitado_por
  left join public.perfiles ep on ep.id = s.estado_por
  left join public.eventos e on e.id = s.evento_id
  where s.id = any (p_ids)
    and (public.tiene_permiso('pagos', 'editar') or (s.solicitado_por = auth.uid() and public.tiene_permiso('pagos', 'ver')));
$$;

create or replace function public.historial_solicitud_pago(p_id uuid)
returns table (accion text, detalle text, usuario text, creado_en timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select h.accion, h.detalle, pf.nombre, h.creado_en
  from public.solicitudes_pago_historial h
  join public.solicitudes_pago s on s.id = h.solicitud_id
  left join public.perfiles pf on pf.id = h.usuario_id
  where h.solicitud_id = p_id
    and (public.tiene_permiso('pagos', 'editar') or (s.solicitado_por = auth.uid() and public.tiene_permiso('pagos', 'ver')))
  order by h.creado_en;
$$;

revoke execute on function public.crear_solicitud_pago(jsonb) from public, anon;
revoke execute on function public.editar_solicitud_pago(uuid, jsonb) from public, anon;
revoke execute on function public.cambiar_estado_solicitud_pago(uuid, text, text) from public, anon;
revoke execute on function public.registrar_pago_solicitud(uuid, jsonb) from public, anon;
revoke execute on function public.quitar_pago_solicitud(uuid) from public, anon;
revoke execute on function public.proveedores_para_solicitud() from public, anon;
revoke execute on function public.eventos_para_solicitud() from public, anon;
revoke execute on function public.datos_solicitudes_pago(uuid[]) from public, anon;
revoke execute on function public.historial_solicitud_pago(uuid) from public, anon;
grant execute on function public.crear_solicitud_pago(jsonb) to authenticated;
grant execute on function public.editar_solicitud_pago(uuid, jsonb) to authenticated;
grant execute on function public.cambiar_estado_solicitud_pago(uuid, text, text) to authenticated;
grant execute on function public.registrar_pago_solicitud(uuid, jsonb) to authenticated;
grant execute on function public.quitar_pago_solicitud(uuid) to authenticated;
grant execute on function public.proveedores_para_solicitud() to authenticated;
grant execute on function public.eventos_para_solicitud() to authenticated;
grant execute on function public.datos_solicitudes_pago(uuid[]) to authenticated;
grant execute on function public.historial_solicitud_pago(uuid) to authenticated;

-- Comprobantes adjuntos (los sube el servidor después de verificar permisos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('solicitudes-pago', 'solicitudes-pago', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
