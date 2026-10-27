-- Objetivos de Ruta (planilla RUTA 2026).
--   · Enero a septiembre 2026: modo "historico", una foto de la planilla tal cual
--     (filas, totales y repartos de cada pestaña) con observaciones para revisar.
--   · Desde octubre 2026: modo "automatico". Cada mes guarda sus propios datos
--     (fees por cliente, porcentajes de colaboradores, gastos, one shots y
--     porcentajes de reparto), así un cambio futuro no modifica meses anteriores.
--     Los impuestos, sueldos, resultados y repartos se calculan en la app; la
--     rentabilidad variable sale del balance de los eventos de Ruta del mes.

create table if not exists public.ruta_clientes (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null unique check (length(trim(nombre)) > 0),
  -- De baja: no se agrega a los meses nuevos; los meses donde estaba lo conservan.
  activo          boolean not null default true,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create table if not exists public.ruta_colaboradores (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null unique check (length(trim(nombre)) > 0),
  activo          boolean not null default true,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create table if not exists public.ruta_meses (
  id                 uuid primary key default gen_random_uuid(),
  periodo            text not null unique check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  modo               text not null check (modo in ('historico', 'automatico')),
  datos              jsonb not null default '{}',
  -- Mes cerrado: no se edita y la rentabilidad variable queda con los balances de eventos al cierre.
  cerrado            boolean not null default false,
  eventos_al_cierre  jsonb,
  creado_por         uuid references public.perfiles (id),
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['ruta_clientes', 'ruta_colaboradores', 'ruta_meses'] loop
    execute format('drop trigger if exists %1$s_autoria on public.%1$s', t);
    execute format('create trigger %1$s_autoria before insert or update on public.%1$s for each row execute function public.marcar_autoria()', t);
    execute format('drop trigger if exists %1$s_auditoria on public.%1$s', t);
    execute format('create trigger %1$s_auditoria after insert or update or delete on public.%1$s for each row execute function public.registrar_auditoria()', t);
    execute format('alter table public.%s enable row level security', t);
    execute format('drop policy if exists "%1$s: ver" on public.%1$s', t);
    execute format('create policy "%1$s: ver" on public.%1$s for select to authenticated using ((select public.tiene_permiso(''objetivos'', ''ver'')))', t);
    execute format('drop policy if exists "%1$s: crear" on public.%1$s', t);
    execute format('create policy "%1$s: crear" on public.%1$s for insert to authenticated with check ((select public.tiene_permiso(''objetivos'', ''editar'')))', t);
    execute format('drop policy if exists "%1$s: editar" on public.%1$s', t);
    execute format('create policy "%1$s: editar" on public.%1$s for update to authenticated using ((select public.tiene_permiso(''objetivos'', ''editar''))) with check ((select public.tiene_permiso(''objetivos'', ''editar'')))', t);
    execute format('revoke all on public.%s from anon', t);
    execute format('revoke delete, truncate on public.%s from authenticated', t);
  end loop;
end
$$;
