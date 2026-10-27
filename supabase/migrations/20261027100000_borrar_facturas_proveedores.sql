-- Borrar facturas recibidas: el movimiento de Financiero y las entradas de
-- stock que generó dejan de apuntar a la factura (la app los anula antes).
alter table public.transacciones drop constraint if exists transacciones_factura_id_fkey;
alter table public.transacciones
  add constraint transacciones_factura_id_fkey foreign key (factura_id) references public.facturas (id) on delete set null;
alter table public.movimientos_stock drop constraint if exists movimientos_stock_factura_id_fkey;
alter table public.movimientos_stock
  add constraint movimientos_stock_factura_id_fkey foreign key (factura_id) references public.facturas (id) on delete set null;

-- Proveedores: los que facturan a la productora (se relacionan con las
-- facturas recibidas por CUIT).
create table if not exists public.proveedores (
  id              uuid primary key default gen_random_uuid(),
  cuit            text unique check (cuit is null or cuit ~ '^\d{11}$'),
  razon_social    text not null check (length(trim(razon_social)) > 0),
  contacto        text,
  telefono        text,
  email           text,
  alias_cbu       text,
  notas           text,
  activo          boolean not null default true,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

drop trigger if exists proveedores_autoria on public.proveedores;
create trigger proveedores_autoria before insert or update on public.proveedores
  for each row execute function public.marcar_autoria();
drop trigger if exists proveedores_auditoria on public.proveedores;
create trigger proveedores_auditoria after insert or update or delete on public.proveedores
  for each row execute function public.registrar_auditoria();

alter table public.proveedores enable row level security;
drop policy if exists "proveedores: ver" on public.proveedores;
create policy "proveedores: ver" on public.proveedores for select to authenticated
  using ((select public.tiene_permiso('facturas', 'ver')));
drop policy if exists "proveedores: crear" on public.proveedores;
create policy "proveedores: crear" on public.proveedores for insert to authenticated
  with check ((select public.tiene_permiso('facturas', 'editar')));
drop policy if exists "proveedores: editar" on public.proveedores;
create policy "proveedores: editar" on public.proveedores for update to authenticated
  using ((select public.tiene_permiso('facturas', 'editar')))
  with check ((select public.tiene_permiso('facturas', 'editar')));
drop policy if exists "proveedores: borrar" on public.proveedores;
create policy "proveedores: borrar" on public.proveedores for delete to authenticated
  using ((select public.tiene_permiso('facturas', 'editar')));

revoke all on public.proveedores from anon;
revoke truncate on public.proveedores from authenticated;

-- Los proveedores de las facturas ya subidas (uno por CUIT, con la razón social más reciente).
insert into public.proveedores (cuit, razon_social)
select distinct on (regexp_replace(cuit_emisor, '\D', '', 'g'))
  regexp_replace(cuit_emisor, '\D', '', 'g'),
  coalesce(nullif(trim(razon_social_emisor), ''), 'Proveedor ' || regexp_replace(cuit_emisor, '\D', '', 'g'))
from public.facturas
where regexp_replace(coalesce(cuit_emisor, ''), '\D', '', 'g') ~ '^\d{11}$'
order by regexp_replace(cuit_emisor, '\D', '', 'g'), creado_en desc
on conflict (cuit) do nothing;
