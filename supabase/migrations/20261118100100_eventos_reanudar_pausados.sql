-- Un movimiento eliminado sigue sin poder editarse, con una excepción más: los
-- que se pausaron al reabrir un evento cerrado pueden volver (al cerrarlo otra vez),
-- siempre que lo único que cambie sea la pausa (después se actualizan como siempre).
create or replace function public.proteger_eliminadas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.eliminado_en is not null then
    -- Reanudar un movimiento pausado: solo cambia la baja y la pausa.
    if old.en_pausa and not new.en_pausa and new.eliminado_en is null
       and (to_jsonb(new) - 'eliminado_en' - 'eliminado_por' - 'en_pausa' - 'actualizado_en')
         = (to_jsonb(old) - 'eliminado_en' - 'eliminado_por' - 'en_pausa' - 'actualizado_en') then
      new.eliminado_por := null;
      return new;
    end if;
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
