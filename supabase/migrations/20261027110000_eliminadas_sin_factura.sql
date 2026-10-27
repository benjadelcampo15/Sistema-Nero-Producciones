-- Una transacción eliminada sigue sin poder editarse, salvo un único cambio:
-- que se borre la factura de la que vino (la base le saca la referencia).
create or replace function public.proteger_eliminadas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.eliminado_en is not null then
    if old.factura_id is not null and new.factura_id is null
       and (to_jsonb(new) - 'factura_id' - 'actualizado_en' - 'creado_por' - 'creado_en')
         = (to_jsonb(old) - 'factura_id' - 'actualizado_en' - 'creado_por' - 'creado_en') then
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
