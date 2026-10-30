-- La planilla de los eventos nuevos se refleja en Financiero.
--
-- En los eventos creados desde ahora, cada ingreso y cada gasto de la planilla
-- es un movimiento de Financiero del evento (y de su empresa): al guardar la
-- planilla se crean, se actualizan o se dan de baja. Así el balance del evento
-- en Financiero es el de la planilla. Los eventos de antes siguen como estaban.

alter table public.eventos add column if not exists planilla_en_financiero boolean not null default false;
alter table public.eventos alter column planilla_en_financiero set default true;

-- De qué renglón de la planilla viene el movimiento ("ingreso:<id>", "gasto:<id>:sena"…).
alter table public.transacciones add column if not exists planilla_ref text;
create unique index if not exists transacciones_planilla_ref_idx
  on public.transacciones (evento_id, planilla_ref)
  where planilla_ref is not null and eliminado_en is null;

-- p_movimientos: [{ ref, tipo, monto, fecha, descripcion, categoria_id, estado, facturado, iva }]
create or replace function public.sincronizar_planilla(p_evento_id uuid, p_movimientos jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evento public.eventos;
  m jsonb;
  v_refs text[] := '{}';
  v_actual public.transacciones;
begin
  if not (select public.tiene_permiso('eventos', 'editar')) then
    raise exception 'No tenés permiso para editar eventos';
  end if;
  select * into v_evento from public.eventos where id = p_evento_id;
  if not found or not v_evento.planilla_en_financiero then
    return;
  end if;

  for m in select * from jsonb_array_elements(coalesce(p_movimientos, '[]'::jsonb)) loop
    v_refs := v_refs || (m ->> 'ref');
    select * into v_actual from public.transacciones
    where evento_id = p_evento_id and planilla_ref = m ->> 'ref' and eliminado_en is null
    for update;

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

  -- Lo que se sacó de la planilla se da de baja en Financiero.
  update public.transacciones
  set eliminado_en = now()
  where evento_id = p_evento_id
    and planilla_ref is not null
    and eliminado_en is null
    and not (planilla_ref = any (v_refs));
end
$$;

revoke execute on function public.sincronizar_planilla(uuid, jsonb) from public, anon;
grant execute on function public.sincronizar_planilla(uuid, jsonb) to authenticated;
