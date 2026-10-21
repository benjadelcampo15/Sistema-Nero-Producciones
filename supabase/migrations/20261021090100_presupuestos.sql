-- Fase 8: Presupuestos para clientes.
--
-- El cliente ve su presupuesto por un link público con token (sin usuario).
-- Esa vista la arma el servidor con la clave secreta buscando por token, así
-- que la tabla no tiene políticas para usuarios anónimos.

create type public.estado_presupuesto as enum ('borrador', 'enviado', 'aceptado', 'rechazado');
create type public.modo_iva as enum ('mas_iva', 'iva_incluido', 'sin_iva');

create table public.presupuestos (
  id                  uuid primary key default gen_random_uuid(),
  numero              bigint generated always as identity unique,
  token               text not null unique,
  estado              public.estado_presupuesto not null default 'borrador',
  fecha               date not null default current_date,
  validez_dias        integer not null default 15 check (validez_dias between 1 and 365),
  -- Cliente
  cliente_nombre      text not null check (length(trim(cliente_nombre)) > 0),
  cliente_cuit        text,
  cliente_contacto    text,
  cliente_email       text,
  cliente_telefono    text,
  -- Evento
  evento_nombre       text,
  evento_fecha        date,
  evento_lugar        text,
  invitados           integer check (invitados is null or invitados >= 0),
  -- Ítems: [{ rubro, descripcion, cantidad, precio, costo }]
  items               jsonb not null default '[]',
  modo_iva            public.modo_iva not null default 'mas_iva',
  descuento_pct       numeric(5, 2) not null default 0 check (descuento_pct between 0 and 100),
  forma_pago          text,
  incluye             text,
  observaciones       text,
  -- Seguimiento
  enviado_en          timestamptz,
  visto_en            timestamptz,
  respondido_en       timestamptz,
  respondido_por      text,
  evento_id           uuid references public.eventos (id),
  creado_por          uuid references public.perfiles (id),
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

create index presupuestos_creado_idx on public.presupuestos (creado_en desc);

create trigger presupuestos_autoria
  before insert or update on public.presupuestos
  for each row execute function public.marcar_autoria();
create trigger presupuestos_auditoria
  after insert or update or delete on public.presupuestos
  for each row execute function public.registrar_auditoria();

alter table public.presupuestos enable row level security;

create policy "presupuestos: ver" on public.presupuestos for select to authenticated
  using ((select public.tiene_permiso('presupuestos', 'ver')));
create policy "presupuestos: crear" on public.presupuestos for insert to authenticated
  with check ((select public.tiene_permiso('presupuestos', 'editar')));
create policy "presupuestos: editar" on public.presupuestos for update to authenticated
  using ((select public.tiene_permiso('presupuestos', 'editar')))
  with check ((select public.tiene_permiso('presupuestos', 'editar')));

revoke all on public.presupuestos from anon;
revoke delete, truncate on public.presupuestos from authenticated;
