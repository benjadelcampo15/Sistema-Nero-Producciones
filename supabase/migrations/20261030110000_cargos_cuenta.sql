-- Cargos a mano en las cuentas corrientes: lo que se debe sin factura.
--
-- No todo se factura: desde la ficha de un proveedor o cliente se puede cargar
-- una deuda (monto, fecha y detalle). Queda como un movimiento pendiente en
-- Financiero, vinculado a la ficha, y se paga o cobra como cualquier factura.

alter table public.transacciones
  add column if not exists proveedor_id uuid references public.proveedores (id) on delete set null,
  add column if not exists cliente_id uuid references public.clientes (id) on delete set null;

create index if not exists transacciones_proveedor_idx on public.transacciones (proveedor_id) where proveedor_id is not null;
create index if not exists transacciones_cliente_idx on public.transacciones (cliente_id) where cliente_id is not null;

-- La cuenta corriente suma los cargos a mano a las facturas.
create or replace function public.movimientos_de_cuenta(p_tipo text, p_id uuid, p_empresa text)
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
    -- El CUIT de la factura puede tener guiones.
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
    and t.empresa = p_empresa
    and (
      (p_tipo = 'pago' and ((select public.tiene_permiso('facturas', 'ver')) or (select public.tiene_permiso('financiero', 'ver'))))
      or (p_tipo = 'cobro' and ((select public.tiene_permiso('facturar', 'ver')) or (select public.tiene_permiso('financiero', 'ver'))))
    );
$$;

-- p_cargo: { tipo ('pago' = le debemos al proveedor, 'cobro' = nos debe el cliente), id, empresa, fecha, monto, detalle, categoria_id }
create or replace function public.cargar_cuenta(p_cargo jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text := p_cargo ->> 'tipo';
  v_id uuid := (p_cargo ->> 'id')::uuid;
  v_nombre text;
  v_nuevo uuid;
begin
  if v_tipo not in ('pago', 'cobro') or (p_cargo ->> 'empresa') not in ('nero', 'ruta') then
    raise exception 'Datos del cargo inválidos';
  end if;
  if not (
    (select public.tiene_permiso('financiero', 'editar'))
    or (v_tipo = 'pago' and (select public.tiene_permiso('facturas', 'editar')))
    or (v_tipo = 'cobro' and (select public.tiene_permiso('facturar', 'editar')))
  ) then
    raise exception 'No tenés permiso para cargar deudas';
  end if;
  if v_tipo = 'pago' then
    select razon_social into v_nombre from public.proveedores where id = v_id;
  else
    select razon_social into v_nombre from public.clientes where id = v_id;
  end if;
  if v_nombre is null then
    raise exception 'No existe';
  end if;

  insert into public.transacciones (
    empresa, tipo, monto, fecha, descripcion, categoria_id, contraparte, medio_pago, estado, facturado, notas, proveedor_id, cliente_id
  ) values (
    p_cargo ->> 'empresa',
    case when v_tipo = 'pago' then 'egreso' else 'ingreso' end::public.tipo_movimiento,
    (p_cargo ->> 'monto')::numeric,
    (p_cargo ->> 'fecha')::date,
    p_cargo ->> 'detalle',
    (p_cargo ->> 'categoria_id')::uuid,
    v_nombre,
    'transferencia',
    'pendiente',
    false,
    'Cargo en cuenta corriente (sin factura)',
    case when v_tipo = 'pago' then v_id end,
    case when v_tipo = 'cobro' then v_id end
  )
  returning id into v_nuevo;
  return v_nuevo;
end
$$;

-- Borrar un cargo a mano que todavía no tiene nada pagado (queda en eliminados de Financiero).
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
    raise exception 'El cargo no existe';
  end if;
  if not (
    (select public.tiene_permiso('financiero', 'editar'))
    or (t.proveedor_id is not null and (select public.tiene_permiso('facturas', 'editar')))
    or (t.cliente_id is not null and (select public.tiene_permiso('facturar', 'editar')))
  ) then
    raise exception 'No tenés permiso para borrar cargos';
  end if;
  if t.estado <> 'pendiente' or exists (select 1 from public.transacciones where parte_de = t.id and eliminado_en is null) then
    raise exception 'El cargo ya tiene pagos: anulalos primero';
  end if;
  update public.transacciones set eliminado_en = now() where id = t.id;
end
$$;

revoke execute on function public.cargar_cuenta(jsonb) from public, anon;
revoke execute on function public.borrar_cargo(uuid) from public, anon;
grant execute on function public.cargar_cuenta(jsonb) to authenticated;
grant execute on function public.borrar_cargo(uuid) to authenticated;
