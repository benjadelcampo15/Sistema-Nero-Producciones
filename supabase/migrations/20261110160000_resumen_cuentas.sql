-- Saldo pendiente de cada cuenta corriente (proveedor o cliente) con una empresa,
-- calculado en la base: un solo viaje y sin el tope de filas por consulta.
--
-- Cada movimiento se atribuye a su ficha por su movimiento original
-- (coalesce(parte_de, id)): por la factura del proveedor (CUIT), por el
-- comprobante emitido al cliente, o porque se cargó a mano en la cuenta (este
-- último manda si hubiera dos).
create or replace function public.resumen_cuentas(p_tipo text, p_empresa text)
returns table (ficha uuid, saldo numeric, movimientos integer)
language sql
stable
security definer
set search_path = ''
as $$
  with duenios as (
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
  )
  select d.ficha, coalesce(sum(m.monto) filter (where m.estado = 'pendiente'), 0), count(*)::integer
  from public.transacciones m
  join duenio d on d.raiz = coalesce(m.parte_de, m.id)
  where m.empresa = p_empresa
    and m.estado <> 'proyectado'
    and m.eliminado_en is null
    and (
      (p_tipo = 'pago' and ((select public.tiene_permiso('facturas', 'ver')) or (select public.tiene_permiso('financiero', 'ver'))))
      or (p_tipo = 'cobro' and ((select public.tiene_permiso('facturar', 'ver')) or (select public.tiene_permiso('financiero', 'ver'))))
    )
  group by d.ficha;
$$;

revoke execute on function public.resumen_cuentas(text, text) from public, anon;
grant execute on function public.resumen_cuentas(text, text) to authenticated;
