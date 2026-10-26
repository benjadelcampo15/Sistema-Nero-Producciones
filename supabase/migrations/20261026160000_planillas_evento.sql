-- Planilla de cada evento (replica la planilla de eventos en Excel): resumen,
-- ingresos, gastos por sector con seña y diferencia, y entradas. Se guarda como
-- un documento por evento; los totales se calculan en la app. Es propia del
-- evento: no genera movimientos en Financiero.

create table if not exists public.planillas_evento (
  evento_id       uuid primary key references public.eventos (id) on delete cascade,
  datos           jsonb not null default '{}',
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

drop trigger if exists planillas_evento_autoria on public.planillas_evento;
create trigger planillas_evento_autoria before insert or update on public.planillas_evento
  for each row execute function public.marcar_autoria();
drop trigger if exists planillas_evento_auditoria on public.planillas_evento;
create trigger planillas_evento_auditoria after insert or update or delete on public.planillas_evento
  for each row execute function public.registrar_auditoria();

alter table public.planillas_evento enable row level security;

drop policy if exists "planilla evento: ver" on public.planillas_evento;
create policy "planilla evento: ver" on public.planillas_evento for select to authenticated
  using ((select public.tiene_permiso('eventos', 'ver')));
drop policy if exists "planilla evento: crear" on public.planillas_evento;
create policy "planilla evento: crear" on public.planillas_evento for insert to authenticated
  with check ((select public.tiene_permiso('eventos', 'editar')));
drop policy if exists "planilla evento: editar" on public.planillas_evento;
create policy "planilla evento: editar" on public.planillas_evento for update to authenticated
  using ((select public.tiene_permiso('eventos', 'editar')))
  with check ((select public.tiene_permiso('eventos', 'editar')));

revoke all on public.planillas_evento from anon;
revoke delete, truncate on public.planillas_evento from authenticated;
