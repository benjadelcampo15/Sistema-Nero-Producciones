-- Eventos → Financiero solo al CERRAR el evento (Nero y Ruta).
--
-- Mientras el evento está planificado, en curso o cancelado, la planilla se
-- guarda en el evento y no toca Financiero. Al cerrarlo se sincronizan sus
-- ingresos y gastos (cada renglón con su referencia: nunca se duplica). Si un
-- evento cerrado se reabre o se cancela, sus movimientos PENDIENTES que salieron
-- de la planilla se "pausan": dejan de contar en Financiero (quedan dados de baja
-- y marcados en_pausa) y al volver a cerrarlo se recuperan los mismos. Lo que ya
-- se pagó o cobró (señas, cobros, pagos desde la cuenta corriente) no se toca.

alter table public.transacciones add column if not exists en_pausa boolean not null default false;

-- Estado de la sincronización del evento con Financiero.
alter table public.eventos add column if not exists sync_estado text not null default 'pendiente';
alter table public.eventos drop constraint if exists eventos_sync_estado_check;
alter table public.eventos add constraint eventos_sync_estado_check check (sync_estado in ('pendiente', 'sincronizado', 'error'));
alter table public.eventos add column if not exists sync_error text;
alter table public.eventos add column if not exists sync_en timestamptz;

-- Pausa los movimientos pendientes de la planilla del evento que no tienen nada pagado.
-- Devuelve cuántos se pausaron y cuántos quedaron (por tener pagos o cobros reales).
create or replace function public.eventos_pausar_planilla(p_evento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pausados int;
  v_quedan int;
begin
  -- La seña (ya pagada) que colgaba del saldo queda suelta (al cerrar se vuelve a unir).
  update public.transacciones h set parte_de = null
  where h.evento_id = p_evento_id and h.planilla_ref is not null and h.eliminado_en is null
    and h.parte_de in (
      select t.id from public.transacciones t
      where t.evento_id = p_evento_id and t.planilla_ref is not null and t.eliminado_en is null and t.estado = 'pendiente' and t.pago_id is null
        and not exists (select 1 from public.transacciones x where x.parte_de = t.id and x.eliminado_en is null and x.planilla_ref is null)
        and not exists (select 1 from public.pago_aplicaciones a where a.transaccion_id = t.id or a.dividida_de = t.id)
    );
  update public.transacciones t set eliminado_en = now(), en_pausa = true
  where t.evento_id = p_evento_id and t.planilla_ref is not null and t.eliminado_en is null and t.estado = 'pendiente' and t.pago_id is null
    and not exists (select 1 from public.transacciones x where x.parte_de = t.id and x.eliminado_en is null and x.planilla_ref is null)
    and not exists (select 1 from public.pago_aplicaciones a where a.transaccion_id = t.id or a.dividida_de = t.id);
  get diagnostics v_pausados = row_count;
  select count(*) into v_quedan from public.transacciones where evento_id = p_evento_id and planilla_ref is not null and eliminado_en is null;
  return jsonb_build_object('pausados', v_pausados, 'quedan', v_quedan);
end
$$;
revoke execute on function public.eventos_pausar_planilla(uuid) from public, anon, authenticated;

-- Cambia el estado del evento. Al reabrir o cancelar un evento cerrado, pausa lo pendiente de su planilla.
-- (La sincronización al cerrar la hace la app con sincronizar_planilla, que arma los movimientos.)
create or replace function public.cambiar_estado_evento(p_evento_id uuid, p_estado public.estado_evento)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evento public.eventos;
  v_r jsonb := '{}';
begin
  if not public.tiene_permiso('eventos', 'editar') then raise exception 'No tenés permiso para editar eventos'; end if;
  select * into v_evento from public.eventos where id = p_evento_id for update;
  if not found then raise exception 'El evento no existe'; end if;
  update public.eventos set estado = p_estado where id = p_evento_id;
  if p_estado <> 'cerrado' then
    if v_evento.planilla_en_financiero then
      v_r := public.eventos_pausar_planilla(p_evento_id);
    end if;
    update public.eventos set sync_estado = 'pendiente', sync_error = null where id = p_evento_id;
  end if;
  return v_r;
end
$$;
revoke execute on function public.cambiar_estado_evento(uuid, public.estado_evento) from public, anon;
grant execute on function public.cambiar_estado_evento(uuid, public.estado_evento) to authenticated;

-- Resultado de la sincronización al cerrar (o al editar un evento cerrado).
create or replace function public.marcar_sync_evento(p_evento_id uuid, p_ok boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('eventos', 'editar') then raise exception 'No tenés permiso para editar eventos'; end if;
  update public.eventos
  set sync_estado = case when p_ok then 'sincronizado' else 'error' end,
      sync_error = case when p_ok then null else left(p_error, 500) end,
      sync_en = case when p_ok then now() else sync_en end
  where id = p_evento_id;
end
$$;
revoke execute on function public.marcar_sync_evento(uuid, boolean, text) from public, anon;
grant execute on function public.marcar_sync_evento(uuid, boolean, text) to authenticated;

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
  -- Solo los eventos cerrados pasan a Financiero.
  if v_evento.estado <> 'cerrado' then
    raise exception 'El evento no está cerrado: sus ingresos y gastos pasan a Financiero al cerrarlo';
  end if;
  -- Lo que se pausó al reabrir el evento vuelve (el mismo movimiento, no uno nuevo).
  update public.transacciones t set eliminado_en = null, en_pausa = false
  where t.evento_id = p_evento_id and t.en_pausa and t.eliminado_en is not null
    and not exists (
      select 1 from public.transacciones x
      where x.evento_id = p_evento_id and x.planilla_ref = t.planilla_ref and x.eliminado_en is null
    );
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

-- ─── Eventos existentes ─────────────────────────────────────────────────
-- Cerrados: quedan como están (ya sincronizados). Planificados, en curso y
-- cancelados que ya mandaron movimientos: se pausa lo pendiente sin pagos (no se
-- borra nada; vuelve al cerrarlos). Lo pagado o cobrado sigue en Financiero.
-- Los cambios quedan en auditoría (trigger de transacciones).
do $$
declare
  e record;
  v_r jsonb;
  v_eventos int := 0;
  v_pausados int := 0;
begin
  update public.eventos set sync_estado = 'sincronizado', sync_en = now() where planilla_en_financiero and estado = 'cerrado';
  for e in select id from public.eventos where planilla_en_financiero and estado <> 'cerrado' loop
    v_r := public.eventos_pausar_planilla(e.id);
    if (v_r ->> 'pausados')::int > 0 then
      v_eventos := v_eventos + 1;
      v_pausados := v_pausados + (v_r ->> 'pausados')::int;
    end if;
  end loop;
  raise notice 'Regularización: % eventos sin cerrar, % movimientos pendientes pausados', v_eventos, v_pausados;
end $$;
