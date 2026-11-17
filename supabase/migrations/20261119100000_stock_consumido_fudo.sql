-- Stock › Consumido: lo vendido en FUDO (consumo teórico) contra el consumo físico
-- cargado en Planix, por evento. Es control: NO descuenta stock ni toca Financiero.

-- Reporte de FUDO importado (cada carga es una versión, con su archivo original).
create table if not exists public.fudo_importaciones (
  id                  uuid primary key default gen_random_uuid(),
  empresa             text not null check (empresa in ('nero', 'ruta')),
  evento_id           uuid not null references public.eventos (id) on delete cascade,
  nombre_archivo      text not null,
  archivo             text,
  huella_archivo      text not null,
  desde               date,
  hasta               date,
  version             integer not null default 1,
  -- vigente: cuenta para la comparación; reemplazada / anulada: queda como historial.
  estado              text not null default 'vigente' check (estado in ('vigente', 'reemplazada', 'anulada')),
  reemplaza_a         uuid references public.fudo_importaciones (id),
  lineas              integer not null default 0,
  unidades            numeric(14, 3) not null default 0,
  monto               numeric(14, 2) not null default 0,
  -- Totales de la hoja "Ranking del período" (solo para validar; nunca se suman).
  ranking_unidades    numeric(14, 3),
  ranking_monto       numeric(14, 2),
  ranking             jsonb not null default '[]',
  descartadas         integer not null default 0 check (descartadas >= 0),  -- líneas del reporte que ya estaban en otra importación
  nota                text,
  creado_por          uuid references public.perfiles (id) default auth.uid(),
  creado_en           timestamptz not null default now(),
  estado_por          uuid references public.perfiles (id),
  estado_en           timestamptz
);
create index if not exists fudo_importaciones_evento_idx on public.fudo_importaciones (evento_id, estado);

-- Líneas de la hoja "Detalle" (la fuente de las ventas). La huella identifica la
-- misma venta en otra importación del evento (para no contarla dos veces).
create table if not exists public.fudo_lineas (
  id              uuid primary key default gen_random_uuid(),
  importacion_id  uuid not null references public.fudo_importaciones (id) on delete cascade,
  fecha           date,
  categoria       text,
  subcategoria    text,
  producto        text not null,
  clave           text not null,
  cantidad        numeric(14, 3) not null,
  monto           numeric(14, 2) not null default 0,
  cmv             numeric(14, 2),
  huella          text not null
);
create index if not exists fudo_lineas_importacion_idx on public.fudo_lineas (importacion_id);
create index if not exists fudo_lineas_huella_idx on public.fudo_lineas (huella);

-- Qué es cada producto de FUDO para el stock (por empresa): un producto, una
-- receta / combo (varios productos con sus cantidades) o algo que no es mercadería.
-- Sin configurar = pendiente (nunca se asocia solo).
create table if not exists public.fudo_productos (
  id              uuid primary key default gen_random_uuid(),
  empresa         text not null check (empresa in ('nero', 'ruta')),
  clave           text not null,
  nombre          text not null,
  categoria       text,
  tipo            text not null default 'receta' check (tipo in ('receta', 'ignorar')),
  nota            text,
  actualizado_por uuid references public.perfiles (id) default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  unique (empresa, clave)
);

-- Composición: cuánto de cada producto de stock consume UNA venta de FUDO (en la unidad del producto).
create table if not exists public.fudo_receta_items (
  id               uuid primary key default gen_random_uuid(),
  fudo_producto_id uuid not null references public.fudo_productos (id) on delete cascade,
  producto_id      uuid not null references public.productos (id),
  cantidad         numeric(14, 4) not null check (cantidad > 0),
  detalle          text,
  unique (fudo_producto_id, producto_id)
);

