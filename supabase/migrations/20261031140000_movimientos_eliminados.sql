-- Los movimientos de stock eliminados ya no se borran: quedan en el historial
-- marcados como eliminados, con fecha, quién y el motivo (obligatorio).
-- El stock (la vista stock_actual) no los cuenta: queda como si no se
-- hubieran hecho.

alter table public.movimientos_stock
  add column if not exists eliminado_en timestamptz,
  add column if not exists eliminado_por uuid references public.perfiles (id),
  add column if not exists motivo_eliminacion text;
alter table public.entradas_stock
  add column if not exists eliminado_en timestamptz,
  add column if not exists eliminado_por uuid references public.perfiles (id),
  add column if not exists motivo_eliminacion text;
alter table public.salidas_stock
  add column if not exists eliminado_en timestamptz,
  add column if not exists eliminado_por uuid references public.perfiles (id),
  add column if not exists motivo_eliminacion text;

-- El stock solo cuenta los movimientos vigentes.
create or replace view public.stock_actual
with (security_invoker = true)
as
select
  m.producto_id,
  m.deposito_id,
  sum(m.cantidad) as cantidad,
  round(
    sum(m.cantidad * m.costo_unitario) filter (where m.tipo in ('entrada', 'ajuste') and m.cantidad > 0 and m.costo_unitario is not null)
    / nullif(sum(m.cantidad) filter (where m.tipo in ('entrada', 'ajuste') and m.cantidad > 0 and m.costo_unitario is not null), 0),
    2
  ) as costo_promedio,
  max(m.fecha) as ultimo_movimiento
from public.movimientos_stock m
where m.eliminado_en is null
group by m.producto_id, m.deposito_id;

-- Las funciones anteriores borraban; se reemplazan por las que marcan como eliminado.
drop function if exists public.eliminar_movimiento_stock(uuid);
drop function if exists public.eliminar_entrada_stock(uuid);
drop function if exists public.eliminar_salida_stock(uuid);
drop function if exists public.borrar_movimientos_stock_interno(uuid[]);

-- Marca como eliminados los movimientos indicados (y la entrada / salida que
-- se quede sin productos vigentes). Solo la usan las funciones de abajo.
create or replace function public.eliminar_movimientos_stock_interno(p_ids uuid[], p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problema text;
  v_entradas uuid[];
  v_salidas uuid[];
  v_motivo text := nullif(trim(p_motivo), '');
begin
  if v_motivo is null then
    raise exception 'Escribí el motivo de la eliminación';
  end if;
  if length(v_motivo) > 200 then
    raise exception 'El motivo puede tener hasta 200 caracteres';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'El movimiento no existe';
  end if;
  if exists (select 1 from public.movimientos_stock where id = any (p_ids) and eliminado_en is not null) then
    raise exception 'El movimiento ya está eliminado';
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
    where m.producto_id = b.producto_id and m.deposito_id = b.deposito_id and m.eliminado_en is null
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

  update public.movimientos_stock
     set eliminado_en = now(), eliminado_por = auth.uid(), motivo_eliminacion = v_motivo
   where id = any (p_ids);

  -- La entrada / salida que se quedó sin productos vigentes queda eliminada también.
  update public.entradas_stock e
     set eliminado_en = now(), eliminado_por = auth.uid(), motivo_eliminacion = v_motivo
   where e.id = any (coalesce(v_entradas, '{}'))
     and e.eliminado_en is null
     and not exists (select 1 from public.movimientos_stock m where m.entrada_id = e.id and m.eliminado_en is null);
  update public.salidas_stock s
     set eliminado_en = now(), eliminado_por = auth.uid(), motivo_eliminacion = v_motivo
   where s.id = any (coalesce(v_salidas, '{}'))
     and s.eliminado_en is null
     and not exists (select 1 from public.movimientos_stock m where m.salida_id = s.id and m.eliminado_en is null);
end
$$;

revoke execute on function public.eliminar_movimientos_stock_interno(uuid[], text) from public, anon, authenticated;

-- Un movimiento (o un producto de una entrada / salida). Una transferencia se elimina entera.
create or replace function public.eliminar_movimiento_stock(p_id uuid, p_motivo text)
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
    raise exception 'El movimiento no existe';
  end if;

  select array_agg(id) into v_ids
  from public.movimientos_stock
  where id = p_id or (v_transferencia is not null and transferencia_id = v_transferencia);

  perform public.eliminar_movimientos_stock_interno(v_ids, p_motivo);
end
$$;

-- Una entrada de varios productos completa.
create or replace function public.eliminar_entrada_stock(p_id uuid, p_motivo text)
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
    raise exception 'La entrada no existe';
  end if;
  if exists (select 1 from public.entradas_stock where id = p_id and eliminado_en is not null) then
    raise exception 'La entrada ya está eliminada';
  end if;

  select array_agg(id) into v_ids from public.movimientos_stock where entrada_id = p_id and eliminado_en is null;
  if v_ids is null then
    if nullif(trim(p_motivo), '') is null then
      raise exception 'Escribí el motivo de la eliminación';
    end if;
    update public.entradas_stock
       set eliminado_en = now(), eliminado_por = auth.uid(), motivo_eliminacion = left(trim(p_motivo), 200)
     where id = p_id;
  else
    perform public.eliminar_movimientos_stock_interno(v_ids, p_motivo);
  end if;
end
$$;

-- Una salida de varios productos completa.
create or replace function public.eliminar_salida_stock(p_id uuid, p_motivo text)
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
    raise exception 'La salida no existe';
  end if;
  if exists (select 1 from public.salidas_stock where id = p_id and eliminado_en is not null) then
    raise exception 'La salida ya está eliminada';
  end if;

  select array_agg(id) into v_ids from public.movimientos_stock where salida_id = p_id and eliminado_en is null;
  if v_ids is null then
    if nullif(trim(p_motivo), '') is null then
      raise exception 'Escribí el motivo de la eliminación';
    end if;
    update public.salidas_stock
       set eliminado_en = now(), eliminado_por = auth.uid(), motivo_eliminacion = left(trim(p_motivo), 200)
     where id = p_id;
  else
    perform public.eliminar_movimientos_stock_interno(v_ids, p_motivo);
  end if;
end
$$;

revoke execute on function public.eliminar_movimiento_stock(uuid, text) from public, anon;
grant execute on function public.eliminar_movimiento_stock(uuid, text) to authenticated;
revoke execute on function public.eliminar_entrada_stock(uuid, text) from public, anon;
grant execute on function public.eliminar_entrada_stock(uuid, text) to authenticated;
revoke execute on function public.eliminar_salida_stock(uuid, text) from public, anon;
grant execute on function public.eliminar_salida_stock(uuid, text) to authenticated;
