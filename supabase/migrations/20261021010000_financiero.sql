-- Fase 2: Financiero (categorías, eventos y transacciones).
--
-- Una sola tabla de transacciones: un movimiento de un evento es una
-- transacción con evento_id. Financiero las ve todas; cada evento, las suyas.
-- Las escrituras se hacen con la sesión del usuario (RLS) para que la
-- auditoría registre quién hizo cada cambio.

-- ─── Tipos ────────────────────────────────────────────────────────────────
create type public.tipo_movimiento as enum ('ingreso', 'egreso');
create type public.medio_pago as enum ('efectivo', 'transferencia', 'tarjeta', 'mercado_pago', 'cheque', 'otro');
create type public.estado_evento as enum ('planificado', 'en_curso', 'cerrado', 'cancelado');

-- ─── Tablas ───────────────────────────────────────────────────────────────
create table public.categorias (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(trim(nombre)) > 0),
  tipo       public.tipo_movimiento not null,
  activa     boolean not null default true,
  creado_en  timestamptz not null default now(),
  unique (nombre, tipo)
);

create table public.eventos (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null check (length(trim(nombre)) > 0),
  fecha           date not null,
  lugar           text,
  estado          public.estado_evento not null default 'planificado',
  presupuesto     numeric(14, 2) check (presupuesto is null or presupuesto >= 0),
  notas           text,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create table public.transacciones (
  id              uuid primary key default gen_random_uuid(),
  tipo            public.tipo_movimiento not null,
  monto           numeric(14, 2) not null check (monto > 0),
  fecha           date not null,
  descripcion     text not null check (length(trim(descripcion)) > 0),
  categoria_id    uuid not null references public.categorias (id),
  evento_id       uuid references public.eventos (id),
  contraparte     text,
  medio_pago      public.medio_pago not null default 'transferencia',
  notas           text,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  -- Los movimientos no se borran (requisito contable): se marcan.
  eliminado_en    timestamptz,
  eliminado_por   uuid references public.perfiles (id)
);

create index transacciones_fecha_idx on public.transacciones (fecha desc) where eliminado_en is null;
create index transacciones_evento_idx on public.transacciones (evento_id) where eliminado_en is null;
create index transacciones_categoria_idx on public.transacciones (categoria_id);
create index eventos_fecha_idx on public.eventos (fecha desc);

-- La categoría tiene que ser del mismo tipo que el movimiento.
create function public.validar_categoria_transaccion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.categorias where id = new.categoria_id and tipo = new.tipo
  ) then
    raise exception 'La categoría no corresponde a un %', new.tipo;
  end if;
  return new;
end
$$;

create trigger transacciones_validar_categoria
  before insert or update of tipo, categoria_id on public.transacciones
  for each row execute function public.validar_categoria_transaccion();

-- creado_por lo pone la base (no se confía en el cliente) y no se puede cambiar.
create function public.marcar_autoria()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    new.creado_en := now();
  else
    new.creado_por := old.creado_por;
    new.creado_en := old.creado_en;
  end if;
  new.actualizado_en := now();
  return new;
end
$$;

create trigger transacciones_autoria
  before insert or update on public.transacciones
  for each row execute function public.marcar_autoria();

create trigger eventos_autoria
  before insert or update on public.eventos
  for each row execute function public.marcar_autoria();

-- Una transacción eliminada no se puede editar ni "des-eliminar".
create function public.proteger_eliminadas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.eliminado_en is not null then
    raise exception 'El movimiento está eliminado y no se puede modificar';
  end if;
  if new.eliminado_en is not null then
    new.eliminado_por := auth.uid();
  end if;
  return new;
end
$$;

create trigger transacciones_proteger_eliminadas
  before update on public.transacciones
  for each row execute function public.proteger_eliminadas();

-- ─── Auditoría ────────────────────────────────────────────────────────────
create trigger categorias_auditoria
  after insert or update or delete on public.categorias
  for each row execute function public.registrar_auditoria();

create trigger eventos_auditoria
  after insert or update or delete on public.eventos
  for each row execute function public.registrar_auditoria();

create trigger transacciones_auditoria
  after insert or update or delete on public.transacciones
  for each row execute function public.registrar_auditoria();

-- ─── Row Level Security ───────────────────────────────────────────────────
alter table public.categorias    enable row level security;
alter table public.eventos       enable row level security;
alter table public.transacciones enable row level security;

-- Categorías: las ve quien ve Financiero o Eventos; las administra quien edita Financiero.
create policy "categorias: ver"
  on public.categorias for select to authenticated
  using ((select public.tiene_permiso('financiero', 'ver')) or (select public.tiene_permiso('eventos', 'ver')));

create policy "categorias: crear"
  on public.categorias for insert to authenticated
  with check ((select public.tiene_permiso('financiero', 'editar')));

create policy "categorias: editar"
  on public.categorias for update to authenticated
  using ((select public.tiene_permiso('financiero', 'editar')))
  with check ((select public.tiene_permiso('financiero', 'editar')));

-- Eventos: Financiero los necesita para asociar movimientos.
create policy "eventos: ver"
  on public.eventos for select to authenticated
  using ((select public.tiene_permiso('eventos', 'ver')) or (select public.tiene_permiso('financiero', 'ver')));

create policy "eventos: crear"
  on public.eventos for insert to authenticated
  with check ((select public.tiene_permiso('eventos', 'editar')));

create policy "eventos: editar"
  on public.eventos for update to authenticated
  using ((select public.tiene_permiso('eventos', 'editar')))
  with check ((select public.tiene_permiso('eventos', 'editar')));

-- Transacciones: Financiero ve y edita todas; Eventos, las que tienen evento.
create policy "transacciones: ver"
  on public.transacciones for select to authenticated
  using (
    (select public.tiene_permiso('financiero', 'ver'))
    or (evento_id is not null and (select public.tiene_permiso('eventos', 'ver')))
  );

create policy "transacciones: crear"
  on public.transacciones for insert to authenticated
  with check (
    (select public.tiene_permiso('financiero', 'editar'))
    or (evento_id is not null and (select public.tiene_permiso('eventos', 'editar')))
  );

create policy "transacciones: editar"
  on public.transacciones for update to authenticated
  using (
    (select public.tiene_permiso('financiero', 'editar'))
    or (evento_id is not null and (select public.tiene_permiso('eventos', 'editar')))
  )
  with check (
    (select public.tiene_permiso('financiero', 'editar'))
    or (evento_id is not null and (select public.tiene_permiso('eventos', 'editar')))
  );

-- Sin DELETE: nada se borra físicamente.
revoke all on public.categorias, public.eventos, public.transacciones from anon;
revoke delete, truncate on public.categorias, public.eventos, public.transacciones from authenticated;

-- ─── Categorías iniciales ─────────────────────────────────────────────────
insert into public.categorias (nombre, tipo) values
  ('Venta de entradas', 'ingreso'),
  ('Barra', 'ingreso'),
  ('Sponsors', 'ingreso'),
  ('Servicios de producción', 'ingreso'),
  ('Otros ingresos', 'ingreso'),
  ('Artistas y cachets', 'egreso'),
  ('Sonido e iluminación', 'egreso'),
  ('Alquiler de lugar', 'egreso'),
  ('Personal', 'egreso'),
  ('Seguridad', 'egreso'),
  ('Publicidad y difusión', 'egreso'),
  ('Transporte y logística', 'egreso'),
  ('Catering', 'egreso'),
  ('Impuestos y tasas', 'egreso'),
  ('Gastos administrativos', 'egreso'),
  ('Otros gastos', 'egreso');
