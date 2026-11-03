-- Editar un movimiento (deuda sin factura) de una cuenta corriente.
--
-- Sin pagos se puede cambiar todo. Con pagos, solo el detalle y la categoría:
-- el monto y la fecha quedan fijos hasta anular los pagos, para que el saldo y
-- lo que ya está en Financiero no dejen de coincidir.

-- p_cambios: { detalle, categoria_id, monto, fecha }
create or replace function public.editar_cargo(p_transaccion_id uuid, p_cambios jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.transacciones;
  v_con_pagos boolean;
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

  v_con_pagos := t.estado <> 'pendiente' or exists (select 1 from public.transacciones where parte_de = t.id and eliminado_en is null);
  if v_con_pagos then
    update public.transacciones
    set descripcion = p_cambios ->> 'detalle', categoria_id = (p_cambios ->> 'categoria_id')::uuid
    where (id = t.id or parte_de = t.id) and eliminado_en is null;
  else
    update public.transacciones
    set descripcion = p_cambios ->> 'detalle',
        categoria_id = (p_cambios ->> 'categoria_id')::uuid,
        monto = (p_cambios ->> 'monto')::numeric,
        fecha = (p_cambios ->> 'fecha')::date
    where id = t.id;
  end if;
end
$$;

revoke execute on function public.editar_cargo(uuid, jsonb) from public, anon;
grant execute on function public.editar_cargo(uuid, jsonb) to authenticated;
