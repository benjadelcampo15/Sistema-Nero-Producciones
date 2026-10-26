-- Objetivos: análisis mensual de rentabilidad (replica la planilla de
-- objetivos). Cada mes guarda sus listas como un documento:
-- { fees, eventos, salarios, creators, fijos, variables: [{ detalle, monto, nota? }],
--   distribucion: [{ detalle, porcentaje }], notas }
-- Los totales, ratios y la rentabilidad anual se calculan en la app.

create table if not exists public.objetivos_meses (
  id              uuid primary key default gen_random_uuid(),
  anio            integer not null check (anio between 2000 and 2100),
  mes             integer not null check (mes between 1 and 12),
  datos           jsonb not null default '{}',
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  unique (anio, mes)
);

drop trigger if exists objetivos_meses_autoria on public.objetivos_meses;
create trigger objetivos_meses_autoria before insert or update on public.objetivos_meses
  for each row execute function public.marcar_autoria();
drop trigger if exists objetivos_meses_auditoria on public.objetivos_meses;
create trigger objetivos_meses_auditoria after insert or update or delete on public.objetivos_meses
  for each row execute function public.registrar_auditoria();

alter table public.objetivos_meses enable row level security;

drop policy if exists "objetivos: ver" on public.objetivos_meses;
create policy "objetivos: ver" on public.objetivos_meses for select to authenticated
  using ((select public.tiene_permiso('objetivos', 'ver')));
drop policy if exists "objetivos: crear" on public.objetivos_meses;
create policy "objetivos: crear" on public.objetivos_meses for insert to authenticated
  with check ((select public.tiene_permiso('objetivos', 'editar')));
drop policy if exists "objetivos: editar" on public.objetivos_meses;
create policy "objetivos: editar" on public.objetivos_meses for update to authenticated
  using ((select public.tiene_permiso('objetivos', 'editar')))
  with check ((select public.tiene_permiso('objetivos', 'editar')));

revoke all on public.objetivos_meses from anon;
revoke delete, truncate on public.objetivos_meses from authenticated;
