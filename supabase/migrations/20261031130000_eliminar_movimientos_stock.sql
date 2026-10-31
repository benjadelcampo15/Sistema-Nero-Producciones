-- Eliminar movimientos de stock ya hechos: un movimiento suelto (una
-- transferencia se va con sus dos partes), un producto de una entrada o
-- salida, o la entrada / salida completa. El stock es la suma de los
-- movimientos, así que al borrarlos queda como si no se hubieran hecho.
-- Lo borrado queda registrado en la auditoría.
--
-- No se permite si el stock de algún producto quedaría negativo (por
-- ejemplo, borrar una entrada de mercadería que ya salió).

-- Borra los movimientos indicados y las entradas / salidas que queden vacías.
-- Solo la usan las funciones de abajo (no se puede llamar desde la app).
create or replace function public.borrar_movimientos_stock_interno(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problema text;
  v_entradas uuid[];
  v_salidas uuid[];
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'El movimiento no existe';
  end if;

  -- Solo puede quedar negativo un producto al que se le saca stock (entradas o ajustes que sumaron).
  select format('%s en %s: quedarían %s (hay %s y se sacarían %s)',
                p.nombre, d.nombre, trim_scale(t.total - b.suma), trim_scale(t.total), trim_scale(b.suma))
    into v_problema
  from (
    select m.producto_id, m.deposito_id, sum(m.cantidad) as suma
    from public.movimientos_stock m
    where m.id = any (p_ids)
    group by m.producto_id, m.deposito_id
    having sum(m.cantidad) > 0
  ) b
  cross join lateral (
    select sum(m.cantidad) as total
    from public.movimientos_stock m
    where m.producto_id = b.producto_id and m.deposito_id = b.deposito_id
  ) t
  join public.productos p on p.id = b.producto_id
  join public.depositos d on d.id = b.deposito_id
  where t.total - b.suma < 0
  limit 1;

  if v_problema is not null then
    raise exception 'No se puede eliminar: el stock quedaría negativo. %', v_problema;
  end if;

  select array_agg(distinct entrada_id) filter (where entrada_id is not null),
         array_agg(distinct salida_id) filter (where salida_id is not null)
    into v_entradas, v_salidas
  from public.movimientos_stock
  where id = any (p_ids);

  delete from public.movimientos_stock where id = any (p_ids);

  -- La entrada / salida que se quedó sin productos se borra también.
  delete from public.entradas_stock e
  where e.id = any (coalesce(v_entradas, '{}'))
    and not exists (select 1 from public.movimientos_stock m where m.entrada_id = e.id);
  delete from public.salidas_stock s
  where s.id = any (coalesce(v_salidas, '{}'))
    and not exists (select 1 from public.movimientos_stock m where m.salida_id = s.id);
end
$$;

revoke execute on function public.borrar_movimientos_stock_interno(uuid[]) from public, anon, authenticated;

-- Un movimiento (o un producto de una entrada / salida). Una transferencia se borra entera.
create or replace function public.eliminar_movimiento_stock(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transferencia uuid;
  v_ids uuid[];
begin
  if not public.tiene_permiso('stock', 'editar') then
    raise exception 'No tenés permiso para eliminar movimientos de stock';
  end if;

  select transferencia_id into v_transferencia from public.movimientos_stock where id = p_id;
  if not found then
    raise exception 'El movimiento no existe (puede que ya se haya eliminado)';
  end if;

  select array_agg(id) into v_ids
  from public.movimientos_stock
  where id = p_id or (v_transferencia is not null and transferencia_id = v_transferencia);

  perform public.borrar_movimientos_stock_interno(v_ids);
end
$$;

-- Una entrada de varios productos completa.
create or replace function public.eliminar_entrada_stock(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if not public.tiene_permiso('stock', 'editar') then
    raise exception 'No tenés permiso para eliminar movimientos de stock';
  end if;
  if not exists (select 1 from public.entradas_stock where id = p_id) then
    raise exception 'La entrada no existe (puede que ya se haya eliminado)';
  end if;

  select array_agg(id) into v_ids from public.movimientos_stock where entrada_id = p_id;
  if v_ids is null then
    delete from public.entradas_stock where id = p_id;
  else
    perform public.borrar_movimientos_stock_interno(v_ids);
  end if;
end
$$;

-- Una salida de varios productos completa.
create or replace function public.eliminar_salida_stock(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if not public.tiene_permiso('stock', 'editar') then
    raise exception 'No tenés permiso para eliminar movimientos de stock';
  end if;
  if not exists (select 1 from public.salidas_stock where id = p_id) then
    raise exception 'La salida no existe (puede que ya se haya eliminado)';
  end if;

  select array_agg(id) into v_ids from public.movimientos_stock where salida_id = p_id;
  if v_ids is null then
    delete from public.salidas_stock where id = p_id;
  else
    perform public.borrar_movimientos_stock_interno(v_ids);
  end if;
end
$$;

revoke execute on function public.eliminar_movimiento_stock(uuid) from public, anon;
grant execute on function public.eliminar_movimiento_stock(uuid) to authenticated;
revoke execute on function public.eliminar_entrada_stock(uuid) from public, anon;
grant execute on function public.eliminar_entrada_stock(uuid) to authenticated;
revoke execute on function public.eliminar_salida_stock(uuid) from public, anon;
grant execute on function public.eliminar_salida_stock(uuid) to authenticated;
