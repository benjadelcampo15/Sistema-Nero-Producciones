-- Cheques emitidos (los que paga la empresa) y recibidos (los que cobra).
-- Un aviso diario por mail avisa los pendientes que vencen en 2 días o menos;
-- aviso_enviado_en evita mandar el mismo aviso dos veces.

create type public.tipo_cheque as enum ('emitido', 'recibido');
-- emitido: pendiente → debitado | anulado | rechazado
-- recibido: pendiente (en cartera) → depositado → cobrado | endosado | rechazado
create type public.estado_cheque as enum ('pendiente', 'depositado', 'cobrado', 'debitado', 'endosado', 'rechazado', 'anulado');

create table public.cheques (
  id                uuid primary key default gen_random_uuid(),
  tipo              public.tipo_cheque not null,
  estado            public.estado_cheque not null default 'pendiente',
  electronico       boolean not null default false,
  numero            text,
  banco             text,
  monto             numeric(14, 2) not null check (monto > 0),
  fecha_emision     date,
  fecha_pago        date not null,
  -- Emitido: a quién se le pagó. Recibido: quién lo dio (cliente / librador).
  contraparte       text not null check (length(trim(contraparte)) > 0),
  cuit              text,
  evento_id         uuid references public.eventos (id),
  notas             text,
  aviso_enviado_en  timestamptz,
  creado_por        uuid references public.perfiles (id),
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

create index cheques_tipo_fecha_idx on public.cheques (tipo, fecha_pago);
create index cheques_avisos_idx on public.cheques (fecha_pago) where estado = 'pendiente' and aviso_enviado_en is null;

create trigger cheques_autoria
  before insert or update on public.cheques
  for each row execute function public.marcar_autoria();
create trigger cheques_auditoria
  after insert or update or delete on public.cheques
  for each row execute function public.registrar_auditoria();

alter table public.cheques enable row level security;

create policy "cheques: ver" on public.cheques for select to authenticated
  using ((select public.tiene_permiso('cheques', 'ver')));
create policy "cheques: crear" on public.cheques for insert to authenticated
  with check ((select public.tiene_permiso('cheques', 'editar')));
create policy "cheques: editar" on public.cheques for update to authenticated
  using ((select public.tiene_permiso('cheques', 'editar')))
  with check ((select public.tiene_permiso('cheques', 'editar')));
-- Borrar solo para cargas equivocadas; lo normal es anularlo.
create policy "cheques: borrar" on public.cheques for delete to authenticated
  using ((select public.tiene_permiso('cheques', 'editar')));

revoke all on public.cheques from anon;
revoke truncate on public.cheques from authenticated;
