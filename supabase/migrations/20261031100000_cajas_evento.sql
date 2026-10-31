-- Cierre de cajas de cada evento.
--
-- Cada caja (Barra 1, Barra 2, Entrada…) tiene el monto inicial (cambio), lo
-- que dice Fudo que se vendió en efectivo y, al cerrar, el efectivo contado:
-- el total o billete por billete. El cruce es: contado − (inicial + Fudo).

create table public.cajas_evento (
  id               uuid primary key default gen_random_uuid(),
  evento_id        uuid not null references public.eventos (id) on delete cascade,
  nombre           text not null check (length(trim(nombre)) between 1 and 60),
  responsable      text,
  monto_inicial    numeric(14, 2) not null default 0 check (monto_inicial >= 0),
  monto_fudo       numeric(14, 2) check (monto_fudo is null or monto_fudo >= 0),
  -- Efectivo contado al cierre; si se contó por billetes, es la suma de "billetes".
  efectivo_final   numeric(14, 2) check (efectivo_final is null or efectivo_final >= 0),
  -- { "20000": 3, "10000": 12, … } (denominación → cantidad), o null si se cargó el total.
  billetes         jsonb,
  notas            text,
  cerrada_en       timestamptz,
  orden            integer not null default 0,
  creado_por       uuid references public.perfiles (id),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

create index cajas_evento_evento_idx on public.cajas_evento (evento_id, orden);

create trigger cajas_evento_autoria before insert or update on public.cajas_evento
  for each row execute function public.marcar_autoria();
create trigger cajas_evento_auditoria after insert or update or delete on public.cajas_evento
  for each row execute function public.registrar_auditoria();

alter table public.cajas_evento enable row level security;

create policy "cajas_evento: ver" on public.cajas_evento for select to authenticated
  using ((select public.tiene_permiso('eventos', 'ver')));
create policy "cajas_evento: crear" on public.cajas_evento for insert to authenticated
  with check ((select public.tiene_permiso('eventos', 'editar')));
create policy "cajas_evento: editar" on public.cajas_evento for update to authenticated
  using ((select public.tiene_permiso('eventos', 'editar')))
  with check ((select public.tiene_permiso('eventos', 'editar')));
create policy "cajas_evento: borrar" on public.cajas_evento for delete to authenticated
  using ((select public.tiene_permiso('eventos', 'editar')));

revoke all on public.cajas_evento from anon;
revoke truncate on public.cajas_evento from authenticated;
