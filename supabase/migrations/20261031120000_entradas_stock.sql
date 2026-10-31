-- Entradas de stock con varios productos (ej.: llega la mercadería de un
-- proveedor). Igual que las salidas: la entrada es la cabecera (fecha,
-- depósito, evento) y cada producto es un movimiento de entrada vinculado,
-- con su cantidad y su costo.

create table if not exists public.entradas_stock (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  deposito_id  uuid not null references public.depositos (id),
  evento_id    uuid references public.eventos (id),
  motivo       text,
  creado_por   uuid references public.perfiles (id),
  creado_en    timestamptz not null default now()
);

create index if not exists entradas_stock_fecha_idx on public.entradas_stock (fecha desc, creado_en desc);

alter table public.movimientos_stock
  add column if not exists entrada_id uuid references public.entradas_stock (id);

create index if not exists movimientos_stock_entrada_idx on public.movimientos_stock (entrada_id) where entrada_id is not null;

drop trigger if exists entradas_stock_marcar on public.entradas_stock;
create trigger entradas_stock_marcar before insert on public.entradas_stock
  for each row execute function public.marcar_movimiento_stock();
drop trigger if exists entradas_stock_auditoria on public.entradas_stock;
create trigger entradas_stock_auditoria after insert or update or delete on public.entradas_stock
  for each row execute function public.registrar_auditoria();

alter table public.entradas_stock enable row level security;

drop policy if exists "entradas_stock: ver" on public.entradas_stock;
create policy "entradas_stock: ver" on public.entradas_stock for select to authenticated
  using ((select public.tiene_permiso('stock', 'ver')));
drop policy if exists "entradas_stock: crear" on public.entradas_stock;
create policy "entradas_stock: crear" on public.entradas_stock for insert to authenticated
  with check ((select public.tiene_permiso('stock', 'editar')));

-- Como los movimientos: no se editan ni se borran (se corrige con un ajuste).
revoke all on public.entradas_stock from anon;
revoke update, delete, truncate on public.entradas_stock from authenticated;

-- Cabecera y productos juntos: o se graba toda la entrada o nada.
-- p_lineas: [{ producto_id, cantidad (positiva), costo_unitario? }]
create or replace function public.registrar_entrada_stock(p_entrada jsonb, p_lineas jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if jsonb_array_length(p_lineas) = 0 then
    raise exception 'La entrada no tiene productos';
  end if;

  insert into public.entradas_stock (fecha, deposito_id, evento_id, motivo)
  values (
    (p_entrada ->> 'fecha')::date,
    (p_entrada ->> 'deposito_id')::uuid,
    nullif(p_entrada ->> 'evento_id', '')::uuid,
    nullif(trim(p_entrada ->> 'motivo'), '')
  )
  returning id into v_id;

  insert into public.movimientos_stock (
    producto_id, deposito_id, tipo, cantidad, costo_unitario, fecha, motivo, evento_id, entrada_id
  )
  select
    (l ->> 'producto_id')::uuid,
    (p_entrada ->> 'deposito_id')::uuid,
    'entrada',
    (l ->> 'cantidad')::numeric,
    nullif(l ->> 'costo_unitario', '')::numeric,
    (p_entrada ->> 'fecha')::date,
    nullif(trim(p_entrada ->> 'motivo'), ''),
    nullif(p_entrada ->> 'evento_id', '')::uuid,
    v_id
  from jsonb_array_elements(p_lineas) l;

  return v_id;
end
$$;

revoke execute on function public.registrar_entrada_stock(jsonb, jsonb) from public, anon;
grant execute on function public.registrar_entrada_stock(jsonb, jsonb) to authenticated;
