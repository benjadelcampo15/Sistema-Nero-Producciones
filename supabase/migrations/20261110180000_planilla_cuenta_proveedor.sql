-- Gastos de la planilla del evento vinculados a la cuenta corriente de un proveedor.
--
-- Un gasto con proveedor no crea movimientos nuevos: los mismos de Financiero
-- (la seña y el saldo, "gasto:<id>:sena" y "gasto:<id>:resta") pasan a ser su
-- deuda en la cuenta corriente del proveedor, con la empresa del evento:
--   · el movimiento principal (el saldo; si no hay saldo, la seña) lleva el proveedor,
--   · la seña queda como parte ya pagada de ese movimiento.
-- Así cada proveedor tiene una sola cuenta por empresa, con los gastos de todos
-- sus eventos. Lo que se paga desde la cuenta corriente descuenta del saldo del
-- gasto (y la planilla lo muestra como pagado); guardar la planilla no lo pisa.

-- Ajusta el saldo (pendiente) de un gasto vinculado: lo que dice la planilla
-- menos lo que ya se pagó desde la cuenta corriente. Uso interno de sincronizar_planilla.
create or replace function public.planilla_ajustar_saldo(p_evento public.eventos, m jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.transacciones;
  p public.transacciones;
  c public.transacciones;
  v_total numeric(14, 2) := (m ->> 'monto')::numeric;
  v_iva numeric(14, 2) := nullif(m ->> 'iva', '')::numeric;
  v_fecha date := (m ->> 'fecha')::date;
  v_pagado numeric(14, 2);
  v_pendiente numeric(14, 2);
  v_dif numeric(14, 2);
  v_baja numeric(14, 2);
begin
  select * into r from public.transacciones
  where evento_id = p_evento.id and planilla_ref = m ->> 'ref' and eliminado_en is null
  for update;

  if not found then
    insert into public.transacciones (
      empresa, tipo, monto, fecha, descripcion, categoria_id, evento_id, medio_pago, estado, facturado, iva, notas, planilla_ref
    ) values (
      p_evento.empresa, 'egreso', v_total, v_fecha, m ->> 'descripcion', (m ->> 'categoria_id')::uuid, p_evento.id,
      'transferencia', 'pendiente', (m ->> 'facturado')::boolean, v_iva, 'Desde la planilla del evento', m ->> 'ref'
    );
    return;
  end if;

  -- Datos generales en todo el gasto (sin tocar importes ni lo pagado).
  update public.transacciones
  set empresa = p_evento.empresa, descripcion = m ->> 'descripcion', categoria_id = (m ->> 'categoria_id')::uuid, facturado = (m ->> 'facturado')::boolean
  where (id = r.id or (parte_de = r.id and planilla_ref is null)) and eliminado_en is null;

  -- Marcado pagado a mano en Financiero (sin pago de la cuenta): como siempre.
  if r.estado <> 'pendiente' and r.pago_id is null then
    update public.transacciones set monto = v_total, iva = v_iva where id = r.id;
    return;
  end if;

  perform 1 from public.transacciones where parte_de = r.id and eliminado_en is null for update;
  select
    coalesce(sum(monto) filter (where estado <> 'pendiente'), 0),
    coalesce(sum(monto) filter (where estado = 'pendiente'), 0)
  into v_pagado, v_pendiente
  from public.transacciones
  where (id = r.id or (parte_de = r.id and planilla_ref is null)) and eliminado_en is null;

  if v_total < v_pagado then
    raise exception 'El gasto "%" ya tiene $% pagados desde la cuenta corriente: el saldo no puede ser menor', m ->> 'descripcion', to_char(v_pagado, 'FM999G999G999G990D00');
  end if;
  v_dif := (v_total - v_pagado) - v_pendiente;

  if v_dif > 0 then
    select * into p from public.transacciones
    where (id = r.id or (parte_de = r.id and planilla_ref is null)) and eliminado_en is null and estado = 'pendiente'
    order by (id = r.id) desc, creado_en
    limit 1;
    if found then
      update public.transacciones set monto = monto + v_dif where id = p.id;
    else
      insert into public.transacciones (
        empresa, tipo, monto, fecha, descripcion, categoria_id, evento_id, medio_pago, estado, facturado, notas, parte_de
      ) values (
        p_evento.empresa, 'egreso', v_dif, v_fecha, m ->> 'descripcion', (m ->> 'categoria_id')::uuid, p_evento.id,
        'transferencia', 'pendiente', (m ->> 'facturado')::boolean, 'Desde la planilla del evento', r.id
      );
    end if;
  elsif v_dif < 0 then
    v_baja := -v_dif;
    for p in
      select * from public.transacciones
      where (id = r.id or (parte_de = r.id and planilla_ref is null)) and eliminado_en is null and estado = 'pendiente'
      order by (id = r.id), creado_en desc
    loop
      exit when v_baja <= 0;
      if p.monto > v_baja then
        update public.transacciones set monto = monto - v_baja where id = p.id;
        v_baja := 0;
      else
        v_baja := v_baja - p.monto;
        if p.id <> r.id then
          update public.transacciones set eliminado_en = now() where id = p.id;
        else
          -- Lo pendiente del saldo queda en cero: el saldo pasa a ser un pago (toma sus datos) y esa parte se da de baja.
          select * into c from public.transacciones
          where parte_de = r.id and eliminado_en is null and planilla_ref is null and estado <> 'pendiente'
          order by creado_en
          limit 1;
          if not found then
            raise exception 'No se pudo ajustar el gasto "%"', m ->> 'descripcion';
          end if;
          update public.transacciones
          set monto = c.monto, iva = c.iva, estado = c.estado, fecha = c.fecha, medio_pago = c.medio_pago, pago_id = c.pago_id
          where id = r.id;
          update public.pago_aplicaciones set transaccion_id = r.id, dividida_de = null where transaccion_id = c.id;
          update public.transacciones set eliminado_en = now(), pago_id = null where id = c.id;
        end if;
      end if;
    end loop;
  end if;

  -- Lo pendiente va con la fecha del evento y su parte del IVA.
  update public.transacciones
  set fecha = v_fecha, iva = case when v_iva is null or v_total = 0 then null else round(v_iva * monto / v_total, 2) end
  where (id = r.id or (parte_de = r.id and planilla_ref is null)) and eliminado_en is null and estado = 'pendiente';
end
$$;

revoke execute on function public.planilla_ajustar_saldo(public.eventos, jsonb) from public, anon, authenticated;

-- p_movimientos: [{ ref, tipo, monto, fecha, descripcion, categoria_id, estado, facturado, iva, gasto?, proveedor_id? }]
create or replace function public.sincronizar_planilla(p_evento_id uuid, p_movimientos jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evento public.eventos;
  m jsonb;
  v_refs text[];
  v_actual public.transacciones;
  v_gasto text;
  v_prov uuid;
  v_saldo public.transacciones;
  v_sena public.transacciones;
  v_hay_saldo boolean;
  v_hay_sena boolean;
  v_raiz uuid;
  v_anterior uuid;
  v_pagado numeric(14, 2);
  v_baja public.transacciones;
begin
  if not (select public.tiene_permiso('eventos', 'editar')) then
    raise exception 'No tenés permiso para editar eventos';
  end if;
  select * into v_evento from public.eventos where id = p_evento_id;
  if not found or not v_evento.planilla_en_financiero then
    return;
  end if;
  p_movimientos := coalesce(p_movimientos, '[]'::jsonb);
  select coalesce(array_agg(x ->> 'ref'), '{}') into v_refs from jsonb_array_elements(p_movimientos) x;

  for m in select * from jsonb_array_elements(p_movimientos) loop
    select * into v_actual from public.transacciones
    where evento_id = p_evento_id and planilla_ref = m ->> 'ref' and eliminado_en is null
    for update;

    -- El saldo de un gasto con proveedor (o que tuvo pagos desde la cuenta corriente) se ajusta aparte.
    if (m ->> 'ref') like 'gasto:%:resta' and (
      nullif(m ->> 'proveedor_id', '') is not null
      or (found and (v_actual.proveedor_id is not null or v_actual.pago_id is not null
        or exists (select 1 from public.transacciones h where h.parte_de = v_actual.id and h.eliminado_en is null and h.planilla_ref is null)))
    ) then
      perform public.planilla_ajustar_saldo(v_evento, m);
      continue;
    end if;

    if found then
      update public.transacciones set
        empresa = v_evento.empresa,
        tipo = (m ->> 'tipo')::public.tipo_movimiento,
        monto = (m ->> 'monto')::numeric,
        -- Lo que ya estaba pagado conserva la fecha en que se pagó.
        fecha = case when v_actual.estado = 'real' then v_actual.fecha else (m ->> 'fecha')::date end,
        descripcion = m ->> 'descripcion',
        categoria_id = (m ->> 'categoria_id')::uuid,
        -- Lo que se cobró o pagó (desde la planilla o desde Financiero) no vuelve a pendiente.
        estado = case when v_actual.estado = 'real' then 'real' else (m ->> 'estado')::public.estado_movimiento end,
        facturado = (m ->> 'facturado')::boolean,
        iva = nullif(m ->> 'iva', '')::numeric
      where id = v_actual.id;
    else
      insert into public.transacciones (
        empresa, tipo, monto, fecha, descripcion, categoria_id, evento_id, medio_pago, estado, facturado, iva, notas, planilla_ref
      ) values (
        v_evento.empresa,
        (m ->> 'tipo')::public.tipo_movimiento,
        (m ->> 'monto')::numeric,
        (m ->> 'fecha')::date,
        m ->> 'descripcion',
        (m ->> 'categoria_id')::uuid,
        p_evento_id,
        'transferencia',
        (m ->> 'estado')::public.estado_movimiento,
        (m ->> 'facturado')::boolean,
        nullif(m ->> 'iva', '')::numeric,
        'Desde la planilla del evento',
        m ->> 'ref'
      );
    end if;
  end loop;

  -- Vínculo de cada gasto con la cuenta corriente de su proveedor.
  for v_gasto in select distinct x ->> 'gasto' from jsonb_array_elements(p_movimientos) x where x ->> 'gasto' is not null loop
    select nullif(x ->> 'proveedor_id', '')::uuid into v_prov
    from jsonb_array_elements(p_movimientos) x where x ->> 'gasto' = v_gasto limit 1;

    select * into v_saldo from public.transacciones
    where evento_id = p_evento_id and planilla_ref = 'gasto:' || v_gasto || ':resta' and eliminado_en is null;
    v_hay_saldo := found and ('gasto:' || v_gasto || ':resta') = any (v_refs);
    select * into v_sena from public.transacciones
    where evento_id = p_evento_id and planilla_ref = 'gasto:' || v_gasto || ':sena' and eliminado_en is null;
    v_hay_sena := found and ('gasto:' || v_gasto || ':sena') = any (v_refs);
    if not v_hay_saldo and not v_hay_sena then
      continue;
    end if;

    v_raiz := case when v_hay_saldo then v_saldo.id else v_sena.id end;
    v_anterior := coalesce(v_saldo.proveedor_id, v_sena.proveedor_id);
    select coalesce(sum(monto), 0) into v_pagado
    from public.transacciones
    where (id = v_raiz or (parte_de = v_raiz and planilla_ref is null)) and eliminado_en is null
      and estado <> 'pendiente' and (pago_id is not null or planilla_ref is null);

    if v_pagado > 0 and v_prov is distinct from v_anterior then
      raise exception 'El gasto "%" ya tiene pagos registrados en la cuenta corriente del proveedor: para cambiar o quitar el proveedor, eliminá primero esos pagos', coalesce(v_saldo.descripcion, v_sena.descripcion);
    end if;

    if v_prov is not null then
      if not exists (
        select 1 from public.proveedores where id = v_prov and activo and (empresa is null or empresa = v_evento.empresa)
      ) then
        raise exception 'El proveedor elegido no está habilitado para esta empresa';
      end if;
      update public.transacciones set proveedor_id = v_prov, parte_de = null
      where id = v_raiz and (proveedor_id is distinct from v_prov or parte_de is not null);
      if v_hay_saldo and v_hay_sena then
        update public.transacciones set proveedor_id = null, parte_de = v_raiz
        where id = v_sena.id and (proveedor_id is not null or parte_de is distinct from v_raiz);
      end if;
    else
      update public.transacciones set proveedor_id = null
      where id in (v_saldo.id, v_sena.id) and proveedor_id is not null;
      update public.transacciones set parte_de = null
      where id = v_sena.id and parte_de is not null;
    end if;
  end loop;

  -- Lo que se sacó de la planilla se da de baja en Financiero (y en la cuenta corriente).
  for v_baja in
    select * from public.transacciones
    where evento_id = p_evento_id and planilla_ref is not null and eliminado_en is null and not (planilla_ref = any (v_refs))
    for update
  loop
    if v_baja.pago_id is not null or exists (
      select 1 from public.transacciones h
      where h.parte_de = v_baja.id and h.eliminado_en is null and h.planilla_ref is null and h.estado <> 'pendiente'
    ) then
      raise exception 'El gasto "%" tiene pagos registrados en la cuenta corriente del proveedor: eliminá primero esos pagos', v_baja.descripcion;
    end if;
    -- Lo pendiente que colgaba del saldo se va con él; la seña (de la planilla) queda suelta.
    update public.transacciones set eliminado_en = now()
    where parte_de = v_baja.id and eliminado_en is null and planilla_ref is null;
    update public.transacciones set parte_de = null
    where parte_de = v_baja.id and eliminado_en is null;
    update public.transacciones set eliminado_en = now(), proveedor_id = null where id = v_baja.id;
  end loop;
end
$$;

revoke execute on function public.sincronizar_planilla(uuid, jsonb) from public, anon;
grant execute on function public.sincronizar_planilla(uuid, jsonb) to authenticated;

-- Los movimientos que vienen de la planilla de un evento se editan en la planilla,
-- no desde la cuenta corriente (si no, la planilla y la cuenta dejarían de coincidir).
create or replace function public.planilla_bloquea_cargo(p_transaccion_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.transacciones where id = p_transaccion_id and planilla_ref is not null) then
    raise exception 'Este movimiento viene de la planilla del evento: cambialo desde la planilla';
  end if;
end
$$;
revoke execute on function public.planilla_bloquea_cargo(uuid) from public, anon, authenticated;

create or replace function public.editar_cargo_cuenta(p_transaccion_id uuid, p_cambios jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.planilla_bloquea_cargo(p_transaccion_id);
  perform public.editar_cargo(p_transaccion_id, p_cambios);
end
$$;
revoke execute on function public.editar_cargo_cuenta(uuid, jsonb) from public, anon;
grant execute on function public.editar_cargo_cuenta(uuid, jsonb) to authenticated;

create or replace function public.borrar_cargo_cuenta(p_transaccion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.planilla_bloquea_cargo(p_transaccion_id);
  perform public.borrar_cargo(p_transaccion_id);
end
$$;
revoke execute on function public.borrar_cargo_cuenta(uuid) from public, anon;
grant execute on function public.borrar_cargo_cuenta(uuid) to authenticated;

-- Desde la app solo se llaman las versiones que verifican el origen.
revoke execute on function public.editar_cargo(uuid, jsonb) from authenticated;
revoke execute on function public.borrar_cargo(uuid) from authenticated;
