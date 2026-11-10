-- Cuentas corrientes con saldo a favor.
--
-- Un pago (o cobro) mayor a lo que se debe ya no se rechaza: se imputa lo que
-- haya pendiente y el excedente queda como crédito del pago (lo que el pago no
-- tiene imputado). Ese crédito se aplica solo a las deudas que haya o que
-- aparezcan después (cargos, facturas, gastos de eventos, importes editados).
-- No se crean movimientos en Financiero: el crédito pasa a Financiero recién
-- cuando se aplica a una deuda (que se marca pagada con la fecha del pago).
-- Bajar o eliminar una deuda con pagos devuelve esos pagos como crédito.

-- Movimientos de una cuenta corriente sin chequear permisos (uso interno).
create or replace function public.movimientos_cuenta_interno(p_tipo text, p_id uuid, p_empresa text)
returns setof public.transacciones
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select t.id
    from public.transacciones t
    join public.facturas f on f.id = t.factura_id
    join public.proveedores p on p.cuit = regexp_replace(f.cuit_emisor, '[^0-9]', '', 'g')
    where p_tipo = 'pago' and p.id = p_id and f.estado = 'aprobada'
    union
    select c.transaccion_id
    from public.comprobantes_emitidos c
    where p_tipo = 'cobro' and c.cliente_id = p_id and c.transaccion_id is not null
    union
    select t.id
    from public.transacciones t
    where (p_tipo = 'pago' and t.proveedor_id = p_id) or (p_tipo = 'cobro' and t.cliente_id = p_id)
  )
  select t.*
  from public.transacciones t
  where (t.id in (select id from base) or t.parte_de in (select id from base))
    and t.eliminado_en is null
    and t.empresa = p_empresa;
$$;
revoke execute on function public.movimientos_cuenta_interno(text, uuid, text) from public, anon, authenticated;

-- Imputa hasta p_monto de un pago a lo pendiente de su cuenta (a los movimientos
-- indicados, en ese orden, o a los más viejos). Devuelve lo que no se pudo imputar.
create or replace function public.imputar_pago(p_pago_id uuid, p_monto numeric, p_movimientos uuid[] default null)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.pagos_cuenta;
  v_resta numeric(14, 2) := p_monto;
  v_aplica numeric(14, 2);
  v_iva numeric(14, 2);
  v_nueva uuid;
  t public.transacciones;
begin
  select * into v from public.pagos_cuenta where id = p_pago_id and anulado_en is null;
  if not found or v_resta <= 0 then
    return greatest(v_resta, 0);
  end if;

  for t in
    select m.*
    from public.movimientos_cuenta_interno(v.tipo, coalesce(v.proveedor_id, v.cliente_id), v.empresa) m
    where m.estado = 'pendiente'
      and (p_movimientos is null or m.id = any (p_movimientos))
    order by
      case when p_movimientos is null then 0 else array_position(p_movimientos, m.id) end,
      m.fecha nulls last, m.creado_en
  loop
    exit when v_resta <= 0;
    perform 1 from public.transacciones where id = t.id and estado = 'pendiente' for update;
    if not found then
      continue;
    end if;
    v_aplica := least(v_resta, t.monto);

    if v_aplica = t.monto then
      insert into public.pago_aplicaciones (pago_id, transaccion_id, monto, fecha_anterior, medio_anterior)
      values (v.id, t.id, v_aplica, t.fecha, t.medio_pago);
      update public.transacciones
      set estado = 'real', fecha = v.fecha, medio_pago = v.medio_pago, pago_id = v.id
      where id = t.id;
    else
      v_iva := case when t.iva is null then null else round(t.iva * v_aplica / t.monto, 2) end;
      update public.transacciones
      set monto = monto - v_aplica, iva = case when iva is null then null else iva - v_iva end
      where id = t.id;
      insert into public.transacciones (
        empresa, tipo, monto, fecha, descripcion, categoria_id, evento_id, contraparte,
        medio_pago, estado, facturado, iva, notas, parte_de, pago_id
      ) values (
        t.empresa, t.tipo, v_aplica, v.fecha, t.descripcion, t.categoria_id, t.evento_id, t.contraparte,
        v.medio_pago, 'real', t.facturado, v_iva,
        concat_ws(' · ', nullif(t.notas, ''), case when v.tipo = 'pago' then 'Pago parcial' else 'Cobro parcial' end),
        coalesce(t.parte_de, t.id), v.id
      )
      returning id into v_nueva;
      insert into public.pago_aplicaciones (pago_id, transaccion_id, monto, dividida_de, fecha_anterior, medio_anterior)
      values (v.id, v_nueva, v_aplica, t.id, t.fecha, t.medio_pago);
    end if;
    v_resta := v_resta - v_aplica;
  end loop;
  return v_resta;
