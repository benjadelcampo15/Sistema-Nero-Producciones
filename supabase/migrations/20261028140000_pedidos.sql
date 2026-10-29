-- Pedidos a mayoristas (proveedores). Un pedido va de borrador a enviado y,
-- cuando llega la mercadería, a recibido: ahí se graban las entradas de stock
-- en el depósito de entrega, con el precio como costo. Usa el permiso de Stock.

-- Quien maneja stock ve los proveedores y puede dar de alta un mayorista.
drop policy if exists "proveedores: ver desde stock" on public.proveedores;
create policy "proveedores: ver desde stock" on public.proveedores for select to authenticated
  using ((select public.tiene_permiso('stock', 'ver')));
drop policy if exists "proveedores: crear desde stock" on public.proveedores;
create policy "proveedores: crear desde stock" on public.proveedores for insert to authenticated
  with check ((select public.tiene_permiso('stock', 'editar')));

create table if not exists public.pedidos (
  id              uuid primary key default gen_random_uuid(),
  numero          bigint generated always as identity unique,
  proveedor_id    uuid not null references public.proveedores (id),
  deposito_id     uuid not null references public.depositos (id),
  fecha           date not null,
  fecha_entrega   date,
  estado          text not null default 'borrador' check (estado in ('borrador', 'enviado', 'recibido', 'cancelado')),
  notas           text,
  recibido_en     date,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create table if not exists public.pedido_items (
  id                 uuid primary key default gen_random_uuid(),
  pedido_id          uuid not null references public.pedidos (id) on delete cascade,
  orden              integer not null,
  producto_id        uuid not null references public.productos (id),
  cantidad           numeric(14, 3) not null check (cantidad > 0),
  precio_unitario    numeric(14, 2) check (precio_unitario is null or precio_unitario >= 0),
  cantidad_recibida  numeric(14, 3) check (cantidad_recibida is null or cantidad_recibida >= 0),
  unique (pedido_id, producto_id)
);

create index if not exists pedidos_estado_idx on public.pedidos (estado, fecha desc);
create index if not exists pedido_items_pedido_idx on public.pedido_items (pedido_id);
create index if not exists pedido_items_producto_idx on public.pedido_items (producto_id);

-- Las entradas de stock de un pedido recibido quedan vinculadas a él.
alter table public.movimientos_stock add column if not exists pedido_id uuid references public.pedidos (id);

drop trigger if exists pedidos_autoria on public.pedidos;
create trigger pedidos_autoria before insert or update on public.pedidos
  for each row execute function public.marcar_autoria();
drop trigger if exists pedidos_auditoria on public.pedidos;
create trigger pedidos_auditoria after insert or update or delete on public.pedidos
  for each row execute function public.registrar_auditoria();
drop trigger if exists pedido_items_auditoria on public.pedido_items;
create trigger pedido_items_auditoria after insert or update or delete on public.pedido_items
  for each row execute function public.registrar_auditoria();

alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security;

drop policy if exists "pedidos: ver" on public.pedidos;
create policy "pedidos: ver" on public.pedidos for select to authenticated
  using ((select public.tiene_permiso('stock', 'ver')));
drop policy if exists "pedidos: crear" on public.pedidos;
create policy "pedidos: crear" on public.pedidos for insert to authenticated
  with check ((select public.tiene_permiso('stock', 'editar')));
drop policy if exists "pedidos: editar" on public.pedidos;
create policy "pedidos: editar" on public.pedidos for update to authenticated
  using ((select public.tiene_permiso('stock', 'editar')))
  with check ((select public.tiene_permiso('stock', 'editar')));
-- Solo se borran los que nunca se recibieron.
drop policy if exists "pedidos: borrar" on public.pedidos;
create policy "pedidos: borrar" on public.pedidos for delete to authenticated
  using ((select public.tiene_permiso('stock', 'editar')) and estado <> 'recibido');

drop policy if exists "pedido items: ver" on public.pedido_items;
create policy "pedido items: ver" on public.pedido_items for select to authenticated
  using ((select public.tiene_permiso('stock', 'ver')));
drop policy if exists "pedido items: crear" on public.pedido_items;
create policy "pedido items: crear" on public.pedido_items for insert to authenticated
  with check ((select public.tiene_permiso('stock', 'editar')));
drop policy if exists "pedido items: editar" on public.pedido_items;
create policy "pedido items: editar" on public.pedido_items for update to authenticated
  using ((select public.tiene_permiso('stock', 'editar')))
  with check ((select public.tiene_permiso('stock', 'editar')));
drop policy if exists "pedido items: borrar" on public.pedido_items;
create policy "pedido items: borrar" on public.pedido_items for delete to authenticated
  using ((select public.tiene_permiso('stock', 'editar')));

revoke all on public.pedidos, public.pedido_items from anon;
revoke truncate on public.pedidos, public.pedido_items from authenticated;

-- Guardar un pedido (cabecera e ítems juntos). Solo mientras no se recibió ni canceló.
-- p_items: [{ producto_id, cantidad, precio_unitario? }]
create or replace function public.guardar_pedido(p_id uuid, p_pedido jsonb, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_id;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene productos';
  end if;

  if v_id is null then
    insert into public.pedidos (proveedor_id, deposito_id, fecha, fecha_entrega, estado, notas)
    values (
      (p_pedido ->> 'proveedor_id')::uuid,
      (p_pedido ->> 'deposito_id')::uuid,
      (p_pedido ->> 'fecha')::date,
      nullif(p_pedido ->> 'fecha_entrega', '')::date,
      p_pedido ->> 'estado',
      nullif(trim(p_pedido ->> 'notas'), '')
    )
    returning id into v_id;
  else
    update public.pedidos set
      proveedor_id = (p_pedido ->> 'proveedor_id')::uuid,
      deposito_id = (p_pedido ->> 'deposito_id')::uuid,
      fecha = (p_pedido ->> 'fecha')::date,
      fecha_entrega = nullif(p_pedido ->> 'fecha_entrega', '')::date,
      estado = p_pedido ->> 'estado',
      notas = nullif(trim(p_pedido ->> 'notas'), '')
    where id = v_id and estado in ('borrador', 'enviado');
    if not found then
      raise exception 'El pedido no existe o ya se recibió o canceló';
    end if;
    delete from public.pedido_items where pedido_id = v_id;
  end if;

  insert into public.pedido_items (pedido_id, orden, producto_id, cantidad, precio_unitario)
  select v_id, (o - 1)::integer, (i ->> 'producto_id')::uuid, (i ->> 'cantidad')::numeric, nullif(i ->> 'precio_unitario', '')::numeric
  from jsonb_array_elements(p_items) with ordinality as x(i, o);

  return v_id;
end
$$;

-- Recibir: graba las entradas de stock (lo que llegó, con su costo) y cierra el pedido.
-- p_items: [{ producto_id, cantidad_recibida, costo_unitario? }]
create or replace function public.recibir_pedido(p_id uuid, p_fecha date, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deposito uuid;
  v_numero bigint;
begin
  update public.pedidos set estado = 'recibido', recibido_en = p_fecha
  where id = p_id and estado in ('borrador', 'enviado')
  returning deposito_id, numero into v_deposito, v_numero;
  if not found then
    raise exception 'El pedido no existe o ya se recibió o canceló';
  end if;

  update public.pedido_items pi set cantidad_recibida = (i ->> 'cantidad_recibida')::numeric
  from jsonb_array_elements(p_items) i
  where pi.pedido_id = p_id and pi.producto_id = (i ->> 'producto_id')::uuid;

  insert into public.movimientos_stock (producto_id, deposito_id, tipo, cantidad, costo_unitario, fecha, motivo, pedido_id)
  select
    (i ->> 'producto_id')::uuid,
    v_deposito,
    'entrada',
    (i ->> 'cantidad_recibida')::numeric,
    nullif(i ->> 'costo_unitario', '')::numeric,
    p_fecha,
    'Pedido N° ' || v_numero,
    p_id
  from jsonb_array_elements(p_items) i
  where (i ->> 'cantidad_recibida')::numeric > 0;
end
$$;

revoke execute on function public.guardar_pedido(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_pedido(uuid, jsonb, jsonb) to authenticated;
revoke execute on function public.recibir_pedido(uuid, date, jsonb) from public, anon;
grant execute on function public.recibir_pedido(uuid, date, jsonb) to authenticated;
