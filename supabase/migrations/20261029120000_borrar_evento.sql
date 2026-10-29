-- Borrar un evento (solo administradores).
--
-- Lo que es del evento se va con él (pólizas, convocados, planilla, living).
-- Lo que tiene vida propia queda, sin evento: movimientos de plata, de stock,
-- salidas, comprobantes, presupuestos y cheques.

-- Una transacción eliminada sigue sin poder editarse, salvo que se le saque la
-- referencia a la factura (si se borra la factura) o al evento (si se borra el evento).
create or replace function public.proteger_eliminadas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.eliminado_en is not null then
    if (to_jsonb(new) - 'factura_id' - 'evento_id' - 'actualizado_en' - 'creado_por' - 'creado_en')
         = (to_jsonb(old) - 'factura_id' - 'evento_id' - 'actualizado_en' - 'creado_por' - 'creado_en')
       and (new.factura_id is null or new.factura_id is not distinct from old.factura_id)
       and (new.evento_id is null or new.evento_id is not distinct from old.evento_id) then
      return new;
    end if;
    raise exception 'El movimiento está eliminado y no se puede modificar';
  end if;
  if new.eliminado_en is not null then
    new.eliminado_por := auth.uid();
  end if;
  return new;
end
$$;

create or replace function public.borrar_evento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede borrar eventos';
  end if;

  update public.transacciones set evento_id = null where evento_id = p_id;
  update public.movimientos_stock set evento_id = null where evento_id = p_id;
  update public.salidas_stock set evento_id = null where evento_id = p_id;
  update public.comprobantes_emitidos set evento_id = null where evento_id = p_id;
  update public.presupuestos set evento_id = null where evento_id = p_id;
  update public.cheques set evento_id = null where evento_id = p_id;
  delete from public.polizas where evento_id = p_id;
  delete from public.convocados where evento_id = p_id;

  delete from public.eventos where id = p_id;
  if not found then
    raise exception 'El evento no existe';
  end if;
end
$$;

revoke execute on function public.borrar_evento(uuid) from public, anon;
grant execute on function public.borrar_evento(uuid) to authenticated;