end
$$;
revoke execute on function public.imputar_pago(uuid, numeric, uuid[]) from public, anon, authenticated;

-- Aplica el saldo a favor de una cuenta (lo no imputado de sus pagos, del más
-- viejo al más nuevo) a lo pendiente. Devuelve cuánto se aplicó. Uso interno.
create or replace function public.aplicar_saldo_interno(p_tipo text, p_id uuid, p_empresa text)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  v_aplicado numeric(14, 2) := 0;
  v_resto numeric(14, 2);
begin
  if p_id is null then
    return 0;
  end if;
  for p in
    select pc.id, pc.monto - coalesce((select sum(a.monto) from public.pago_aplicaciones a where a.pago_id = pc.id), 0) as libre
    from public.pagos_cuenta pc
    where pc.tipo = p_tipo and pc.empresa = p_empresa and pc.anulado_en is null
      and ((p_tipo = 'pago' and pc.proveedor_id = p_id) or (p_tipo = 'cobro' and pc.cliente_id = p_id))
    order by pc.fecha, pc.creado_en
  loop
    continue when p.libre <= 0;
    v_resto := public.imputar_pago(p.id, p.libre, null);
    v_aplicado := v_aplicado + (p.libre - v_resto);
    exit when v_resto > 0; -- no queda nada pendiente
  end loop;
  return v_aplicado;
end
$$;
revoke execute on function public.aplicar_saldo_interno(text, uuid, text) from public, anon, authenticated;

-- Lo mismo, desde la app (con los permisos de quien registra pagos).
create or replace function public.aplicar_saldo_a_favor(p_tipo text, p_id uuid, p_empresa text)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_tipo not in ('pago', 'cobro') or p_empresa not in ('nero', 'ruta') then
    raise exception 'Datos inválidos';
  end if;
  if not (
    (select public.tiene_permiso('financiero', 'editar'))
    or (p_tipo = 'pago' and (select public.tiene_permiso('facturas', 'editar')))
    or (p_tipo = 'cobro' and (select public.tiene_permiso('facturar', 'editar')))
  ) then
    raise exception 'No tenés permiso para registrar pagos';
  end if;
  return public.aplicar_saldo_interno(p_tipo, p_id, p_empresa);
end
$$;
revoke execute on function public.aplicar_saldo_a_favor(text, uuid, text) from public, anon;
grant execute on function public.aplicar_saldo_a_favor(text, uuid, text) to authenticated;

