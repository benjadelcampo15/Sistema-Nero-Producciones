-- Salidas de stock con varios productos (ej.: el conteo de la barra al final
-- de un evento). La salida es la cabecera (fecha, depósito, evento) y cada
-- producto es un movimiento de salida vinculado, con el costo del momento.
-- En el conteo se guarda lo que había y lo que se contó; la salida es la diferencia.

create table if not exists public.salidas_stock (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  deposito_id  uuid not null references public.depositos (id),
  evento_id    uuid references public.eventos (id),
  modo         text not null default 'conteo' check (modo in ('conteo', 'cantidad')),
  motivo       text,
  creado_por   uuid references public.perfiles (id),
  creado_en    timestamptz not null default now()
);

create index if not exists salidas_stock_fecha_idx on public.salidas_stock (fecha desc, creado_en desc);

alter table public.movimientos_stock
  add column if not exists salida_id uuid references public.salidas_stock (id),
  add column if not exists stock_inicial numeric(14, 3),
  add column if not exists stock_contado numeric(14, 3);

create index if not exists movimientos_stock_salida_idx on public.movimientos_stock (salida_id) where salida_id is not null;

drop trigger if exists salidas_stock_marcar on public.salidas_stock;
create trigger salidas_stock_marcar before insert on public.salidas_stock
  for each row execute function public.marcar_movimiento_stock();
drop trigger if exists salidas_stock_auditoria on public.salidas_stock;
create trigger salidas_stock_auditoria after insert or update or delete on public.salidas_stock
  for each row execute function public.registrar_auditoria();

alter table public.salidas_stock enable row level security;

drop policy if exists "salidas_stock: ver" on public.salidas_stock;
create policy "salidas_stock: ver" on public.salidas_stock for select to authenticated
  using ((select public.tiene_permiso('stock', 'ver')));
drop policy if exists "salidas_stock: crear" on public.salidas_stock;
create policy "salidas_stock: crear" on public.salidas_stock for insert to authenticated
  with check ((select public.tiene_permiso('stock', 'editar')));

-- Como los movimientos: no se editan ni se borran (se corrige con un ajuste).
revoke all on public.salidas_stock from anon;
revoke update, delete, truncate on public.salidas_stock from authenticated;

-- Cabecera y productos juntos: o se graba toda la salida o nada.
-- p_lineas: [{ producto_id, cantidad (positiva: lo que salió), costo_unitario?, stock_inicial?, stock_contado? }]
create or replace function public.registrar_salida_stock(p_salida jsonb, p_lineas jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if jsonb_array_length(p_lineas) = 0 then
    raise exception 'La salida no tiene productos';
  end if;

  insert into public.salidas_stock (fecha, deposito_id, evento_id, modo, motivo)
  values (
    (p_salida ->> 'fecha')::date,
    (p_salida ->> 'deposito_id')::uuid,
    nullif(p_salida ->> 'evento_id', '')::uuid,
    p_salida ->> 'modo',
    nullif(trim(p_salida ->> 'motivo'), '')
  )
  returning id into v_id;

  insert into public.movimientos_stock (
    producto_id, deposito_id, tipo, cantidad, costo_unitario, fecha, motivo, evento_id, salida_id, stock_inicial, stock_contado
  )
  select
    (l ->> 'producto_id')::uuid,
    (p_salida ->> 'deposito_id')::uuid,
    'salida',
    -((l ->> 'cantidad')::numeric),
    nullif(l ->> 'costo_unitario', '')::numeric,
    (p_salida ->> 'fecha')::date,
    nullif(trim(p_salida ->> 'motivo'), ''),
    nullif(p_salida ->> 'evento_id', '')::uuid,
    v_id,
    nullif(l ->> 'stock_inicial', '')::numeric,
    nullif(l ->> 'stock_contado', '')::numeric
  from jsonb_array_elements(p_lineas) l;

  return v_id;
end
$$;

revoke execute on function public.registrar_salida_stock(jsonb, jsonb) from public, anon;
grant execute on function public.registrar_salida_stock(jsonb, jsonb) to authenticated;
