-- Entradas y liquidación Isidris (por evento, opcional): se cargan las entradas
-- vendidas por categoría y se calcula cuánto le toca a cada socio. Es solo una
-- liquidación: no crea ingresos ni pagos en Financiero.
--
-- Por categoría: base = valor − corona − degus − gastro; Isidris = base × % Isidris
-- + gastro; Nero = el resto (base × % Nero + corona + degus). Comida y parking
-- van enteros a Isidris.

-- Que el evento tenga fila acá significa que la sección está activada.
create table public.liquidacion_evento (
  evento_id       uuid primary key references public.eventos (id) on delete cascade,
  -- Parte de la base que es de Nero (el resto es de Isidris).
  pct_nero        numeric(5, 2) not null default 85 check (pct_nero between 0 and 100),
  comida          boolean not null default false,
  parking         boolean not null default false,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create table public.liquidacion_categorias (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references public.liquidacion_evento (evento_id) on delete cascade,
  seccion         text not null check (seccion in ('entradas', 'comida', 'parking')),
  nombre          text not null check (length(trim(nombre)) between 1 and 80),
  -- Precio por entrada (o por unidad, en comida y parking).
  valor           numeric(14, 2) not null default 0 check (valor >= 0),
  -- En entradas (no en paquetes). Opcional.
  stock           integer check (stock >= 0),
  -- Lo que se carga: paquetes vendidos. Entradas = cantidad × multiplicador.
  cantidad        integer not null default 0 check (cantidad >= 0),
  multiplicador   integer not null default 1 check (multiplicador between 1 and 100),
  corona          numeric(14, 2) not null default 0 check (corona >= 0),
  degus           numeric(14, 2) not null default 0 check (degus >= 0),
  gastro          numeric(14, 2) not null default 0 check (gastro >= 0),
  -- Desactivada: no se vende más, pero lo vendido sigue contando.
  activa          boolean not null default true,
  orden           integer not null default 0,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create index liquidacion_categorias_evento_idx on public.liquidacion_categorias (evento_id, seccion, orden);

do $$
declare t text;
begin
  foreach t in array array['liquidacion_evento', 'liquidacion_categorias'] loop
    execute format('create trigger %1$s_autoria before insert or update on public.%1$s for each row execute function public.marcar_autoria()', t);
    execute format('create trigger %1$s_auditoria after insert or update or delete on public.%1$s for each row execute function public.registrar_auditoria()', t);
    execute format('alter table public.%s enable row level security', t);
    execute format('create policy "%1$s: ver" on public.%1$s for select to authenticated using ((select public.tiene_permiso(''eventos'', ''ver'')))', t);
    execute format('create policy "%1$s: crear" on public.%1$s for insert to authenticated with check ((select public.tiene_permiso(''eventos'', ''editar'')))', t);
    execute format('create policy "%1$s: editar" on public.%1$s for update to authenticated using ((select public.tiene_permiso(''eventos'', ''editar''))) with check ((select public.tiene_permiso(''eventos'', ''editar'')))', t);
    execute format('create policy "%1$s: borrar" on public.%1$s for delete to authenticated using ((select public.tiene_permiso(''eventos'', ''editar'')))', t);
    execute format('revoke all on public.%s from anon', t);
    execute format('revoke truncate on public.%s from authenticated', t);
  end loop;
end
$$;

-- Suma ventas nuevas a lo ya cargado en una sola operación (dos personas cargando a la vez no se pisan).
create or replace function public.sumar_liquidacion(p_id uuid, p_cantidad integer)
returns integer
language sql
security invoker
set search_path = ''
as $$
  update public.liquidacion_categorias
     set cantidad = cantidad + p_cantidad
   where id = p_id
     and cantidad + p_cantidad >= 0
  returning cantidad;
$$;

revoke all on function public.sumar_liquidacion(uuid, integer) from public, anon;
grant execute on function public.sumar_liquidacion(uuid, integer) to authenticated;
