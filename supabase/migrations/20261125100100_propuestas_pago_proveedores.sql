-- Propuesta de pagos: sugerir proveedores cargados (nombre y alias / CBU) al agregar un pago.
create or replace function public.proveedores_para_propuesta()
returns table (nombre text, alias_cbu text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.razon_social, p.alias_cbu from public.proveedores p
  where public.tiene_permiso('financiero', 'editar') and p.activo
  order by p.razon_social;
$$;
revoke execute on function public.proveedores_para_propuesta() from public, anon;
grant execute on function public.proveedores_para_propuesta() to authenticated;
