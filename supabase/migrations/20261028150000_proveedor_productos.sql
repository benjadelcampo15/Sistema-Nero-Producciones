-- Catálogo de cada mayorista: qué productos se le pueden pedir y a qué precio.
-- Al guardar un pedido, sus productos se suman al catálogo de ese mayorista.

create table if not exists public.proveedor_productos (
  proveedor_id    uuid not null references public.proveedores (id) on delete cascade,
  producto_id     uuid not null references public.productos (id) on delete cascade,
  precio          numeric(14, 2) check (precio is null or precio >= 0),
  actualizado_en  timestamptz not null default now(),
  primary key (proveedor_id, producto_id)
);

create index if not exists proveedor_productos_producto_idx on public.proveedor_productos (producto_id);

drop trigger if exists proveedor_productos_auditoria on public.proveedor_productos;
create trigger proveedor_productos_auditoria after insert or update or delete on public.proveedor_productos
  for each row execute function public.registrar_auditoria();

alter table public.proveedor_productos enable row level security;

drop policy if exists "catalogo: ver" on public.proveedor_productos;
create policy "catalogo: ver" on public.proveedor_productos for select to authenticated
  using ((select public.tiene_permiso('stock', 'ver')));
drop policy if exists "catalogo: crear" on public.proveedor_productos;
create policy "catalogo: crear" on public.proveedor_productos for insert to authenticated
  with check ((select public.tiene_permiso('stock', 'editar')));
drop policy if exists "catalogo: editar" on public.proveedor_productos;
create policy "catalogo: editar" on public.proveedor_productos for update to authenticated
  using ((select public.tiene_permiso('stock', 'editar')))
  with check ((select public.tiene_permiso('stock', 'editar')));
drop policy if exists "catalogo: borrar" on public.proveedor_productos;
create policy "catalogo: borrar" on public.proveedor_productos for delete to authenticated
  using ((select public.tiene_permiso('stock', 'editar')));

revoke all on public.proveedor_productos from anon;
revoke truncate on public.proveedor_productos from authenticated;

-- Desde Stock también se corrigen los datos de contacto del mayorista.
drop policy if exists "proveedores: editar desde stock" on public.proveedores;
create policy "proveedores: editar desde stock" on public.proveedores for update to authenticated
  using ((select public.tiene_permiso('stock', 'editar')))
  with check ((select public.tiene_permiso('stock', 'editar')));
