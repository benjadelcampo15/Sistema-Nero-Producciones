-- Cuentas corrientes: editar el importe de los movimientos (también con pagos)
-- y de los pagos, y eliminar pagos sin que queden a la vista.
--
-- Eliminar un pago sigue siendo la anulación de siempre (lo que cubría vuelve a
-- quedar pendiente y el pago queda guardado con anulado_en, para auditoría),
-- pero la cuenta corriente ya no lo muestra.

-- Al editar un pago se anula y se registra uno nuevo: el viejo apunta al nuevo.
alter table public.pagos_cuenta add column if not exists reemplazado_por uuid references public.pagos_cuenta (id);

-- Editar un movimiento a mano (deuda sin factura).
--
-- Se pueden cambiar el detalle, la categoría, la fecha y el importe. Si ya tiene
-- pagos, el importe no puede quedar por debajo de lo pagado: la diferencia se
-- suma o se resta de lo que todavía está pendiente (el mismo movimiento en
-- Financiero), así el saldo y Financiero siguen coincidiendo.
--
-- p_cambios: { detalle, categoria_id, monto, fecha }
create or replace function public.editar_cargo(p_transaccion_id uuid, p_cambios jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.transacciones;
  p public.transacciones;
  c public.transacciones;
  v_monto numeric(14, 2) := (p_cambios ->> 'monto')::numeric;
  v_fecha date := nullif(p_cambios ->> 'fecha', '')::date;
  v_pagado numeric(14, 2);
  v_pendiente numeric(14, 2);
  v_dif numeric(14, 2);
  v_baja numeric(14, 2);
begin
  select * into t from public.transacciones
  where id = p_transaccion_id and eliminado_en is null and parte_de is null and (proveedor_id is not null or cliente_id is not null)
  for update;
  if not found then
    raise exception 'El movimiento no existe';
  end if;
  if not (
    (select public.tiene_permiso('financiero', 'editar'))
    or (t.proveedor_id is not null and (select public.tiene_permiso('facturas', 'editar')))
    or (t.cliente_id is not null and (select public.tiene_permiso('facturar', 'editar')))
  ) then
    raise exception 'No tenés permiso para editar movimientos';
  end if;
  if v_monto is null or v_monto <= 0 then
    raise exception 'El importe tiene que ser mayor a cero';
  end if;

  perform 1 from public.transacciones where parte_de = t.id and eliminado_en is null for update;
  select coalesce(sum(monto) filter (where estado <> 'pendiente'), 0), coalesce(sum(monto) filter (where estado = 'pendiente'), 0)
  into v_pagado, v_pendiente
  from public.transacciones
  where (id = t.id or parte_de = t.id) and eliminado_en is null;

  if v_monto < v_pagado then
    raise exception 'Ya se pagaron $%: el importe no puede ser menor. Para bajarlo más, eliminá primero el pago', to_char(v_pagado, 'FM999G999G999G990D00');
  end if;

  -- Detalle y categoría: en todas las partes (lo pagado y lo pendiente).
  update public.transacciones
  set descripcion = p_cambios ->> 'detalle', categoria_id = (p_cambios ->> 'categoria_id')::uuid
  where (id = t.id or parte_de = t.id) and eliminado_en is null;

  -- Fecha: la de lo pendiente, y la que vuelve si se elimina un pago.
  update public.transacciones set fecha = v_fecha
  where (id = t.id or parte_de = t.id) and eliminado_en is null and estado = 'pendiente';
  update public.pago_aplicaciones set fecha_anterior = v_fecha
  where transaccion_id in (select id from public.transacciones where id = t.id or parte_de = t.id);

  v_dif := v_monto - v_pagado - v_pendiente;

  if v_dif > 0 then
    -- Más deuda: se suma a lo pendiente (o queda pendiente lo nuevo, si estaba todo pagado).
    select * into p from public.transacciones
    where (id = t.id or parte_de = t.id) and eliminado_en is null and estado = 'pendiente'
    order by (id = t.id) desc, creado_en
    limit 1;
    if found then
      update public.transacciones
      set monto = monto + v_dif, iva = case when iva is null then null else round(iva * (monto + v_dif) / monto, 2) end
      where id = p.id;
    else
      insert into public.transacciones (
        empresa, tipo, monto, fecha, descripcion, categoria_id, evento_id, contraparte,
        medio_pago, estado, facturado, notas, parte_de
      ) values (
        t.empresa, t.tipo, v_dif, v_fecha, p_cambios ->> 'detalle', (p_cambios ->> 'categoria_id')::uuid, t.evento_id, t.contraparte,
        t.medio_pago, 'pendiente', t.facturado, t.notas, t.id
      );
    end if;
  elsif v_dif < 0 then
    -- Menos deuda: se descuenta de lo pendiente (primero de las partes, al final del movimiento original).
    v_baja := -v_dif;
    for p in
      select * from public.transacciones
      where (id = t.id or parte_de = t.id) and eliminado_en is null and estado = 'pendiente'
      order by (id = t.id), creado_en desc
    loop
      exit when v_baja <= 0;
      if p.monto > v_baja then
        update public.transacciones
        set monto = monto - v_baja, iva = case when iva is null then null else round(iva * (monto - v_baja) / monto, 2) end
        where id = p.id;
        v_baja := 0;
      else
        v_baja := v_baja - p.monto;
        if p.id <> t.id then
          update public.transacciones set eliminado_en = now() where id = p.id;
        else
          -- Lo pendiente del original queda en cero: el original pasa a ser una parte pagada
          -- (toma sus datos y su imputación) y esa parte se da de baja.
          select * into c from public.transacciones
          where parte_de = t.id and eliminado_en is null and estado <> 'pendiente'
          order by creado_en
          limit 1;
          update public.transacciones
          set monto = c.monto, iva = c.iva, estado = c.estado, fecha = c.fecha, medio_pago = c.medio_pago, pago_id = c.pago_id
          where id = t.id;
          update public.pago_aplicaciones set transaccion_id = t.id, dividida_de = null where transaccion_id = c.id;
          update public.transacciones set eliminado_en = now(), pago_id = null where id = c.id;
        end if;
      end if;
    end loop;
  end if;
end
$$;

revoke execute on function public.editar_cargo(uuid, jsonb) from public, anon;
grant execute on function public.editar_cargo(uuid, jsonb) to authenticated;

-- Editar un pago (o cobro): fecha, importe, medio y nota. Se anula y se vuelve a
-- registrar en la misma operación, imputando primero a lo que cubría antes y
-- después a lo más viejo. Si algo falla, no cambia nada.
--
-- p_cambios: { fecha, monto, medio_pago, notas }
create or replace function public.editar_pago(p_pago_id uuid, p_cambios jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.pagos_cuenta;
  v_cuenta uuid;
  v_raices uuid[];
  v_movs uuid[];
  v_nuevo uuid;
begin
  select * into v from public.pagos_cuenta where id = p_pago_id and anulado_en is null for update;
  if not found then
    raise exception 'El pago no existe o ya fue eliminado';
  end if;
  v_cuenta := coalesce(v.proveedor_id, v.cliente_id);

  -- Lo que cubría (el movimiento original de cada parte), del más viejo al más nuevo.
  select array_agg(r order by f) into v_raices
  from (
    select coalesce(t.parte_de, t.id) as r, min(coalesce(a.fecha_anterior, date '9999-12-31')) as f
    from public.pago_aplicaciones a
    join public.transacciones t on t.id = a.transaccion_id
    where a.pago_id = p_pago_id
    group by 1
  ) x;

  perform public.anular_pago(p_pago_id);

  select array_agg(
    m.id order by
      coalesce(array_position(v_raices, coalesce(m.parte_de, m.id)), 2147483647),
      m.fecha nulls last,
      m.creado_en
  ) into v_movs
  from public.movimientos_de_cuenta(v.tipo, v_cuenta, v.empresa) m
  where m.estado = 'pendiente';

  v_nuevo := public.registrar_pago(
    jsonb_build_object(
      'tipo', v.tipo,
      'id', v_cuenta,
      'empresa', v.empresa,
      'fecha', p_cambios ->> 'fecha',
      'monto', p_cambios ->> 'monto',
      'medio_pago', coalesce(p_cambios ->> 'medio_pago', v.medio_pago::text),
      'notas', coalesce(p_cambios ->> 'notas', v.notas, '')
    ),
    coalesce(v_movs, '{}')
  );
  update public.pagos_cuenta set reemplazado_por = v_nuevo where id = p_pago_id;
  return v_nuevo;
end
$$;

revoke execute on function public.editar_pago(uuid, jsonb) from public, anon;
grant execute on function public.editar_pago(uuid, jsonb) to authenticated;

-- Mensaje de los cargos con pagos (antes decía "anulalos").
create or replace function public.borrar_cargo(p_transaccion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.transacciones;
begin
  select * into t from public.transacciones
  where id = p_transaccion_id and eliminado_en is null and (proveedor_id is not null or cliente_id is not null)
  for update;
  if not found then
    raise exception 'El movimiento no existe';
  end if;
  if not (
    (select public.tiene_permiso('financiero', 'editar'))
    or (t.proveedor_id is not null and (select public.tiene_permiso('facturas', 'editar')))
    or (t.cliente_id is not null and (select public.tiene_permiso('facturar', 'editar')))
  ) then
    raise exception 'No tenés permiso para eliminar movimientos';
  end if;
  if t.estado <> 'pendiente' or exists (select 1 from public.transacciones where parte_de = t.id and eliminado_en is null) then
    raise exception 'El movimiento ya tiene pagos: eliminá primero los pagos';
  end if;
  update public.transacciones set eliminado_en = now() where id = t.id;
end
$$;

revoke execute on function public.borrar_cargo(uuid) from public, anon;
grant execute on function public.borrar_cargo(uuid) to authenticated;
