-- Stock por evento: los productos que se van a usar en cada evento (con la
-- cantidad prevista, opcional). Es una lista para preparar y bajar en PDF con
-- el stock actual: no mueve stock ni genera movimientos.
create table if not exists public.stock_evento_productos (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references public.eventos (id) on delete cascade,
  producto_id     uuid not null references public.productos (id) on delete cascade,
  cantidad        numeric(14, 3) check (cantidad is null or cantidad >= 0),
  nota            text check (char_length(nota) <= 300),
  orden           integer not null default 0,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  unique (evento_id, producto_id)
);
create index if not exists stock_evento_productos_evento_idx on public.stock_evento_productos (evento_id, orden);

drop trigger if exists stock_evento_productos_autoria on public.stock_evento_productos;
create trigger stock_evento_productos_autoria before insert or update on public.stock_evento_productos
  for each row execute function public.marcar_autoria();
drop trigger if exists stock_evento_productos_auditoria on public.stock_evento_productos;
create trigger stock_evento_productos_auditoria after insert or update or delete on public.stock_evento_productos
  for each row execute function public.registrar_auditoria();

alter table public.stock_evento_productos enable row level security;
drop policy if exists "stock evento: ver" on public.stock_evento_productos;
create policy "stock evento: ver" on public.stock_evento_productos for select to authenticated
  using ((select public.tiene_permiso('stock', 'ver')));
drop policy if exists "stock evento: editar" on public.stock_evento_productos;
create policy "stock evento: editar" on public.stock_evento_productos for all to authenticated
  using ((select public.tiene_permiso('stock', 'editar')))
  with check ((select public.tiene_permiso('stock', 'editar')));
revoke all on public.stock_evento_productos from anon;
revoke truncate on public.stock_evento_productos from authenticated;

-- Guarda la lista entera de un evento (las que no vienen se quitan).
create or replace function public.guardar_stock_evento(p_evento_id uuid, p_lista jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.tiene_permiso('stock', 'editar') then raise exception 'No tenés permiso para editar el stock'; end if;
  delete from public.stock_evento_productos
  where evento_id = p_evento_id
    and producto_id not in (select (x ->> 'producto_id')::uuid from jsonb_array_elements(p_lista) x);
  insert into public.stock_evento_productos (evento_id, producto_id, cantidad, nota, orden)
  select p_evento_id, (x ->> 'producto_id')::uuid, nullif(x ->> 'cantidad', '')::numeric, nullif(x ->> 'nota', ''), (x ->> 'orden')::int
  from jsonb_array_elements(p_lista) x
  on conflict (evento_id, producto_id) do update
    set cantidad = excluded.cantidad, nota = excluded.nota, orden = excluded.orden
    where (public.stock_evento_productos.cantidad, public.stock_evento_productos.nota, public.stock_evento_productos.orden)
          is distinct from (excluded.cantidad, excluded.nota, excluded.orden);
end
$$;
revoke execute on function public.guardar_stock_evento(uuid, jsonb) from public, anon;
grant execute on function public.guardar_stock_evento(uuid, jsonb) to authenticated;