-- Registrar un pago: ya no se rechaza si supera lo pendiente; el excedente queda a favor.
create or replace function public.registrar_pago(p_pago jsonb, p_movimientos uuid[] default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text := p_pago ->> 'tipo';
  v_id uuid := (p_pago ->> 'id')::uuid;
  v_empresa text := p_pago ->> 'empresa';
  v_monto numeric(14, 2) := (p_pago ->> 'monto')::numeric;
  v_pago_id uuid;
  v_resto numeric(14, 2);
begin
  if v_tipo not in ('pago', 'cobro') or v_empresa not in ('nero', 'ruta') then
    raise exception 'Datos del pago inválidos';
  end if;
  if not (
    (select public.tiene_permiso('financiero', 'editar'))
    or (v_tipo = 'pago' and (select public.tiene_permiso('facturas', 'editar')))
    or (v_tipo = 'cobro' and (select public.tiene_permiso('facturar', 'editar')))
  ) then
    raise exception 'No tenés permiso para registrar pagos';
  end if;
  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a cero';
  end if;
  if v_tipo = 'pago' and not exists (select 1 from public.proveedores where id = v_id)
     or v_tipo = 'cobro' and not exists (select 1 from public.clientes where id = v_id) then
    raise exception 'No existe';
  end if;

  insert into public.pagos_cuenta (empresa, tipo, proveedor_id, cliente_id, fecha, monto, medio_pago, notas)
  values (
    v_empresa, v_tipo,
    case when v_tipo = 'pago' then v_id end,
    case when v_tipo = 'cobro' then v_id end,
    (p_pago ->> 'fecha')::date, v_monto, (p_pago ->> 'medio_pago')::public.medio_pago, nullif(trim(p_pago ->> 'notas'), '')
  )
  returning id into v_pago_id;

  -- Primero a lo elegido; lo que sobra, a lo más viejo; si aún sobra, queda a favor.
  v_resto := public.imputar_pago(v_pago_id, v_monto, p_movimientos);
  if v_resto > 0 and p_movimientos is not null then
    perform public.imputar_pago(v_pago_id, v_resto, null);
  end if;
  return v_pago_id;
end
$$;
revoke execute on function public.registrar_pago(jsonb, uuid[]) from public, anon;
grant execute on function public.registrar_pago(jsonb, uuid[]) to authenticated;

-- Eliminar un pago: se anula y, si hay otros pagos con saldo a favor, cubren lo que quedó pendiente.
create or replace function public.eliminar_pago(p_pago_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.pagos_cuenta;
begin
  select * into v from public.pagos_cuenta where id = p_pago_id;
  perform public.anular_pago(p_pago_id);
  perform public.aplicar_saldo_interno(v.tipo, coalesce(v.proveedor_id, v.cliente_id), v.empresa);
end
$$;
revoke execute on function public.eliminar_pago(uuid) from public, anon;
grant execute on function public.eliminar_pago(uuid) to authenticated;

-- Deshace las imputaciones de pagos sobre un movimiento (y sus partes): lo
-- pagado vuelve a pendiente y esos pagos quedan con saldo a favor. Uso interno.
create or replace function public.liberar_pagos_de(p_raiz uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.pago_aplicaciones;
  v_parte public.transacciones;
  v_madre public.transacciones;
begin
  for a in
    select pa.* from public.pago_aplicaciones pa
    join public.transacciones t on t.id = pa.transaccion_id
    where (t.id = p_raiz or t.parte_de = p_raiz) and t.eliminado_en is null
    order by (t.id = p_raiz)
  loop
    select * into v_parte from public.transacciones where id = a.transaccion_id for update;
    delete from public.pago_aplicaciones where id = a.id;
    if a.dividida_de is not null then
      select * into v_madre from public.transacciones
      where id = a.dividida_de and estado = 'pendiente' and eliminado_en is null
      for update;
      if found then
        update public.transacciones
        set monto = monto + v_parte.monto,
            iva = case when iva is null and v_parte.iva is null then null else coalesce(iva, 0) + coalesce(v_parte.iva, 0) end
        where id = v_madre.id;
        update public.transacciones set eliminado_en = now(), pago_id = null where id = v_parte.id;
        continue;
      end if;
    end if;
    update public.transacciones
    set estado = 'pendiente', fecha = a.fecha_anterior, medio_pago = a.medio_anterior, pago_id = null
    where id = v_parte.id;
  end loop;
end
$$;
revoke execute on function public.liberar_pagos_de(uuid) from public, anon, authenticated;

-- Editar un movimiento a mano: el importe puede quedar por debajo de lo pagado
-- desde la cuenta (lo pagado de más vuelve como saldo a favor). Solo lo marcado
-- pagado directo en Financiero (sin pago de la cuenta) sigue siendo un mínimo.
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
  v_fijo numeric(14, 2);
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
  select
    coalesce(sum(monto) filter (where estado <> 'pendiente' and pago_id is null), 0),
    coalesce(sum(monto) filter (where estado <> 'pendiente'), 0)
  into v_fijo, v_pagado
  from public.transacciones
  where (id = t.id or parte_de = t.id) and eliminado_en is null;

  if v_monto < v_fijo then
    raise exception 'Hay $% marcados como pagados directo en Financiero: el importe no puede ser menor', to_char(v_fijo, 'FM999G999G999G990D00');
  end if;
  -- Menos de lo pagado desde la cuenta: se liberan esos pagos (quedan a favor) y se vuelven a aplicar al final.
  if v_monto < v_pagado then
    perform public.liberar_pagos_de(t.id);
    select * into t from public.transacciones where id = t.id;
  end if;

  select coalesce(sum(monto) filter (where estado <> 'pendiente'), 0), coalesce(sum(monto) filter (where estado = 'pendiente'), 0)
  into v_pagado, v_pendiente
  from public.transacciones
  where (id = t.id or parte_de = t.id) and eliminado_en is null;

  update public.transacciones
  set descripcion = p_cambios ->> 'detalle', categoria_id = (p_cambios ->> 'categoria_id')::uuid
  where (id = t.id or parte_de = t.id) and eliminado_en is null;
  update public.transacciones set fecha = v_fecha
  where (id = t.id or parte_de = t.id) and eliminado_en is null and estado = 'pendiente';
  update public.pago_aplicaciones set fecha_anterior = v_fecha
  where transaccion_id in (select id from public.transacciones where id = t.id or parte_de = t.id);

  v_dif := v_monto - v_pagado - v_pendiente;
  if v_dif > 0 then
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

  perform public.aplicar_saldo_interno(
    case when t.proveedor_id is not null then 'pago' else 'cobro' end,
    coalesce(t.proveedor_id, t.cliente_id),
    t.empresa
  );
end
$$;
revoke execute on function public.editar_cargo(uuid, jsonb) from public, anon, authenticated;

-- Eliminar un movimiento a mano: si tenía pagos de la cuenta, esos pagos quedan a favor.
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
    raise exception 'No tenés permiso para eliminar movimientos';
  end if;
  if exists (
    select 1 from public.transacciones
    where (id = t.id or parte_de = t.id) and eliminado_en is null and estado <> 'pendiente' and pago_id is null
  ) then
    raise exception 'Tiene una parte marcada como pagada directo en Financiero: cambiala desde Financiero';
  end if;
  perform public.liberar_pagos_de(t.id);
  update public.transacciones set eliminado_en = now() where (id = t.id or parte_de = t.id) and eliminado_en is null;
  perform public.aplicar_saldo_interno(
    case when t.proveedor_id is not null then 'pago' else 'cobro' end,
    coalesce(t.proveedor_id, t.cliente_id),
    t.empresa
  );
end
$$;
revoke execute on function public.borrar_cargo(uuid) from public, anon, authenticated;

-- Cargar una deuda a mano: si la cuenta tenía saldo a favor, se aplica.
create or replace function public.cargar_cuenta_con_saldo(p_cargo jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nuevo uuid;
begin
  v_nuevo := public.cargar_cuenta(p_cargo);
  perform public.aplicar_saldo_interno(p_cargo ->> 'tipo', (p_cargo ->> 'id')::uuid, p_cargo ->> 'empresa');
  return v_nuevo;
end
$$;
revoke execute on function public.cargar_cuenta_con_saldo(jsonb) from public, anon;
grant execute on function public.cargar_cuenta_con_saldo(jsonb) to authenticated;

-- Gastos de un evento vinculados a cuentas corrientes: aplica el saldo a favor
-- de esos proveedores (lo llama la app después de guardar la planilla).
create or replace function public.aplicar_saldo_evento(p_evento_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if not (select public.tiene_permiso('eventos', 'editar')) then
    raise exception 'No tenés permiso para editar eventos';
  end if;
  for r in
    select distinct t.proveedor_id, t.empresa from public.transacciones t
    where t.evento_id = p_evento_id and t.proveedor_id is not null and t.eliminado_en is null and t.planilla_ref is not null
  loop
    perform public.aplicar_saldo_interno('pago', r.proveedor_id, r.empresa);
  end loop;
end
$$;
revoke execute on function public.aplicar_saldo_evento(uuid) from public, anon;
grant execute on function public.aplicar_saldo_evento(uuid) to authenticated;

-- Saldo de cada cuenta: lo pendiente menos el saldo a favor (puede ser negativo).
drop function if exists public.resumen_cuentas(text, text);
create function public.resumen_cuentas(p_tipo text, p_empresa text)
returns table (ficha uuid, saldo numeric, movimientos integer)
language sql
stable
security definer
set search_path = ''
as $$
  with permitido as (
    select (p_tipo = 'pago' and ((select public.tiene_permiso('facturas', 'ver')) or (select public.tiene_permiso('financiero', 'ver'))))
        or (p_tipo = 'cobro' and ((select public.tiene_permiso('facturar', 'ver')) or (select public.tiene_permiso('financiero', 'ver')))) as ok
  ),
  duenios as (
    select t.id as raiz, p.id as ficha, 2 as prioridad
    from public.transacciones t
    join public.facturas f on f.id = t.factura_id and f.estado = 'aprobada'
    join public.proveedores p on p.cuit = regexp_replace(f.cuit_emisor, '[^0-9]', '', 'g')
    where p_tipo = 'pago' and t.empresa = p_empresa
    union all
    select c.transaccion_id, c.cliente_id, 2
    from public.comprobantes_emitidos c
    where p_tipo = 'cobro' and c.transaccion_id is not null and c.cliente_id is not null
    union all
    select t.id, case when p_tipo = 'pago' then t.proveedor_id else t.cliente_id end, 1
    from public.transacciones t
    where t.empresa = p_empresa
      and ((p_tipo = 'pago' and t.proveedor_id is not null) or (p_tipo = 'cobro' and t.cliente_id is not null))
  ),
  duenio as (
    select distinct on (raiz) raiz, ficha from duenios order by raiz, prioridad
  ),
  deudas as (
    select d.ficha, coalesce(sum(m.monto) filter (where m.estado = 'pendiente'), 0) as pendiente, count(*)::integer as movimientos
    from public.transacciones m
    join duenio d on d.raiz = coalesce(m.parte_de, m.id)
    where m.empresa = p_empresa and m.estado <> 'proyectado' and m.eliminado_en is null
    group by d.ficha
  ),
  a_favor as (
    select coalesce(pc.proveedor_id, pc.cliente_id) as ficha,
           sum(pc.monto - coalesce((select sum(a.monto) from public.pago_aplicaciones a where a.pago_id = pc.id), 0)) as libre,
           count(*)::integer as pagos
    from public.pagos_cuenta pc
    where pc.tipo = p_tipo and pc.empresa = p_empresa and pc.anulado_en is null
    group by 1
  )
  select coalesce(d.ficha, f.ficha), coalesce(d.pendiente, 0) - coalesce(f.libre, 0), coalesce(d.movimientos, 0) + coalesce(f.pagos, 0)
  from deudas d
  full join a_favor f on f.ficha = d.ficha
  where (select ok from permitido)
    and (d.ficha is not null or f.libre <> 0);
$$;
revoke execute on function public.resumen_cuentas(text, text) from public, anon;
grant execute on function public.resumen_cuentas(text, text) to authenticated;