-- Consumo físico por evento y producto. Consumo = inicial + reposiciones − final.
-- Las mermas, roturas e invitaciones son la parte justificada (no se suman aparte).
create table if not exists public.consumo_fisico (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references public.eventos (id) on delete cascade,
  producto_id     uuid not null references public.productos (id),
  inicial         numeric(14, 3) not null default 0 check (inicial >= 0),
  reposiciones    numeric(14, 3) not null default 0 check (reposiciones >= 0),
  final           numeric(14, 3) not null default 0 check (final >= 0),
  mermas          numeric(14, 3) not null default 0 check (mermas >= 0),
  roturas         numeric(14, 3) not null default 0 check (roturas >= 0),
  invitaciones    numeric(14, 3) not null default 0 check (invitaciones >= 0),
  -- Corrección del consumo con autorización (administradores): manda sobre el cálculo.
  corregido       numeric(14, 3) check (corregido is null or corregido >= 0),
  motivo          text,
  nota            text,
  actualizado_por uuid references public.perfiles (id) default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  unique (evento_id, producto_id)
);

-- Tolerancias para las alertas (por empresa).
create table if not exists public.fudo_config (
  empresa          text primary key check (empresa in ('nero', 'ruta')),
  tolerancia_unid  numeric(14, 3) not null default 0 check (tolerancia_unid >= 0),
  tolerancia_pct   numeric(6, 2) not null default 0 check (tolerancia_pct >= 0)
);
insert into public.fudo_config (empresa) values ('nero'), ('ruta') on conflict do nothing;

create or replace function public.fudo_tocar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end
$$;
drop trigger if exists fudo_productos_tocar on public.fudo_productos;
create trigger fudo_productos_tocar before update on public.fudo_productos for each row execute function public.fudo_tocar();
drop trigger if exists consumo_fisico_tocar on public.consumo_fisico;
create trigger consumo_fisico_tocar before update on public.consumo_fisico for each row execute function public.fudo_tocar();

-- Solo un administrador corrige el consumo calculado.
create or replace function public.consumo_fisico_corregir()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.corregido is distinct from (case when tg_op = 'UPDATE' then old.corregido end) and not public.es_admin() then
    raise exception 'Solo un administrador puede corregir el consumo calculado';
  end if;
  if new.corregido is not null and coalesce(trim(new.motivo), '') = '' then
    raise exception 'La corrección necesita un motivo';
  end if;
  return new;
end
$$;
drop trigger if exists consumo_fisico_corregir on public.consumo_fisico;
create trigger consumo_fisico_corregir before insert or update on public.consumo_fisico for each row execute function public.consumo_fisico_corregir();

-- Auditoría (guarda los valores anteriores de cada cambio).
do $$
declare t text;
begin
  foreach t in array array['fudo_importaciones', 'fudo_productos', 'fudo_receta_items', 'consumo_fisico', 'fudo_config'] loop
    execute format('drop trigger if exists %1$s_auditoria on public.%1$s', t);
    execute format('create trigger %1$s_auditoria after insert or update or delete on public.%1$s for each row execute function public.registrar_auditoria()', t);
  end loop;
end $$;

-- ─── Permisos: Stock ver / editar ────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['fudo_importaciones', 'fudo_lineas', 'fudo_productos', 'fudo_receta_items', 'consumo_fisico', 'fudo_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format('create policy %1$s_ver on public.%1$s for select to authenticated using ((select public.tiene_permiso(''stock'', ''ver'')))', t);
    execute format('drop policy if exists %1$s_editar on public.%1$s', t);
    execute format('create policy %1$s_editar on public.%1$s for all to authenticated using ((select public.tiene_permiso(''stock'', ''editar''))) with check ((select public.tiene_permiso(''stock'', ''editar'')))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
-- Las líneas y las importaciones no se editan: se reemplazan o se anulan (queda el historial).
revoke update on public.fudo_lineas from authenticated;

-- Guarda una importación entera (y, si corresponde, deja la anterior como reemplazada) en una sola operación.
create or replace function public.fudo_importar(p jsonb, p_lineas jsonb, p_reemplaza uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_version int := 1;
  v_anterior public.fudo_importaciones;
begin
  if not public.tiene_permiso('stock', 'editar') then raise exception 'No tenés permiso para importar reportes'; end if;
  -- Una importación por evento a la vez (un doble clic no carga el reporte dos veces).
  perform pg_advisory_xact_lock(hashtext('fudo_importar:' || (p ->> 'evento_id')));
  -- El mismo archivo ya cargado y vigente en el evento: no se vuelve a sumar.
  if exists (select 1 from public.fudo_importaciones where evento_id = (p ->> 'evento_id')::uuid and huella_archivo = p ->> 'huella_archivo' and estado = 'vigente') then
    raise exception 'Este mismo archivo ya está importado en el evento';
  end if;
  if p_reemplaza is not null then
    select * into v_anterior from public.fudo_importaciones where id = p_reemplaza and evento_id = (p ->> 'evento_id')::uuid and estado = 'vigente' for update;
    if not found then raise exception 'La importación a reemplazar ya no está vigente'; end if;
    update public.fudo_importaciones set estado = 'reemplazada', estado_por = auth.uid(), estado_en = now() where id = p_reemplaza;
  end if;
  -- Versión correlativa dentro del evento (v1, v2, …), sea reemplazo o agregado.
  select coalesce(max(version), 0) + 1 into v_version from public.fudo_importaciones where evento_id = (p ->> 'evento_id')::uuid;
  insert into public.fudo_importaciones (empresa, evento_id, nombre_archivo, archivo, huella_archivo, desde, hasta, version, reemplaza_a, lineas, unidades, monto, ranking_unidades, ranking_monto, ranking, descartadas, nota)
  values (p ->> 'empresa', (p ->> 'evento_id')::uuid, p ->> 'nombre_archivo', nullif(p ->> 'archivo', ''), p ->> 'huella_archivo',
          -- El período sale de las líneas que realmente se guardan (con "solo las nuevas" puede ser más corto que el reporte).
          coalesce((select min(nullif(l ->> 'fecha', '')::date) from jsonb_array_elements(p_lineas) l), nullif(p ->> 'desde', '')::date),
          coalesce((select max(nullif(l ->> 'fecha', '')::date) from jsonb_array_elements(p_lineas) l), nullif(p ->> 'hasta', '')::date), v_version, p_reemplaza,
          jsonb_array_length(p_lineas), coalesce((select sum((l ->> 'cantidad')::numeric) from jsonb_array_elements(p_lineas) l), 0),
          coalesce((select sum((l ->> 'monto')::numeric) from jsonb_array_elements(p_lineas) l), 0),
          nullif(p ->> 'ranking_unidades', '')::numeric, nullif(p ->> 'ranking_monto', '')::numeric, coalesce(p -> 'ranking', '[]'), coalesce((p ->> 'descartadas')::int, 0), nullif(p ->> 'nota', ''))
  returning id into v_id;
  insert into public.fudo_lineas (importacion_id, fecha, categoria, subcategoria, producto, clave, cantidad, monto, cmv, huella)
  select v_id, nullif(l ->> 'fecha', '')::date, nullif(l ->> 'categoria', ''), nullif(l ->> 'subcategoria', ''), l ->> 'producto', l ->> 'clave',
         (l ->> 'cantidad')::numeric, coalesce((l ->> 'monto')::numeric, 0), nullif(l ->> 'cmv', '')::numeric, l ->> 'huella'
  from jsonb_array_elements(p_lineas) l;
  -- Los productos nuevos de FUDO quedan pendientes de configurar (sin asociar a nada).
  insert into public.fudo_productos (empresa, clave, nombre, categoria)
  select distinct on (l ->> 'clave') p ->> 'empresa', l ->> 'clave', l ->> 'producto', nullif(l ->> 'categoria', '')
  from jsonb_array_elements(p_lineas) l
  on conflict (empresa, clave) do nothing;
  return v_id;
end
$$;
revoke execute on function public.fudo_importar(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.fudo_importar(jsonb, jsonb, uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('fudo', 'fudo', false, 15728640)
on conflict (id) do nothing;
